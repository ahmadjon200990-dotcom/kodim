import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { SHELL_KINDS, type ShellKind } from "@exam-ide/shared";

// userData dagi kichik doimiy ma'lumotlar: qurilma ID, oxirgi ism, imtihon sessiyalari, Supabase auth sessiyasi.

interface SavedSession {
  attemptId: string;
  name: string;
}

interface StoreData {
  deviceId: string;
  lastName: string;
  /** Imtihon kodi → shu kompyuterdagi ish (qayta kirish uchun; kimligi — anonim Supabase sessiyasi). */
  sessions: Record<string, SavedSession>;
  /** supabase-js auth storage (anonim o'quvchi sessiyasi: access/refresh token). */
  auth?: Record<string, string>;
  /** Oxirgi tanlangan terminal profili (VS Code "default profile"). */
  terminalProfile?: ShellKind;
  /** Server manzili (login ekranidagi sozlama). Bo'lmasa — build vaqtidagi standart. */
  serverUrl?: string;
}

const file = () => join(app.getPath("userData"), "kodim.json");

function load(): StoreData {
  try {
    const data = JSON.parse(readFileSync(file(), "utf8")) as Partial<StoreData>;
    if (typeof data.deviceId === "string" && data.deviceId.length >= 8) {
      return {
        deviceId: data.deviceId,
        lastName: data.lastName ?? "",
        sessions: Object.fromEntries(Object.entries(data.sessions ?? {}).filter(([, v]) => typeof v?.attemptId === "string").map(([k, v]) => [k, { attemptId: v.attemptId, name: v.name }])),
        ...(data.terminalProfile && (SHELL_KINDS as readonly string[]).includes(data.terminalProfile) && { terminalProfile: data.terminalProfile }),
        ...(typeof data.serverUrl === "string" && data.serverUrl && { serverUrl: data.serverUrl }),
        ...(data.auth && typeof data.auth === "object" && { auth: data.auth }),
      };
    }
  } catch {
    // birinchi ishga tushirish yoki buzilgan fayl
  }
  const fresh: StoreData = { deviceId: randomUUID(), lastName: "", sessions: {} };
  writeFileSync(file(), JSON.stringify(fresh));
  return fresh;
}

let data: StoreData | null = null;

function get(): StoreData {
  data ??= load();
  return data;
}

function save(): void {
  writeFileSync(file(), JSON.stringify(get()));
}

export const store = {
  deviceId: () => get().deviceId,
  lastName: () => get().lastName,
  session: (code: string): SavedSession | undefined => get().sessions[code],
  saveSession(code: string, session: SavedSession): void {
    const d = get();
    d.sessions[code] = session;
    d.lastName = session.name;
    save();
  },
  terminalProfile: (): ShellKind | undefined => get().terminalProfile,
  setTerminalProfile(kind: ShellKind): void {
    get().terminalProfile = kind;
    save();
  },
  serverUrl: (): string | undefined => get().serverUrl,
  setServerUrl(url: string | undefined): void {
    const d = get();
    if (url) d.serverUrl = url;
    else delete d.serverUrl;
    save();
  },
  /** supabase-js uchun saqlash adapteri (sinxron fayl, kichik hajm). */
  authStorage: {
    getItem: (key: string): string | null => get().auth?.[key] ?? null,
    setItem(key: string, value: string): void {
      const d = get();
      d.auth = { ...d.auth, [key]: value };
      save();
    },
    removeItem(key: string): void {
      const d = get();
      if (d.auth?.[key] === undefined) return;
      delete d.auth[key];
      save();
    },
  },
  clearSession(code: string): void {
    const d = get();
    if (d.sessions[code]) {
      delete d.sessions[code];
      save();
    }
  },
};
