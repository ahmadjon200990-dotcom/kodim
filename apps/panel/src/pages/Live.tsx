import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { AttemptSummary } from "@exam-ide/shared";
import { api } from "../lib/api";
import { beep } from "../lib/beep";
import { useExamSocket } from "../lib/useExamSocket";
import { AlertsFeed } from "../components/AlertsFeed";
import { uz } from "../uz";

export function Live() {
  const { id } = useParams();
  const nav = useNavigate();
  const { exam, attempts, alerts, connected, alertTick } = useExamSocket(id);
  const [busy, setBusy] = useState("");
  const lastTick = useRef(0);

  // Yangi DANGER/WARN — ovozli signal.
  useEffect(() => {
    if (alertTick > lastTick.current) {
      lastTick.current = alertTick;
      const latest = alerts[0];
      if (latest) beep(latest.event.severity === "DANGER");
    }
  }, [alertTick, alerts]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : uz.common.error);
    } finally {
      setBusy("");
    }
  };

  const openLobby = () => act("open", () => api.post(`/exams/${id}/open`));
  const start = () => {
    if (confirm(uz.live.confirmStart)) void act("start", () => api.post(`/exams/${id}/start`));
  };
  const finish = () => {
    if (confirm(uz.live.confirmFinish)) void act("finish", () => api.post(`/exams/${id}/finish`));
  };
  const extendAll = (minutes: number) => act("extend", () => api.post(`/exams/${id}/extend`, { minutes }));

  if (!exam) return <div className="muted">{uz.common.loading}</div>;

  const running = exam.status === "RUNNING";
  const lobby = exam.status === "LOBBY";

  return (
    <div className="live-page">
      <div className="live-main">
        <div className="page-head">
          <h1>
            {exam.title} {!connected && <span className="muted small">({uz.common.loading})</span>}
          </h1>
          <div className="live-controls">
            {exam.status === "DRAFT" && (
              <button className="btn btn-primary" disabled={busy !== ""} onClick={() => void openLobby()}>
                {uz.live.openLobby}
              </button>
            )}
            {lobby && (
              <button className="btn btn-primary" disabled={busy !== ""} onClick={start}>
                ▶ {uz.live.start}
              </button>
            )}
            {running && (
              <>
                <div className="extend-group">
                  <span className="muted small">{uz.live.addTime}:</span>
                  {[5, 10, 15].map((m) => (
                    <button key={m} className="btn btn-sm" disabled={busy !== ""} onClick={() => void extendAll(m)}>
                      +{m}
                    </button>
                  ))}
                  <span className="muted small">({uz.live.addTimeAll})</span>
                </div>
                <button className="btn btn-danger" disabled={busy !== ""} onClick={finish}>
                  ■ {uz.live.finish}
                </button>
              </>
            )}
            {(running || exam.status === "GRADING" || exam.status === "FINISHED") && (
              <button className="btn" onClick={() => nav(`/exams/${id}/results`)}>
                {uz.exams.results}
              </button>
            )}
          </div>
        </div>

        {exam.code && (
          <div className="code-banner">
            <div className="code-label">{uz.live.code}</div>
            <div className="code-value">{exam.code}</div>
          </div>
        )}

        <h2 className="section-label">
          {uz.live.students} ({attempts.length})
        </h2>
        {attempts.length === 0 ? (
          <div className="empty">{uz.live.noStudents}</div>
        ) : (
          <div className="student-grid">
            {attempts.map((a) => (
              <StudentCard key={a.id} a={a} examId={id!} disabled={busy !== ""} />
            ))}
          </div>
        )}
      </div>

      <AlertsFeed alerts={alerts} />
    </div>
  );
}

function StudentCard({ a, examId, disabled }: { a: AttemptSummary; examId: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : uz.common.error);
    } finally {
      setBusy(false);
    }
  };
  const annulled = a.status === "ANNULLED";
  const dot = a.status === "SUBMITTED" ? "dot-done" : annulled ? "dot-annul" : a.connected ? "dot-online" : "dot-offline";

  return (
    <div className={annulled ? "student-card annulled" : "student-card"}>
      <div className="sc-head">
        <span className={`dot ${dot}`} />
        <span className="sc-name">{a.studentName}</span>
        <span className="sc-status">{uz.attemptStatus[a.status]}</span>
      </div>
      <div className="sc-stats">
        {a.warningCount > 0 && <span className="stat stat-warn">⚠ {a.warningCount}</span>}
        {a.penaltyTotal > 0 && <span className="stat stat-penalty">−{a.penaltyTotal}</span>}
        {a.extraMinutes > 0 && <span className="stat">+{a.extraMinutes}'</span>}
      </div>
      <div className="sc-actions">
        <button
          className="btn btn-xs"
          disabled={busy || disabled}
          onClick={() => void run(() => api.post(`/exams/${examId}/extend`, { minutes: 5, attemptId: a.id }))}
        >
          +5'
        </button>
        {annulled ? (
          <button className="btn btn-xs" disabled={busy} onClick={() => void run(() => api.post(`/attempts/${a.id}/unannul`))}>
            {uz.live.unannul}
          </button>
        ) : (
          <button
            className="btn btn-xs btn-danger"
            disabled={busy}
            onClick={() => confirm(uz.live.confirmAnnul) && void run(() => api.post(`/attempts/${a.id}/annul`))}
          >
            {uz.live.annul}
          </button>
        )}
      </div>
    </div>
  );
}
