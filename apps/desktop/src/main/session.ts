import { io, type Socket } from "socket.io-client";
import { isReadonlyPath, STUDENT_NAMESPACE, SYNC_LIMITS } from "@exam-ide/shared";
import type {
  FileEntry,
  StudentClientToServer,
  StudentJoinOk,
  StudentServerToClient,
  TimeSyncPayload,
} from "@exam-ide/shared";
import type { ClientState, Result } from "../common/api";
import { store } from "./store";
import { uz } from "./uz";
import { sha1, Workspace } from "./workspace";

type StudentSocket = Socket<StudentServerToClient, StudentClientToServer>;

const ACK_TIMEOUT_MS = 15_000;
/** Bitta `attempt:sync` dagi taxminiy maksimal hajm (socket limiti 25 MB). */
const SYNC_BATCH_BYTES = 5 * 1024 * 1024;

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
};

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
    this.socket.on("disconnect", () => this.set({ connected: false }));
    this.socket.on("lobby:count", ({ joinedCount }) => this.set({ joinedCount }));
    this.socket.on("time:sync", (t) => this.set(this.timeState(t)));
    this.socket.on("exam:started", (p) => {
      if (!this.state.exam || !this.lastAttemptId) return;
      void this.startWorking(this.lastAttemptId, p.files, p);
    });
    this.socket.on("exam:ended", () => void this.end());
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
    store.saveSession(code, { token: res.token, attemptId: res.attemptId, name });
    await this.apply(res);
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
    // Server bilgan holat — faqat undan farqlar yuboriladi.
    this.synced = new Map(files.map((f) => [f.path, sha1(f.content)]));
    this.set({
      screen: "workspace",
      workspaceVersion: this.state.workspaceVersion + 1,
      ...(time && this.timeState(time)),
    });
    this.syncTimer ??= setInterval(() => void this.sync(), SYNC_LIMITS.intervalMs);
    this.hooks.onWorking?.();
    void this.sync();
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
    const snapshot = await ws.snapshot();
    const changed: { path: string; content: string; hash: string }[] = [];
    for (const [path, content] of snapshot) {
      const hash = sha1(content);
      if (this.synced.get(path) !== hash) changed.push({ path, content, hash });
    }
    let deleted = [...this.synced.keys()].filter((p) => !snapshot.has(p) && !isReadonlyPath(p));
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
        .emitWithAck("attempt:sync", { files: batch.map(({ path, content }) => ({ path, content })), deleted })
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
  }

  /** Ilova yopilganda: server buni APP_CLOSED deb biladi. */
  disconnect(): void {
    this.socket.disconnect();
  }
}
