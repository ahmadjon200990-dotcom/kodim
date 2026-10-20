// Main ↔ renderer IPC shartnomasi (faqat desktop ichida). Renderer Node API'ga ega emas,
// hamma narsa preload'dagi `window.kodim` orqali.
import type { AckResult, ExamPublic } from "@exam-ide/shared";

export type Screen = "login" | "lobby" | "workspace" | "submitted";

/** Kompyuterda mavjud dasturlash muhitlari (Status Bar'da ko'rinadi). */
export interface RuntimeInfo {
  node: boolean;
  npm: boolean;
  python: boolean;
}

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
  /** Kompyuterdagi muhitlar. */
  runtime: RuntimeInfo;
}

export interface FsEntry {
  name: string;
  /** Ish papkasiga nisbatan, `/` bilan. */
  path: string;
  type: "file" | "dir";
  readonly: boolean;
  /** Rasm fayli (png/jpg/...) — editorda rasm sifatida ko'rsatiladi. */
  image?: boolean;
}

export type Result = AckResult<object>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

export interface KodimApi {
  getState(): Promise<ClientState>;
  onState(listener: (state: ClientState) => void): () => void;
  getLastName(): Promise<string>;
  /** Fayl diskda o'zgardi (tashqi yoki tiklangan) — ochiq bo'lsa qayta yuklash. */
  onDiskChange(listener: (path: string) => void): () => void;
  /** Editorda katta qo'shimcha (ichki paste emas) — LARGE_INSERT. */
  reportLargeInsert(chars: number): void;
  /** Renderer aniqlagan qoidabuzarlik (screenshot tugmasi, DevTools tugmasi, tashqariga nusxalash). */
  reportEvent(type: string, details?: Record<string, unknown>): void;
  join(code: string, name: string): Promise<Result>;
  submit(): Promise<Result>;
  /** Ichki clipboard (tizim clipboard'i ishlatilmaydi). */
  clipboard: {
    write(text: string): Promise<void>;
    /** Ichki matnni qaytaradi; tizim clipboard'ida tashqi matn bo'lsa PASTE_BLOCKED yuboriladi. */
    paste(source: "editor" | "input" | "terminal"): Promise<string>;
  };
  terminal: {
    create(cols: number, rows: number): Promise<AckResult<{ id: number }>>;
    /** Buyruq qatorini yuboradi: bo'sh (idle) bo'lsa ruxsat tekshiriladi, aks holda jarayon kiritmasi (raw). */
    submit(id: number, line: string): Promise<TerminalSubmit>;
    /** Ctrl+C — ishlayotgan jarayonni to'xtatish. */
    interrupt(id: number): void;
    /** Ish papkasidagi fayl/papka nomlari — Tab bilan to'ldirish uchun. */
    complete(id: number, prefix: string): Promise<string[]>;
    resize(id: number, cols: number, rows: number): void;
    kill(id: number): void;
    onData(listener: (id: number, data: string) => void): () => void;
    onExit(listener: (id: number, code: number) => void): () => void;
    /** Terminal jarayon ishlayaptimi (busy) — kiritma raw yuboriladi. */
    onBusy(listener: (id: number, busy: boolean) => void): () => void;
  };
  browser: {
    /** Brauzer paneli joyi (CSS px); `null` — yashirish. */
    setBounds(rect: Rect | null): void;
    navigate(url: string): Promise<Result>;
    back(): void;
    forward(): void;
    reload(): void;
    /** Ish papkasini lokal serverda ochib, brauzerda ko'rsatadi. */
    goLive(): Promise<AckResult<{ url: string }>>;
    onState(listener: (state: BrowserState) => void): () => void;
    /** Brauzer sahifasida Esc bosildi (to'liq ekrandan chiqish uchun). */
    onEscape(listener: () => void): () => void;
  };
  fs: {
    list(dir: string): Promise<FsEntry[]>;
    read(path: string): Promise<string>;
    /** Rasm fayli data: URL sifatida (editorda ko'rsatish uchun). */
    readImage(path: string): Promise<string>;
    write(path: string, content: string): Promise<Result>;
    createFile(path: string): Promise<Result>;
    createDir(path: string): Promise<Result>;
    rename(from: string, to: string): Promise<Result>;
    /** Ilova ichida sudrab ko'chirish: `from` ni `toDir` papkasiga. */
    move(from: string, toDir: string): Promise<Result>;
    /** Ilova ichida nusxalash; yangi yo'lni qaytaradi (nom band bo'lsa "copy"). */
    copy(from: string, toDir: string): Promise<AckResult<{ path: string }>>;
    remove(path: string): Promise<Result>;
  };
}

/** terminal.submit natijasi — renderer kiritma qatorini shunga qarab tozalaydi yoki xato ko'rsatadi. */
export type TerminalSubmit =
  | { ok: true; forwarded: boolean }
  | { ok: false; error: string };

export const IPC = {
  getState: "state:get",
  state: "state:changed",
  diskChange: "fs:disk-change",
  reportLargeInsert: "monitor:large-insert",
  reportEvent: "monitor:event",
  lastName: "store:last-name",
  join: "session:join",
  submit: "session:submit",
  clipboardWrite: "clipboard:write",
  clipboardPaste: "clipboard:paste",
  termCreate: "terminal:create",
  termSubmit: "terminal:submit",
  termInterrupt: "terminal:interrupt",
  termComplete: "terminal:complete",
  termResize: "terminal:resize",
  termKill: "terminal:kill",
  termData: "terminal:data",
  termExit: "terminal:exit",
  termBusy: "terminal:busy",
  browserBounds: "browser:bounds",
  browserNavigate: "browser:navigate",
  browserBack: "browser:back",
  browserForward: "browser:forward",
  browserReload: "browser:reload",
  browserGoLive: "browser:go-live",
  browserState: "browser:state",
  browserEscape: "browser:escape",
  fsList: "fs:list",
  fsRead: "fs:read",
  fsReadImage: "fs:read-image",
  fsWrite: "fs:write",
  fsCreateFile: "fs:create-file",
  fsCreateDir: "fs:create-dir",
  fsRename: "fs:rename",
  fsMove: "fs:move",
  fsCopy: "fs:copy",
  fsRemove: "fs:remove",
} as const;
