// Main ↔ renderer IPC shartnomasi (faqat desktop ichida). Renderer Node API'ga ega emas,
// hamma narsa preload'dagi `window.kodim` orqali.
import type { AckResult, ExamPublic } from "@exam-ide/shared";

export type Screen = "login" | "lobby" | "workspace" | "submitted";

export interface ClientState {
  screen: Screen;
  /** Server bilan socket ulanishi bormi. */
  connected: boolean;
  exam: ExamPublic | null;
  studentName: string;
  joinedCount: number;
  /** O'quvchining shaxsiy tugash vaqti (server vaqti bo'yicha). */
  endsAt: string | null;
  /** serverNow − mahalliy vaqt; timer kompyuter soatiga bog'liq bo'lmasligi uchun. */
  serverOffsetMs: number;
  /** Vaqt tugadi / topshirildi: editor faqat o'qish uchun. */
  locked: boolean;
  /** Ish papkasi qayta yozilganda oshadi — renderer fayllar daraxtini qayta yuklaydi. */
  workspaceVersion: number;
}

export interface FsEntry {
  name: string;
  /** Ish papkasiga nisbatan, `/` bilan. */
  path: string;
  type: "file" | "dir";
  readonly: boolean;
}

export type Result = AckResult<object>;

export interface KodimApi {
  getState(): Promise<ClientState>;
  onState(listener: (state: ClientState) => void): () => void;
  getLastName(): Promise<string>;
  join(code: string, name: string): Promise<Result>;
  submit(): Promise<Result>;
  /** Ichki clipboard (tizim clipboard'i ishlatilmaydi). */
  clipboard: {
    write(text: string): Promise<void>;
    /** Ichki matnni qaytaradi; tizim clipboard'ida tashqi matn bo'lsa PASTE_BLOCKED yuboriladi. */
    paste(source: "editor" | "input" | "terminal"): Promise<string>;
  };
  fs: {
    list(dir: string): Promise<FsEntry[]>;
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<Result>;
    createFile(path: string): Promise<Result>;
    createDir(path: string): Promise<Result>;
    rename(from: string, to: string): Promise<Result>;
    remove(path: string): Promise<Result>;
  };
}

export const IPC = {
  getState: "state:get",
  state: "state:changed",
  lastName: "store:last-name",
  join: "session:join",
  submit: "session:submit",
  clipboardWrite: "clipboard:write",
  clipboardPaste: "clipboard:paste",
  fsList: "fs:list",
  fsRead: "fs:read",
  fsWrite: "fs:write",
  fsCreateFile: "fs:create-file",
  fsCreateDir: "fs:create-dir",
  fsRename: "fs:rename",
  fsRemove: "fs:remove",
} as const;
