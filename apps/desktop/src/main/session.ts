import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { isReadonlyPath, SYNC_LIMITS, TEMPLATE_RUNTIME } from "@exam-ide/shared";
import type { Database, EventType, ExamPublic, FileEntry, StudentState } from "@exam-ide/shared";
import type { ClientState, Result, RuntimeInfo } from "../common/api";
import { detectRuntime } from "./runtime";
import { store } from "./store";
import { uz } from "./uz";
import { sha1, Workspace } from "./workspace";

// Transport — Supabase (MIGRATION-PLAN.md 4-bo'lim): o'quvchi = anonim sessiya, holat o'zgartirish — RPC'lar
// (student_join, heartbeat, sync_files, report_event, submit_attempt, report_app_closed). Har 5 s heartbeat
// vaqtni sinxronlaydi va holat o'zgarishlarini (boshlandi / tugadi) beradi; Realtime "nudge" xabari uni darhol chaqiradi.

type Client = SupabaseClient<Database>;

interface PendingEvent {
  type: EventType;
  details: Record<string, unknown>;
  id: string | null;
  sent: boolean;
}

export interface EventHandle {
  /** Event tafsilotlarini to'ldirish (serverda o'sha event yangilanadi). */
  update(details: Record<string, unknown>): void;
}

type JoinResponse =
  | { ok: true; attemptId: string; exam: ExamPublic; state: StudentState }
  | { ok: false; error: "INVALID_INPUT" | "TOO_MANY" | "BAD_CODE" | "NAME_TAKEN"; retryAfterSec?: number };

const RPC_TIMEOUT_MS = 15_000;
const HEARTBEAT_MS = 5_000;
/** Login ekranida server holatini tekshirish oralig'i. */
const PING_MS = 10_000;
/** Bitta `sync_files` dagi taxminiy maksimal hajm. */
const SYNC_BATCH_BYTES = 5 * 1024 * 1024;

const NO_RUNTIME: RuntimeInfo = { node: false, npm: false, python: false };

const initialState: ClientState = {
  screen: "login",
  connected: false,
  exam: null,
  studentName: "",
  joinedCount: 0,
  endsAt: null,
  serverOffsetMs: 0,
  locked: false,
  workspaceVersion: 0,
  runtime: NO_RUNTIME,
};

/** Topshirilgandan keyin kod+ism ekraniga avtomatik qaytish (CLAUDE.md 0.5). */
const AUTO_RETURN_MS = 10_000;

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** RPC xatosi tarmoq/timeout tufaylimi (qayta urinish mumkin) yoki server rad etdimi. */
function isNetworkError(message: string): boolean {
  return /fetch failed|Failed to fetch|NetworkError|aborted|timeout|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message);
}

export interface SessionHooks {
  onStateChange(state: ClientState): void;
  /** Ish boshlandi (yangi yoki qayta kirish) — himoya va kuzatuvni yoqish uchun. */
  onWorking?(): void;
  /** Vaqt tugadi / topshirildi — terminal va dev serverlarni o'chirish uchun. */
  onLocked?(): void;
}

/** O'quvchi sessiyasi: Supabase, kutish xonasi, ish papkasi, avtosaqlash, topshirish. */
export class ExamSession {
  state: ClientState = { ...initialState };
  workspace: Workspace | null = null;

  /** Joriy Supabase manzili (login ekranidagi sozlama yoki build vaqtidagi standart). */
  serverUrl = store.serverUrl() ?? __SERVER_URL__;
  private sb: Client = this.makeClient();
  private creds: { code: string; name: string } | null = null;
  private attemptId: string | null = null;
  /** Serverga oxirgi yuborilgan holat: yo'l → sha1. */
  private synced = new Map<string, string>();
  private syncTimer: NodeJS.Timeout | null = null;
  private syncing: Promise<void> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  /** Realtime private kanallari: attempt:<id> va exam:<id>:students (nudge → darhol heartbeat). */
  private channels: RealtimeChannel[] = [];
  private pingTimer: NodeJS.Timeout | null = null;
  /** Serverda tasdiqlangan join bormi (eventlar shundan keyin yuboriladi). */
  private joined = false;
  private pendingEvents: PendingEvent[] = [];
  /** Read-only fayllarning asl tarkibi (yo'l → {tarkib, encoding}). */
  private readonlyFiles = new Map<string, { content: string; encoding?: "base64" }>();
  private autoReturnTimer: NodeJS.Timeout | null = null;

  /** Read-only faylning server bergan asl tarkibi (watcher tiklashi uchun). */
  readonlyContent(rel: string): { content: string; encoding?: "base64" } | null {
    return this.readonlyFiles.get(rel) ?? null;
  }

  /** Imtihonda ruxsat etilgan npm paketlar (UNKNOWN_PACKAGE tekshiruvi). */
  allowedPackages(): Set<string> {
    return new Set((this.state.exam?.allowedPackages ?? []).map((p) => p.toLowerCase()));
  }

  /** Terminalda ruxsat etilgan buyruq naqshlari (CLAUDE.md 3). */
  allowedCommands(): string[] {
    return this.state.exam?.allowedCommands ?? [];
  }

  /** Ruxsat etilgan terminal profillari (bo'sh — hammasi). */
  allowedShells(): string[] {
    return this.state.exam?.allowedShells ?? [];
  }

  constructor(private readonly hooks: SessionHooks) {
    this.startPing();
    void detectRuntime().then((runtime) => this.set({ runtime }));
  }

  private makeClient(): Client {
    return createClient<Database>(this.serverUrl, __SUPABASE_KEY__, {
      auth: {
        storage: store.authStorage,
        storageKey: "kodim-student",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  /** Server manzilini almashtirish (faqat login ekranida). */
  setServerUrl(url: string | null): Result {
    if (this.creds || this.state.screen !== "login") return { ok: false, error: uz.serverChangeLocked };
    store.setServerUrl(url ?? undefined);
    this.serverUrl = url ?? __SERVER_URL__;
    this.sb = this.makeClient();
    this.set({ connected: false });
    this.startPing();
    return { ok: true };
  }

  private set(patch: Partial<ClientState>): void {
    this.state = { ...this.state, ...patch };
    this.hooks.onStateChange(this.state);
  }

  private timeState(s: { endsAt: string | null; serverNow: string }): Partial<ClientState> {
    return { endsAt: s.endsAt, serverOffsetMs: Date.parse(s.serverNow) - Date.now() };
  }

  /** RPC chaqiruvi: {data} yoki {error: matn, network: tarmoq xatosimi}. */
  private async rpc<T>(fn: keyof Database["public"]["Functions"], args: Record<string, unknown>): Promise<{ data: T } | { error: string; network: boolean }> {
    try {
      const { data, error } = await (this.sb.rpc as unknown as (f: string, a: object) => { abortSignal(s: AbortSignal): PromiseLike<{ data: unknown; error: { message: string } | null }> })(fn, args)
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
      if (error) return { error: error.message, network: isNetworkError(error.message) };
      return { data: data as T };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: message, network: true };
    }
  }

  // ---------- Server holati (login ekrani) ----------

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ping = async () => {
      if (this.heartbeatTimer) return; // ish davomida — heartbeat
      try {
        const res = await fetch(`${this.serverUrl}/auth/v1/health`, {
          headers: { apikey: __SUPABASE_KEY__ },
          signal: AbortSignal.timeout(6000),
        });
        this.set({ connected: res.ok });
      } catch {
        this.set({ connected: false });
      }
    };
    void ping();
    this.pingTimer = setInterval(() => void ping(), PING_MS);
  }

  // ---------- Kirish ----------

  async join(code: string, name: string): Promise<Result> {
    const saved = store.session(code);
    const sameName = saved && normalizeName(saved.name) === normalizeName(name);
    // Boshqa ism — boshqa o'quvchi: yangi anonim kimlik (oldingi o'quvchining ishiga tegmaslik uchun).
    if (!sameName) await this.sb.auth.signOut({ scope: "local" }).catch(() => undefined);
    const { data } = await this.sb.auth.getSession();
    if (!data.session) {
      const signed = await this.sb.auth.signInAnonymously().catch((e: unknown) => ({ error: e as Error }));
      if (signed.error) return { ok: false, error: isNetworkError(signed.error.message) ? uz.notConnected : signed.error.message };
    }

    const res = await this.rpc<JoinResponse>("student_join", { p_code: code, p_name: name, p_device_id: store.deviceId() });
    if ("error" in res) return { ok: false, error: res.network ? uz.notConnected : res.error };
    const j = res.data;
    if (!j.ok) {
      const error =
        j.error === "BAD_CODE" ? uz.badExamCode
        : j.error === "NAME_TAKEN" ? uz.nameTaken
        : j.error === "TOO_MANY" ? uz.joinTooMany(Math.max(1, Math.ceil((j.retryAfterSec ?? 60) / 60)))
        : uz.invalidJoin;
      return { ok: false, error };
    }
    this.creds = { code, name };
    this.joined = true;
    this.attemptId = j.attemptId;
    store.saveSession(code, { attemptId: j.attemptId, name });
    this.set({ connected: true });
    await this.apply(j.attemptId, j.exam, j.state);
    this.startHeartbeat();
    void this.subscribe(j.attemptId, j.exam.id);
    this.flushEvents();
    return { ok: true };
  }

  private async apply(attemptId: string, exam: ExamPublic, state: StudentState): Promise<void> {
    this.set({
      exam,
      studentName: this.creds?.name ?? "",
      joinedCount: state.joinedCount,
      ...(state.endsAt && this.timeState(state)),
    });
    if (state.phase === "LOBBY") this.set({ screen: "lobby" });
    else if (state.phase === "WORKING") {
      await this.startWorking(attemptId, state.files ?? []);
      // Topshirish jarayonida qayta kirdi — oxirgi sync va qulflash.
      if (state.ending) void this.end();
    } else this.set({ screen: "submitted", locked: true });
  }

  /** Jonli xabarlar: holat o'zgarsa server "nudge" yuboradi — heartbeat darhol (5 s kutmasdan). */
  private async subscribe(attemptId: string, examId: string): Promise<void> {
    await this.unsubscribe();
    await this.sb.realtime.setAuth();
    const nudge = () => void this.heartbeat();
    this.channels = [
      this.sb.channel(`attempt:${attemptId}`, { config: { private: true } }).on("broadcast", { event: "nudge" }, nudge),
      this.sb
        .channel(`exam:${examId}:students`, { config: { private: true } })
        .on("broadcast", { event: "nudge" }, nudge)
        .on("broadcast", { event: "lobby:count" }, ({ payload }) => {
          const n = (payload as { joinedCount?: unknown }).joinedCount;
          if (typeof n === "number") this.set({ joinedCount: n });
        }),
    ];
    // Qayta ulanganda (internet qaytdi) o'tkazib yuborilgan o'zgarish bo'lishi mumkin — holatni so'raymiz.
    for (const ch of this.channels) ch.subscribe((status) => status === "SUBSCRIBED" && nudge());
  }

  private async unsubscribe(): Promise<void> {
    const list = this.channels;
    this.channels = [];
    await Promise.all(list.map((ch) => this.sb.removeChannel(ch).catch(() => undefined)));
  }

  private startHeartbeat(): void {
    this.heartbeatTimer ??= setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** "Tirikman" + vaqt sinxroni + holat o'zgarishlari (kutish → ish, ish → tugadi). */
  private async heartbeat(): Promise<void> {
    const attemptId = this.attemptId;
    if (!attemptId) return;
    const res = await this.rpc<StudentState>("heartbeat", { p_attempt_id: attemptId });
    if (attemptId !== this.attemptId) return;
    if ("error" in res) {
      if (res.network) {
        this.joined = false;
        this.set({ connected: false });
      } else if (/NOT_FOUND/.test(res.error)) {
        // Ish boshqa kompyuterga o'tgan yoki imtihon o'chirilgan — bu kompyuterda davom etib bo'lmaydi.
        if (this.state.screen === "workspace") await this.end();
        else await this.resetToLogin();
      }
      return;
    }
    const s = res.data;
    if (!this.joined) {
      this.joined = true;
      this.flushEvents();
    }
    this.set({ connected: true, joinedCount: s.joinedCount, ...(s.endsAt && this.timeState(s)) });
    await this.onServerState(s);
  }

  /** Server holatiga moslashish (heartbeat yoki Realtime xabaridan keyin). */
  private async onServerState(s: StudentState): Promise<void> {
    if (s.phase === "WORKING" && this.state.screen === "lobby" && this.attemptId) {
      const full = await this.rpc<StudentState>("student_state", { p_attempt_id: this.attemptId, p_with_files: true });
      if ("data" in full && full.data.phase === "WORKING") {
        if (full.data.endsAt) this.set(this.timeState(full.data));
        await this.startWorking(this.attemptId, full.data.files ?? []);
      }
      return;
    }
    if ((s.ending || s.phase === "SUBMITTED") && this.state.screen === "workspace") await this.end();
  }

  private async startWorking(attemptId: string, files: FileEntry[]): Promise<void> {
    if (this.state.locked) return;
    if (this.workspace?.root !== new Workspace(attemptId).root) this.workspace = new Workspace(attemptId);
    await this.workspace.init(files);
    // Read-only fayllarning asl tarkibi (READONLY_TAMPER tiklashi uchun).
    this.readonlyFiles = new Map(
      files.filter((f) => isReadonlyPath(f.path)).map((f) => [f.path, { content: f.content, encoding: f.encoding }]),
    );
    // Server bilgan holat — faqat undan farqlar yuboriladi.
    this.synced = new Map(files.map((f) => [f.path, sha1(f.content)]));
    this.set({ screen: "workspace", workspaceVersion: this.state.workspaceVersion + 1 });
    this.syncTimer ??= setInterval(() => void this.sync(), SYNC_LIMITS.intervalMs);
    this.hooks.onWorking?.();
    this.checkRuntime();
    void this.sync();
  }

  /** Imtihon shabloni talab qilgan muhit kompyuterda yo'q bo'lsa — o'quvchiga va o'qituvchiga xabar. */
  private envReported = false;
  private checkRuntime(): void {
    if (this.envReported) return;
    const template = this.state.exam?.template;
    const need = template ? TEMPLATE_RUNTIME[template] : null;
    if (!need) return;
    const r = this.state.runtime;
    const missing: string[] = [];
    if (need === "node" && (!r.node || !r.npm)) missing.push(r.node ? "npm" : "node");
    if (need === "python" && !r.python) missing.push("python");
    if (missing.length) {
      this.envReported = true;
      this.reportEvent("ENV_MISSING", { missing, template });
    }
  }

  // ---------- Avtosaqlash ----------

  /** O'zgargan fayllarni serverga yuboradi. Bir vaqtda bitta sync. */
  sync(): Promise<void> {
    this.syncing ??= this.doSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async doSync(): Promise<void> {
    const ws = this.workspace;
    const attemptId = this.attemptId;
    if (!ws || !attemptId) return;
    const present = new Set<string>();
    const snapshot = await ws.snapshot(present);
    const changed: { path: string; content: string; encoding?: "base64"; hash: string }[] = [];
    for (const [path, { content, encoding }] of snapshot) {
      const hash = sha1(content);
      if (this.synced.get(path) !== hash) changed.push({ path, content, encoding, hash });
    }
    let deleted = [...this.synced.keys()].filter((p) => !present.has(p) && !isReadonlyPath(p));
    if (changed.length === 0 && deleted.length === 0) return;

    // Katta o'zgarishlarni (masalan `npm create vite`) bir nechta bo'lakka bo'lamiz.
    const batches: (typeof changed)[] = [[]];
    let size = 0;
    for (const f of changed) {
      const current = batches[batches.length - 1] ?? [];
      if (size + f.content.length > SYNC_BATCH_BYTES && current.length > 0) {
        batches.push([]);
        size = 0;
      }
      batches[batches.length - 1]?.push(f);
      size += f.content.length;
    }
    for (const batch of batches) {
      const res = await this.rpc<{ rejected: unknown[] }>("sync_files", {
        p_attempt_id: attemptId,
        p_files: batch.map(({ path, content, encoding, hash }) => ({ path, content, sha1: hash, ...(encoding && { encoding }) })),
        p_deleted: deleted,
      });
      if ("error" in res) return; // keyingi urinishda qayta yuboriladi
      // Rad etilganlar ham belgilanadi — o'zgarmaguncha qayta yuborilmaydi.
      for (const f of batch) this.synced.set(f.path, f.hash);
      for (const p of deleted) this.synced.delete(p);
      deleted = [];
    }
  }

  // ---------- Topshirish ----------

  async submit(): Promise<Result> {
    if (!this.attemptId) return { ok: false, error: uz.notConnected };
    await this.sync();
    const res = await this.rpc<StudentState>("submit_attempt", { p_attempt_id: this.attemptId });
    if ("error" in res) return { ok: false, error: res.network ? uz.notConnected : /NOT_WORKING/.test(res.error) ? uz.notWorking : res.error };
    void this.end();
    return { ok: true };
  }

  /** Vaqt tugadi yoki topshirildi: oxirgi sync, qulflash, "Topshirildi" ekrani. */
  private async end(): Promise<void> {
    if (this.state.locked && this.state.screen === "submitted") return;
    this.set({ locked: true });
    this.hooks.onLocked?.();
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    await this.syncing;
    await this.sync();
    this.stopHeartbeat();
    void this.unsubscribe();
    this.set({ screen: "submitted" });
    // 10 soniyadan so'ng kod+ism ekraniga qaytamiz va lokal izlarni o'chiramiz.
    this.autoReturnTimer ??= setTimeout(() => void this.resetToLogin(), AUTO_RETURN_MS);
  }

  /** "Topshirildi" dan keyin: lokal ish papkasi va anonim sessiya o'chiriladi, login ekraniga qaytiladi. */
  private async resetToLogin(): Promise<void> {
    if (this.autoReturnTimer) clearTimeout(this.autoReturnTimer);
    this.autoReturnTimer = null;
    this.stopHeartbeat();
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    const code = this.creds?.code;
    const ws = this.workspace;
    this.creds = null;
    this.attemptId = null;
    this.joined = false;
    this.workspace = null;
    this.readonlyFiles.clear();
    this.synced.clear();
    this.pendingEvents = [];
    this.envReported = false;
    if (code) store.clearSession(code);
    await this.unsubscribe();
    // Keyingi imtihonda — yangi anonim foydalanuvchi (MIGRATION-PLAN.md 4-bo'lim, 8-band).
    await this.sb.auth.signOut({ scope: "local" }).catch(() => undefined);
    await ws?.destroy().catch(() => undefined);
    this.set({ ...initialState, connected: this.state.connected, runtime: this.state.runtime });
    this.startPing();
  }

  // ---------- Eventlar ----------

  /**
   * Qoidabuzarlik/kuzatuv eventi. Aloqa bo'lmasa navbatda turadi va qayta ulanganda yuboriladi.
   * Qaytgan handle bilan keyinroq tafsilot qo'shish mumkin (masalan FOCUS_LOST davomiyligi).
   */
  reportEvent(type: EventType, details: Record<string, unknown> = {}): EventHandle {
    const event: PendingEvent = { type, details: { ...details, at: new Date().toISOString() }, id: null, sent: false };
    if (!this.state.locked) {
      if (this.pendingEvents.length >= 200) this.pendingEvents.shift();
      this.pendingEvents.push(event);
      this.flushEvents();
    }
    return {
      update: (extra) => {
        if (!event.sent) {
          // Hali yuborilmagan — shu eventning o'ziga qo'shamiz.
          event.details = { ...event.details, ...extra };
        } else if (event.id && this.attemptId && this.joined) {
          void this.rpc("report_event", { p_attempt_id: this.attemptId, p_type: type, p_details: extra, p_event_id: event.id });
        }
      },
    };
  }

  private flushEvents(): void {
    const attemptId = this.attemptId;
    if (!this.joined || !attemptId) return;
    for (const e of this.pendingEvents.splice(0)) {
      e.sent = true;
      void this.rpc<string>("report_event", { p_attempt_id: attemptId, p_type: e.type, p_details: e.details }).then((res) => {
        if ("data" in res) e.id = res.data;
        else if (res.network) {
          // Aloqa uzildi — navbatga qaytaramiz (keyingi muvaffaqiyatli heartbeat'da yuboriladi).
          e.sent = false;
          this.joined = false;
          this.pendingEvents.unshift(e);
        }
      });
    }
  }

  /** Ilova yopilganda: o'qituvchiga APP_CLOSED (1 s kutamiz, aloqa bo'lmasa — o'tkazib yuboriladi). */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.pingTimer) clearInterval(this.pingTimer);
    const attemptId = this.attemptId;
    if (!attemptId || this.state.locked) return;
    await Promise.race([
      this.rpc("report_app_closed", { p_attempt_id: attemptId }),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  }
}
