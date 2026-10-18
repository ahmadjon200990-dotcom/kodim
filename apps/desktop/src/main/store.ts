import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

// userData dagi kichik doimiy ma'lumotlar: qurilma ID, oxirgi ism, imtihon tokenlari.

interface SavedSession {
  token: string;
  attemptId: string;
  name: string;
}

interface StoreData {
  deviceId: string;
  lastName: string;
  /** Imtihon kodi → shu kompyuterdagi ish tokeni (qayta kirish uchun). */
  sessions: Record<string, SavedSession>;
}

const file = () => join(app.getPath("userData"), "kodim.json");

function load(): StoreData {
  try {
    const data = JSON.parse(readFileSync(file(), "utf8")) as Partial<StoreData>;
    if (typeof data.deviceId === "string" && data.deviceId.length >= 8) {
      return { deviceId: data.deviceId, lastName: data.lastName ?? "", sessions: data.sessions ?? {} };
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
};
