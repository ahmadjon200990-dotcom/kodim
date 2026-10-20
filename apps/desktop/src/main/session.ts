import { io, type Socket } from "socket.io-client";
import { isReadonlyPath, STUDENT_NAMESPACE, SYNC_LIMITS, TEMPLATE_RUNTIME } from "@exam-ide/shared";
import type {
  EventType,
  FileEntry,
  StudentClientToServer,
  StudentJoinOk,
  StudentServerToClient,
  TimeSyncPayload,
} from "@exam-ide/shared";
import type { ClientState, Result, RuntimeInfo } from "../common/api";
import { detectRuntime } from "./runtime";
import { store } from "./store";
import { uz } from "./uz";
import { sha1, Workspace } from "./workspace";

type StudentSocket = Socket<StudentServerToClient, StudentClientToServer>;

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

const ACK_TIMEOUT_MS = 15_000;
/** Bitta `attempt:sync` dagi taxminiy maksimal hajm (socket limiti 25 MB). */
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

export interface SessionHooks {
  onStateChange(state: ClientState): void;
  /** Ish boshlandi (yangi yoki qayta kirish) — himoya va kuzatuvni yoqish uchun. */
  onWorking?(): void;
  /** Vaqt tugadi / topshirildi — terminal va dev serverlarni o'chirish uchun. */
  onLocked?(): void;
}

/** O'quvchi sessiyasi: socket, kutish xonasi, ish papkasi, avtosaqlash, topshirish. */
export class ExamSession {
  state: ClientState = { ...initialState };
  workspace: Workspace | null = null;

  private readonly socket: StudentSocket;
  private creds: { code: string; name: string } | null = null;
  /** Serverga oxirgi yuborilgan holat: yo'l → sha1. */
  private synced = new Map<string, string>();
  private syncTimer: NodeJS.Timeout | null = null;
  private syncing: Promise<void> | null = null;
  private lastAttemptId: string | null = null;
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

  constructor(private readonly hooks: SessionHooks) {
    this.socket = io(`${__SERVER_URL__}${STUDENT_NAMESPACE}`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelayMax: 5000,
    });
    this.socket.on("connect", () => {
      this.set({ connected: true });
      // Uzilishdan keyin o'sha ishga jim qayta kiramiz.
      if (this.creds) void this.rejoin();
    });
    this.socket.on("disconnect", () => {
      this.joined = false;
      this.set({ connected: false });
    });
    this.socket.on("lobby:count", ({ joinedCount }) => this.set({ joinedCount }));
    this.socket.on("time:sync", (t) => this.set(this.timeState(t)));
    this.socket.on("exam:started", (p) => {
      if (!this.state.exam || !this.lastAttemptId) return;
      void this.startWorking(this.lastAttemptId, p.files, p);
    });
    this.socket.on("exam:ended", () => void this.end());
    void detectRuntime().then((runtime) => this.set({ runtime }));
  }

  private set(patch: Partial<ClientState>): void {
    this.state = { ...this.state, ...patch };
    this.hooks.onStateChange(this.state);
  }

  private timeState(t: TimeSyncPayload): Partial<ClientState> {
    return { endsAt: t.endsAt, serverOffsetMs: Date.parse(t.serverNow) - Date.now() };
  }

  async join(code: string, name: string): Promise<Result> {
    if (!this.socket.connected) return { ok: false, error: uz.notConnected };
    const saved = store.session(code);
    const sameName = saved && saved.name.trim().toLowerCase() === name.trim().toLowerCase();
    let res;
    try {
      res = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck("student:join", {
        code,
        name,
        deviceId: store.deviceId(),
        ...(sameName && { token: saved.token }),
      });
    } catch {
      return { ok: false, error: uz.timeout };
    }
    if (!res.ok) return res;
    this.creds = { code, name };
    this.joined = true;
    store.saveSession(code, { token: res.token, attemptId: res.attemptId, name });
    await this.apply(res);
    this.flushEvents();
    return { ok: true };
  }

  /** Socket qayta ulanganda: o'sha kod va ism bilan (token bor) jim kirish. */
  private async rejoin(): Promise<void> {
    if (!this.creds) return;
    const res = await this.join(this.creds.code, this.creds.name);
    if (res.ok) return;
    // Imtihon o'chgan/yakunlangan (kod bo'shatilgan): ish allaqachon serverda topshirilgan.
    if (this.state.screen === "workspace" || this.state.locked) await this.end();
    else if (this.state.screen === "lobby") this.set({ ...initialState, connected: this.socket.connected });
  }

  private async apply(res: StudentJoinOk): Promise<void> {
    this.lastAttemptId = res.attemptId;
    this.set({
      exam: res.exam,
      studentName: this.creds?.name ?? "",
      joinedCount: res.state.joinedCount,
      ...(res.state.endsAt && this.timeState({ endsAt: res.state.endsAt, serverNow: res.state.serverNow })),
    });
    if (res.state.phase === "LOBBY") this.set({ screen: "lobby" });
    else if (res.state.phase === "WORKING") await this.startWorking(res.attemptId, res.state.files ?? [], null);
    else this.set({ screen: "submitted", locked: true });
  }

  private async startWorking(attemptId: string, files: FileEntry[], time: TimeSyncPayload | null): Promise<void> {
    if (this.state.locked) return;
    if (this.workspace?.root !== new Workspace(attemptId).root) this.workspace = new Workspace(attemptId);
    await this.workspace.init(files);
    // Read-only fayllarning asl tarkibi (READONLY_TAMPER tiklashi uchun).
    this.readonlyFiles = new Map(
      files.filter((f) => isReadonlyPath(f.path)).map((f) => [f.path, { content: f.content, encoding: f.encoding }]),
    );
    // Server bilgan holat — faqat undan farqlar yuboriladi.
    this.synced = new Map(files.map((f) => [f.path, sha1(f.content)]));
    this.set({
      screen: "workspace",
      workspaceVersion: this.state.workspaceVersion + 1,
      ...(time && this.timeState(time)),
    });
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

  /** O'zgargan fayllarni serverga yuboradi. Bir vaqtda bitta sync. */
  sync(): Promise<void> {
    this.syncing ??= this.doSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async doSync(): Promise<void> {
    const ws = this.workspace;
    if (!ws || !this.socket.connected) return;
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
      const res = await this.socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck("attempt:sync", { files: batch.map(({ path, content, encoding }) => ({ path, content, ...(encoding && { encoding }) })), deleted })
        .catch(() => null);
      if (!res?.ok) return; // keyingi urinishda qayta yuboriladi
      // Rad etilganlar ham belgilanadi — o'zgarmaguncha qayta yuborilmaydi.
      for (const f of batch) this.synced.set(f.path, f.hash);
      for (const p of deleted) this.synced.delete(p);
      deleted = [];
    }
  }

  async submit(): Promise<Result> {
    if (!this.socket.connected) return { ok: false, error: uz.notConnected };
    await this.sync();
    try {
      const res = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck("attempt:submit");
      return res.ok ? { ok: true } : res;
    } catch {
      return { ok: false, error: uz.timeout };
    }
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
    this.set({ screen: "submitted" });
    // 10 soniyadan so'ng kod+ism ekraniga qaytamiz va lokal izlarni o'chiramiz.
    this.autoReturnTimer ??= setTimeout(() => void this.resetToLogin(), AUTO_RETURN_MS);
  }

  /** "Topshirildi" dan keyin: lokal ish papkasi va token o'chiriladi, login ekraniga qaytiladi. */
  private async resetToLogin(): Promise<void> {
    this.autoReturnTimer = null;
    const code = this.creds?.code;
    const ws = this.workspace;
    this.creds = null;
    this.joined = false;
    this.workspace = null;
    this.readonlyFiles.clear();
    this.synced.clear();
    this.pendingEvents = [];
    this.envReported = false;
    if (code) store.clearSession(code);
    await ws?.destroy().catch(() => undefined);
    this.set({ ...initialState, connected: this.socket.connected, runtime: this.state.runtime });
  }

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
        } else if (event.id && this.joined && this.socket.connected) {
          this.socket.emit("event:report", { type, details: extra, eventId: event.id }, () => {});
        }
      },
    };
  }

  private flushEvents(): void {
    if (!this.joined || !this.socket.connected) return;
    for (const e of this.pendingEvents.splice(0)) {
      e.sent = true;
      this.socket.emit("event:report", { type: e.type, details: e.details }, (res) => {
        if (res.ok) e.id = res.eventId;
      });
    }
  }

  /** Ilova yopilganda: server buni APP_CLOSED deb biladi. */
  disconnect(): void {
    this.socket.disconnect();
  }
}
