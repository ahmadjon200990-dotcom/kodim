import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const figmaApiBase = Deno.env.get("FIGMA_API_BASE") ?? "https://api.figma.com";
const figmaSecretKey = Deno.env.get("FIGMA_ENCRYPTION_KEY");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function requireUser(req: Request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new Error("Missing Supabase configuration");
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? "",
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    throw new Error("UNAUTHORIZED");
  }

  return data.user;
}

async function encryptSecret(value: string, secret: string) {
  const keyBytes = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(value));
  return JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) });
}

async function decryptSecret(value: string, secret: string) {
  const payload = JSON.parse(value) as { iv?: number[]; data?: number[] };
  const iv = Uint8Array.from(payload.iv ?? []);
  const data = Uint8Array.from(payload.data ?? []);
  const keyBytes = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, data);
  return new TextDecoder().decode(decrypted);
}

async function figmaFetch<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${figmaApiBase}${path}`, {
    headers: { "X-Figma-Token": token },
    signal: AbortSignal.timeout(30_000),
  });

  if (response.ok) {
    return (await response.json()) as T;
  }

  const body = await response.json().catch(() => ({}));
  const text = `${(body as { err?: string; message?: string }).err ?? ""} ${(body as { err?: string; message?: string }).message ?? ""}`.trim();
  if (response.status === 401 || response.status === 403) {
    throw new Error(`BAD_TOKEN:${text || "Figma auth failed"}`);
  }
  if (response.status === 404) {
    throw new Error(`NOT_FOUND:${text || "Figma file not found"}`);
  }
  if (response.status === 429) {
    throw new Error(`RATE_LIMIT:${text || "Figma API limit"}`);
  }
  throw new Error(`NETWORK:${text || "Figma API error"}`);
}

function parseFigmaUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    const isFigmaHost = /(^|\.)figma\.com$/i.test(parsed.hostname);
    if (parsed.protocol !== "https:" || !isFigmaHost) return null;

    const match = /(?:\/file|\/design|\/proto|\/board)\/([A-Za-z0-9]{10,64})(?:\/|$)/.exec(parsed.pathname);
    if (!match?.[1]) return null;

    const branchMatch = /\/branch\/([A-Za-z0-9]{10,64})(?:\/|$)/.exec(parsed.pathname);
    const fileKey = branchMatch?.[1] ?? match[1];
    const nodeId = parsed.searchParams.get("node-id");
    return { fileKey, nodeId: nodeId && /^\d+[:-]\d+$/.test(nodeId) ? nodeId.replace("-", ":") : undefined };
  } catch {
    return null;
  }
}

type ServiceClient = ReturnType<typeof createClient>;
type FigmaSecretRow = {
  id?: string | null;
  encrypted_secret?: string | null;
  figma_handle?: string | null;
};

async function getTeacherSecret(serviceClient: ServiceClient, teacherId: string): Promise<FigmaSecretRow | null> {
  const result = await serviceClient
    .schema("private")
    .from("teacher_figma_secrets")
    .select("id, encrypted_secret, figma_handle")
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

async function getSafeSettings(serviceClient: ServiceClient, teacherId: string) {
  const teacher = await serviceClient
    .from("teachers")
    .select("figma_handle, figma_secret_id")
    .eq("id", teacherId)
    .maybeSingle();

  if (teacher.error) throw teacher.error;

  return {
    figma: {
      configured: Boolean(teacher.data?.figma_secret_id || teacher.data?.figma_handle),
      handle: teacher.data?.figma_handle ?? null,
    },
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json(500, { error: "Missing server configuration" });
    }

    const user = await requireUser(req);

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const payload = await req.json().catch(() => ({}));
    const action = typeof payload.action === "string" ? payload.action : "get";

    if (action === "get") {
      return json(200, await getSafeSettings(serviceClient, user.id));
    }

    if (action === "delete") {
      await serviceClient.schema("private").from("teacher_figma_secrets").delete().eq("teacher_id", user.id);
      await serviceClient
        .from("teachers")
        .update({ figma_handle: null, figma_secret_id: null })
        .eq("id", user.id);
      return json(200, { figma: { configured: false, handle: null } });
    }

    if (action === "save") {
      const token = String(payload.token ?? "").trim();
      if (!token || token.length < 20) {
        return json(400, { error: "Invalid token" });
      }

      if (!figmaSecretKey) {
        return json(500, { error: "FIGMA_ENCRYPTION_KEY missing" });
      }

      let me: { handle?: string; email?: string };
      try {
        me = await figmaFetch<{ handle?: string; email?: string }>(token, "/v1/me");
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error);
        if (/BAD_TOKEN/i.test(message)) return json(401, { error: "Figma token is invalid or expired" });
        if (/RATE_LIMIT/i.test(message)) return json(429, { error: "Figma API limit reached" });
        return json(400, { error: "Unable to validate Figma token" });
      }

      const encryptedSecret = await encryptSecret(token, figmaSecretKey);
      const handle = me.handle ?? `figma-${user.id.slice(0, 8)}`;
      const secretRow = await getTeacherSecret(serviceClient, user.id);

      if (secretRow) {
        await serviceClient.schema("private").from("teacher_figma_secrets").update({
          encrypted_secret: encryptedSecret,
          figma_handle: handle,
          updated_at: new Date().toISOString(),
        }).eq("teacher_id", user.id);
      } else {
        await serviceClient.schema("private").from("teacher_figma_secrets").insert({
          teacher_id: user.id,
          encrypted_secret: encryptedSecret,
          figma_handle: handle,
        });
      }

      const secretId = secretRow?.id ?? (await serviceClient.schema("private").from("teacher_figma_secrets").select("id").eq("teacher_id", user.id).maybeSingle()).data?.id;

      await serviceClient
        .from("teachers")
        .update({ figma_handle: handle, figma_secret_id: secretId })
        .eq("id", user.id);

      return json(200, { figma: { configured: true, handle } });
    }

    if (action === "refresh") {
      const examId = String(payload.examId ?? "");
      if (!examId) {
        return json(400, { error: "Missing examId" });
      }

      const exam = await serviceClient.from("exams").select("id, teacher_id").eq("id", examId).maybeSingle();
      if (exam.error || !exam.data) {
        return json(404, { error: "Exam not found" });
      }

      if (exam.data.teacher_id !== user.id) {
        return json(403, { error: "Forbidden" });
      }

      const settings = await getSafeSettings(serviceClient, user.id);
      if (!settings.figma.configured) {
        return json(200, []);
      }

      const secretRow = await getTeacherSecret(serviceClient, user.id);
      if (!secretRow || !figmaSecretKey) {
        return json(200, []);
      }

      const token = await decryptSecret(secretRow.encrypted_secret, figmaSecretKey);
      const tasks = await serviceClient.from("tasks").select("id, title, figma_url, type").eq("exam_id", examId);
      if (tasks.error) throw tasks.error;

      const results: Array<{ url: string; status: "READY" | "ERROR" | "MISSING"; error: string | null; errorText: string | null; fileName: string | null; frames: Array<{ id: string; name: string; width: number; height: number; hasImage: boolean }>; fetchedAt: string | null; cacheId: string | null }> = [];

      for (const task of tasks.data ?? []) {
        if (task.type !== "FIGMA" || !task.figma_url) continue;

        const parsed = parseFigmaUrl(task.figma_url);
        if (!parsed) {
          results.push({ url: task.figma_url, status: "ERROR", error: "BAD_LINK", errorText: "Figma havolasi noto'g'ri", fileName: task.title ?? null, frames: [], fetchedAt: new Date().toISOString(), cacheId: secretRow.id });
          continue;
        }

        try {
          const design = await figmaFetch<{ document?: { children?: Array<{ id: string; name: string; type?: string; absoluteBoundingBox?: { width: number; height: number } }> } }>(token, `/v1/files/${parsed.fileKey}?geometry=paths`);
          const frames = (design.document?.children ?? [])
            .filter((child) => child.type === "FRAME" || child.type === "COMPONENT" || child.type === "INSTANCE")
            .map((child) => ({
              id: child.id,
              name: child.name,
              width: Math.round(child.absoluteBoundingBox?.width ?? 0),
              height: Math.round(child.absoluteBoundingBox?.height ?? 0),
              hasImage: true,
            }));

          results.push({
            url: task.figma_url,
            status: "READY",
            error: null,
            errorText: null,
            fileName: task.title ?? null,
            frames,
            fetchedAt: new Date().toISOString(),
            cacheId: secretRow.id,
          });
        } catch (error) {
          const message = String(error instanceof Error ? error.message : error);
          results.push({
            url: task.figma_url,
            status: "ERROR",
            error: /BAD_TOKEN/i.test(message) ? "BAD_TOKEN" : /NOT_FOUND/i.test(message) ? "NOT_FOUND" : /RATE_LIMIT/i.test(message) ? "RATE_LIMIT" : "NETWORK",
            errorText: /BAD_TOKEN/i.test(message) ? "Figma tokeni yaroqsiz yoki muddati o'tgan." : /NOT_FOUND/i.test(message) ? "Figma fayli topilmadi." : /RATE_LIMIT/i.test(message) ? "Figma API limiti tugadi." : "Figma API bilan bog'lanishda xatolik yuz berdi.",
            fileName: task.title ?? null,
            frames: [],
            fetchedAt: new Date().toISOString(),
            cacheId: secretRow.id,
          });
        }
      }

      return json(200, results);
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (message === "UNAUTHORIZED") {
      return json(401, { error: "Unauthorized" });
    }
    return json(500, { error: message || "Figma settings error" });
  }
});
