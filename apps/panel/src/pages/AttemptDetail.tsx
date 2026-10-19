import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AiResult } from "@exam-ide/shared";
import { api } from "../lib/api";
import type { AttemptDetail, ExamFull } from "../lib/types";
import { uz } from "../uz";

const DiffView = lazy(() => import("../components/DiffView").then((m) => ({ default: m.DiffView })));

const time = (iso: string) => new Date(iso).toLocaleString("uz", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

interface CritEdit {
  name: string;
  weight: number;
  score: number;
  comment: string;
}

export function AttemptDetailPage() {
  const { id } = useParams();
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [exam, setExam] = useState<ExamFull | null>(null);
  const [crits, setCrits] = useState<CritEdit[]>([]);
  const [comment, setComment] = useState("");
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const a = await api.get<AttemptDetail>(`/attempts/${id}`);
    setAttempt(a);
    setComment(a.teacherComment ?? "");
    const e = await api.get<ExamFull>(`/exams/${a.examId}`);
    setExam(e);
    const aiCrit = (a.aiResult as AiResult | null)?.criteria;
    const base =
      a.teacherCriteria ??
      aiCrit ??
      e.criteria.map((c) => ({ name: c.name, weight: c.weight, score: 0, comment: "" }));
    setCrits(base.map((c) => ({ name: c.name, weight: c.weight, score: c.score, comment: c.comment })));
    if (!activeFile && a.files.length) setActiveFile(a.files[0]?.path ?? null);
  };
  useEffect(() => {
    void load();
  }, [id]);

  const ai = useMemo(() => (attempt?.aiResult as AiResult | null) ?? null, [attempt]);
  const totalScore = crits.reduce((s, c) => s + (Number(c.score) || 0), 0);

  const referenceFor = (path: string) => exam?.referenceFiles.find((f) => f.path === path)?.content ?? "";

  const saveGrade = async () => {
    setBusy("grade");
    setMsg("");
    try {
      await api.put(`/attempts/${id}/grade`, {
        criteria: crits.map((c) => ({ name: c.name, score: Number(c.score), comment: c.comment })),
        teacherComment: comment,
      });
      await load();
      setMsg("✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : uz.common.error);
    } finally {
      setBusy("");
    }
  };

  const regrade = async () => {
    setBusy("regrade");
    try {
      await api.post(`/attempts/${id}/regrade`);
      setMsg("AI navbatga qo'yildi");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : uz.common.error);
    } finally {
      setBusy("");
    }
  };

  const removePenalty = async (pid: string) => {
    await api.del(`/penalties/${pid}`);
    await load();
  };

  if (!attempt || !exam) return <div className="muted">{uz.common.loading}</div>;

  return (
    <div className="detail-page">
      <div className="page-head">
        <h1>
          {attempt.studentName}{" "}
          <span className="muted small">
            · {uz.attemptStatus[attempt.status]} · {uz.gradedBy[attempt.gradedBy]}
          </span>
        </h1>
        <div className="row-actions">
          <Link to={`/exams/${attempt.examId}/results`} className="btn btn-sm">
            ← {uz.detail.title}
          </Link>
          {exam.aiEnabled && (
            <button className="btn btn-sm" disabled={busy !== ""} onClick={() => void regrade()}>
              {uz.detail.regrade}
            </button>
          )}
        </div>
      </div>

      <div className="detail-cols">
        <div className="detail-left">
          <section className="card">
            <div className="card-head">
              <h2>
                {uz.detail.criteria} <span className="muted">({totalScore} / 100)</span>
              </h2>
            </div>
            {crits.map((c, i) => (
              <div className="grade-crit" key={c.name}>
                <div className="gc-top">
                  <span className="gc-name">{c.name}</span>
                  <span className="gc-weight muted">/ {c.weight}</span>
                  <input
                    className="input input-weight"
                    type="number"
                    min={0}
                    max={c.weight}
                    value={c.score}
                    onChange={(e) => setCrits((x) => x.map((y, j) => (j === i ? { ...y, score: Number(e.target.value) } : y)))}
                  />
                </div>
                <textarea
                  className="input textarea-sm"
                  placeholder={uz.detail.comment}
                  value={c.comment}
                  onChange={(e) => setCrits((x) => x.map((y, j) => (j === i ? { ...y, comment: e.target.value } : y)))}
                />
              </div>
            ))}
            <label className="field">
              <span>{uz.detail.overall}</span>
              <textarea className="input textarea-sm" value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="grade-foot">
              <span className="final-note">
                {uz.results.col.final}: <b>{attempt.finalScore}</b>
                {attempt.penaltyTotal > 0 && <span className="muted"> (−{attempt.penaltyTotal})</span>}
              </span>
              <div className="row-actions">
                {msg && <span className="muted small">{msg}</span>}
                <button className="btn btn-primary btn-sm" disabled={busy !== ""} onClick={() => void saveGrade()}>
                  {uz.detail.save}
                </button>
              </div>
            </div>
          </section>

          {ai && (
            <section className="card">
              <div className="card-head">
                <h2>{uz.detail.aiSummary}</h2>
              </div>
              <p>{ai.summary}</p>
              {ai.strengths.length > 0 && (
                <>
                  <div className="ai-sub">{uz.detail.strengths}</div>
                  <ul>{ai.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
              {ai.improvements.length > 0 && (
                <>
                  <div className="ai-sub">{uz.detail.improvements}</div>
                  <ul>{ai.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
            </section>
          )}
          {attempt.aiError && <div className="form-error">AI xato: {attempt.aiError}</div>}

          <section className="card">
            <div className="card-head">
              <h2>{uz.detail.penaltiesList}</h2>
            </div>
            {attempt.penalties.length === 0 ? (
              <div className="muted small">{uz.common.none}</div>
            ) : (
              <ul className="penalty-list">
                {attempt.penalties.map((p) => (
                  <li key={p.id}>
                    <span className="pen-pts">−{p.points}</span>
                    <span className="pen-reason">{p.reason}</span>
                    <button className="btn btn-xs btn-danger" onClick={() => void removePenalty(p.id)}>
                      {uz.detail.removePenalty}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{uz.detail.events}</h2>
            </div>
            <div className="event-log">
              {attempt.events.map((e) => (
                <div className={`event-row ev-${e.severity.toLowerCase()}`} key={e.id}>
                  <span className="ev-time">{time(e.createdAt)}</span>
                  <span className="ev-type">{uz.eventNames[e.type] ?? e.type}</span>
                  <span className="ev-detail mono">{eventDetail(e.type, e.details)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="detail-right">
          <section className="card card-code">
            <div className="card-head">
              <h2>{uz.detail.files}</h2>
            </div>
            <div className="file-tabs">
              {attempt.files.map((f) => (
                <button
                  key={f.path}
                  className={f.path === activeFile ? "file-tab active" : "file-tab"}
                  onClick={() => setActiveFile(f.path)}
                >
                  {f.path}
                </button>
              ))}
            </div>
            {activeFile && (
              <Suspense fallback={<div className="muted small">{uz.common.loading}</div>}>
                <DiffView
                  path={activeFile}
                  student={attempt.files.find((f) => f.path === activeFile)?.content ?? ""}
                  reference={referenceFor(activeFile)}
                />
              </Suspense>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function eventDetail(type: string, details: unknown): string {
  const d = (details ?? {}) as Record<string, unknown>;
  if (d.line) return String(d.line);
  if (d.process) return String(d.process);
  if (d.path) return String(d.path);
  if (Array.isArray(d.packages)) return d.packages.join(", ");
  if (d.durationSec) return `${String(d.durationSec)} s`;
  return "";
}
