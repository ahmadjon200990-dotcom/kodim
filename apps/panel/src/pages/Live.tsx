import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AttemptSummary } from "@exam-ide/shared";
import { api } from "../lib/api";
import { beep } from "../lib/beep";
import { eventSummary } from "../lib/events";
import type { AttemptDetail } from "../lib/types";
import { useExamSocket } from "../lib/useExamSocket";
import { AlertsFeed } from "../components/AlertsFeed";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, errorText, PageMessage, PageSkeleton, Skeleton, useModal, useToast } from "../components/ui";
import { uz } from "../uz";

const CodeBrowser = lazy(() => import("../components/DiffView").then((m) => ({ default: m.CodeBrowser })));

function formatLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export function Live() {
  const { id } = useParams();
  const nav = useNavigate();
  const modal = useModal();
  const toast = useToast();
  const { exam, attempts, alerts, connected, lastLoud, error } = useExamSocket(id);
  const [busy, setBusy] = useState("");
  const [codeOf, setCodeOf] = useState<AttemptSummary | null>(null);
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const lastKey = useRef<string | null>(null);
  const now = useNow(exam?.status === "RUNNING");

  // Yangi DANGER/WARN — ovozli signal, toast va o'quvchi kartasi yonib o'chadi.
  useEffect(() => {
    if (!lastLoud || lastLoud.key === lastKey.current) return;
    lastKey.current = lastLoud.key;
    const danger = lastLoud.event.severity === "DANGER";
    beep(danger);
    toast.show(
      danger ? "danger" : "warn",
      `${lastLoud.studentName}: ${uz.eventNames[lastLoud.event.type] ?? lastLoud.event.type}`,
      eventSummary(lastLoud.event.type, lastLoud.event.details),
    );
    setFlash(lastLoud.event.attemptId);
    const t = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(t);
  }, [lastLoud, toast]);

  if (error?.kind === "notFound")
    return <PageMessage kind="notFound" title={uz.common.examNotFound} text={uz.common.examNotFoundText} />;
  if (!exam && error?.kind === "network")
    return <PageMessage kind="error" title={uz.common.network} text={uz.live.reconnecting} onRetry={() => window.location.reload()} />;
  if (!exam) return <PageSkeleton />;

  const act = async (label: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(label);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    } finally {
      setBusy("");
    }
  };

  const openLobby = () => act("open", () => api.post(`/exams/${exam.id}/open`), uz.live.lobbyOpened);
  const start = async () => {
    const yes = await modal.confirm({
      title: uz.live.confirmStartTitle,
      text: uz.live.confirmStart(attempts.length),
      okLabel: uz.live.start,
    });
    if (yes) await act("start", () => api.post(`/exams/${exam.id}/start`), uz.live.started);
  };
  const finish = async () => {
    const yes = await modal.confirm({
      title: uz.live.confirmFinishTitle,
      text: uz.live.confirmFinish,
      okLabel: uz.live.finish,
      danger: true,
    });
    if (yes) await act("finish", () => api.post(`/exams/${exam.id}/finish`), uz.live.finished);
  };
  const extendAll = async (minutes: number) => act("extend", () => api.post(`/exams/${exam.id}/extend`, { minutes }), uz.live.extended(minutes));

  const running = exam.status === "RUNNING";
  const lobby = exam.status === "LOBBY";
  const left = exam.endsAt ? Date.parse(exam.endsAt) - now : null;
  const online = attempts.filter((a) => a.connected).length;
  const submitted = attempts.filter((a) => a.status === "SUBMITTED").length;
  const dangerByAttempt = new Map<string, number>();
  for (const a of alerts) if (a.event.severity === "DANGER") dangerByAttempt.set(a.event.attemptId, (dangerByAttempt.get(a.event.attemptId) ?? 0) + 1);

  return (
    <div className="live-page">
      <div className="live-main">
        <div className="breadcrumb">
          <Link to="/">{uz.nav.exams}</Link> / {exam.title}
        </div>
        <div className="page-head">
          <div>
            <h1>
              {exam.title} <StatusBadge status={exam.status} />
            </h1>
            <div className="page-sub">
              {connected ? uz.live.liveOn : uz.live.reconnecting}
            </div>
          </div>
          <div className="live-controls">
            {exam.status === "DRAFT" && (
              <>
                <Link to={`/exams/${exam.id}/edit`} className="btn">
                  {uz.exams.edit}
                </Link>
                <button className="btn btn-primary" disabled={busy !== ""} onClick={() => void openLobby()}>
                  {uz.live.openLobby}
                </button>
              </>
            )}
            {lobby && (
              <button className="btn btn-primary" disabled={busy !== ""} onClick={() => void start()}>
                ▶ {uz.live.start}
              </button>
            )}
            {running && (
              <>
                <div className="extend-group">
                  <span className="muted small">{uz.live.addTimeAll}:</span>
                  {[5, 10, 15].map((m) => (
                    <button key={m} className="btn btn-sm" disabled={busy !== ""} onClick={() => void extendAll(m)}>
                      +{m}
                    </button>
                  ))}
                </div>
                <button className="btn btn-danger-solid" disabled={busy !== ""} onClick={() => void finish()}>
                  ■ {uz.live.finish}
                </button>
              </>
            )}
            {(running || exam.status === "GRADING" || exam.status === "FINISHED") && (
              <button className="btn" onClick={() => nav(`/exams/${exam.id}/results`)}>
                {uz.exams.results}
              </button>
            )}
          </div>
        </div>

        {(exam.code || running) && (
          <div className="code-banner">
            {exam.code && (
              <div>
                <div className="code-label">{uz.live.code}</div>
                <div className="code-value">{exam.code}</div>
              </div>
            )}
            {lobby && <div className="code-hint">{uz.live.codeHint}</div>}
            {running && left !== null && (
              <div>
                <div className="code-label">{uz.live.timeLeft}</div>
                <div className={left < 5 * 60_000 ? "timer-big timer-warn" : "timer-big"}>{formatLeft(left)}</div>
              </div>
            )}
          </div>
        )}

        {exam.status === "DRAFT" && <div className="card muted">{uz.live.draftHint}</div>}

        <div className="stats">
          <div className="stat-card">
            <div className="stat-label">{uz.live.students}</div>
            <div className="stat-value">{attempts.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{uz.live.online}</div>
            <div className="stat-value">{online}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{uz.live.submittedCount}</div>
            <div className="stat-value">{submitted}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{uz.live.dangerCount}</div>
            <div className="stat-value" style={{ color: "var(--danger)" }}>
              {alerts.filter((a) => a.event.severity === "DANGER").length}
            </div>
          </div>
        </div>

        <h2 className="section-label">
          {uz.live.students} ({attempts.length})
        </h2>
        {attempts.length === 0 ? (
          <EmptyState icon="…" title={uz.live.noStudents} text={lobby ? uz.live.noStudentsHint : undefined} />
        ) : (
          <div className="student-grid">
            {attempts.map((a) => (
              <StudentCard
                key={a.id}
                a={a}
                examId={exam.id}
                running={running}
                danger={dangerByAttempt.get(a.id) ?? 0}
                flash={flash === a.id}
                onCode={() => setCodeOf(a)}
                onAlerts={() => setStudentFilter((cur) => (cur === a.id ? null : a.id))}
              />
            ))}
          </div>
        )}
      </div>

      <AlertsFeed alerts={alerts} studentFilter={studentFilter} onClearStudent={() => setStudentFilter(null)} />
      {codeOf && <CodeModal attempt={codeOf} onClose={() => setCodeOf(null)} />}
    </div>
  );
}

function StudentCard({
  a,
  examId,
  running,
  danger,
  flash,
  onCode,
  onAlerts,
}: {
  a: AttemptSummary;
  examId: string;
  running: boolean;
  danger: number;
  flash: boolean;
  onCode(): void;
  onAlerts(): void;
}) {
  const modal = useModal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const annulled = a.status === "ANNULLED";
  const dot = a.status === "SUBMITTED" ? "dot-done" : annulled ? "dot-annul" : a.connected ? "dot-online" : "dot-offline";
  const state = a.status === "WORKING" || a.status === "JOINED" ? (a.connected ? uz.live.onlineState : uz.live.offlineState) : uz.attemptStatus[a.status];

  const annul = async () => {
    const yes = await modal.confirm({ title: uz.live.annulTitle(a.studentName), text: uz.live.confirmAnnul, okLabel: uz.live.annul, danger: true });
    if (yes) await run(() => api.post(`/attempts/${a.id}/annul`), uz.live.annulled);
  };

  const cls = ["student-card", annulled && "annulled", danger > 0 && "has-danger", flash && "flash"].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <div className="sc-head">
        <span className={`dot ${dot}`} title={state} />
        <span className="sc-name" title={a.studentName}>
          {a.studentName}
        </span>
        <span className="sc-status">{state}</span>
      </div>
      <div className="sc-stats">
        {a.warningCount > 0 && (
          <button className={danger > 0 ? "badge badge-plain badge-danger" : "badge badge-plain badge-warn"} onClick={onAlerts} style={{ cursor: "pointer" }} title={uz.live.filterStudent}>
            ⚠ {a.warningCount}
          </button>
        )}
        {a.penaltyTotal > 0 && <span className="badge badge-plain badge-danger">−{a.penaltyTotal}</span>}
        {a.extraMinutes > 0 && <span className="badge badge-plain badge-info">+{a.extraMinutes} {uz.exams.min}</span>}
      </div>
      <div className="sc-actions">
        {a.status !== "JOINED" && (
          <button className="btn btn-xs" onClick={onCode}>
            {uz.live.viewCode}
          </button>
        )}
        {running && a.status === "WORKING" && (
          <button
            className="btn btn-xs"
            disabled={busy}
            onClick={() => void run(() => api.post(`/exams/${examId}/extend`, { minutes: 5, attemptId: a.id }), uz.live.extendedOne(a.studentName))}
          >
            +5 {uz.exams.min}
          </button>
        )}
        {annulled ? (
          <button className="btn btn-xs" disabled={busy} onClick={() => void run(() => api.post(`/attempts/${a.id}/unannul`), uz.live.unannulled)}>
            {uz.live.unannul}
          </button>
        ) : (
          <button className="btn btn-xs btn-danger" disabled={busy} onClick={() => void annul()}>
            {uz.live.annul}
          </button>
        )}
      </div>
    </div>
  );
}

/** O'quvchining joriy kodi (oxirgi sync snapshot), faqat o'qish uchun. */
function CodeModal({ attempt, onClose }: { attempt: AttemptSummary; onClose(): void }) {
  const [files, setFiles] = useState<AttemptDetail["files"] | null>(null);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api.get<AttemptDetail>(`/attempts/${attempt.id}`);
      setFiles(d.files.filter((f) => !f.encoding));
      setLoadedAt(new Date());
    } catch (e) {
      setError(errorText(e));
    }
  }, [attempt.id]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="card-head" style={{ marginBottom: 10 }}>
          <div>
            <div className="modal-title" style={{ margin: 0 }}>
              {attempt.studentName} — {uz.live.codeTitle}
            </div>
            <div className="card-sub">
              {uz.live.codeHintModal}
              {loadedAt && ` · ${loadedAt.toLocaleTimeString("uz")}`}
            </div>
          </div>
          <div className="row-actions">
            <button className="btn btn-sm" onClick={() => void load()}>
              ⟳ {uz.live.refresh}
            </button>
            <button className="btn btn-sm" onClick={onClose}>
              {uz.common.close}
            </button>
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
        {!files && !error && <Skeleton lines={8} />}
        {files && (
          <Suspense fallback={<Skeleton lines={8} />}>
            <CodeBrowser files={files} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
