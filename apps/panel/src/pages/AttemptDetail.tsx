import { isReadonlyPath } from "@exam-ide/shared";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AiResult } from "@exam-ide/shared";
import { api } from "../lib/api";
import { eventSummary } from "../lib/events";
import type { AttemptDetail, ExamFull } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import { errorText, PageMessage, PageSkeleton, Skeleton, useModal, useToast } from "../components/ui";
import { uz } from "../uz";

const CodeBrowser = lazy(() => import("../components/DiffView").then((m) => ({ default: m.CodeBrowser })));

const time = (iso: string) => new Date(iso).toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

interface CritEdit {
  name: string;
  weight: number;
  score: number;
  comment: string;
}

export function AttemptDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const modal = useModal();
  const { status, data, error, reload } = useLoad(async () => {
    const attempt = await api.get<AttemptDetail>(`/attempts/${id}`);
    const exam = await api.get<ExamFull>(`/exams/${attempt.examId}`);
    return { attempt, exam };
  }, [id]);
  const [crits, setCrits] = useState<CritEdit[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [showCommands, setShowCommands] = useState(true);

  // Ma'lumot kelganda tahrirlash formasi to'ldiriladi.
  useEffect(() => {
    if (!data) return;
    const { attempt: a, exam: e } = data;
    setComment(a.teacherComment ?? "");
    const aiCrit = (a.aiResult as AiResult | null)?.criteria;
    const base = a.teacherCriteria ?? aiCrit ?? e.criteria.map((c) => ({ name: c.name, weight: c.weight, score: 0, comment: "" }));
    setCrits(base.map((c) => ({ name: c.name, weight: c.weight, score: c.score, comment: c.comment })));
  }, [data]);

  const ai = useMemo(() => (data?.attempt.aiResult as AiResult | null) ?? null, [data]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "notFound")
    return <PageMessage kind="notFound" title={uz.common.attemptNotFound} text={uz.common.attemptNotFoundText} />;
  if (status === "error") return <PageMessage kind="error" text={error} onRetry={() => void reload()} />;
  const { attempt, exam } = data;

  const totalScore = crits.reduce((s, c) => s + (Number(c.score) || 0), 0);
  const overWeight = crits.find((c) => c.score > c.weight || c.score < 0);

  const saveGrade = async () => {
    if (overWeight) return toast.error(uz.detail.overWeight(overWeight.name, overWeight.weight));
    setBusy("grade");
    try {
      await api.put(`/attempts/${attempt.id}/grade`, {
        criteria: crits.map((c) => ({ name: c.name, score: Number(c.score), comment: c.comment })),
        teacherComment: comment,
      });
      toast.success(uz.detail.saved);
      await reload(true);
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    } finally {
      setBusy("");
    }
  };

  const regrade = async () => {
    setBusy("regrade");
    try {
      await api.post(`/attempts/${attempt.id}/regrade`);
      toast.success(uz.detail.regradeQueued);
    } catch (e) {
      toast.error(uz.detail.regrade, errorText(e));
    } finally {
      setBusy("");
    }
  };

  const removePenalty = async (pid: string, points: number) => {
    const yes = await modal.confirm({ title: uz.detail.removePenaltyTitle, text: uz.detail.removePenaltyText(points), okLabel: uz.detail.removePenalty, danger: true });
    if (!yes) return;
    try {
      await api.del(`/penalties/${pid}`);
      await reload(true);
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    }
  };

  const events = showCommands ? attempt.events : attempt.events.filter((e) => e.type !== "TERMINAL_COMMAND");
  const files = attempt.files.filter((f) => !isReadonlyPath(f.path));

  return (
    <div className="detail-page">
      <div className="breadcrumb">
        <Link to="/">{uz.nav.exams}</Link> / <Link to={`/exams/${exam.id}/results`}>{exam.title}</Link> / {attempt.studentName}
      </div>
      <div className="page-head">
        <div>
          <h1>{attempt.studentName}</h1>
          <div className="page-sub row-actions">
            <span className="badge badge-plain badge-info">{uz.attemptStatus[attempt.status]}</span>
            {exam.aiEnabled && (
              <span className={attempt.gradedBy === "TEACHER" ? "badge badge-plain badge-lobby" : "badge badge-plain badge-info"}>
                {uz.gradedBy[attempt.gradedBy]}
              </span>
            )}
          </div>
        </div>
        <div className="row-actions">
          <Link to={`/exams/${exam.id}/results`} className="btn btn-sm">
            ← {uz.results.title}
          </Link>
          {exam.aiEnabled && (
            <button className="btn btn-sm" disabled={busy !== ""} onClick={() => void regrade()}>
              {uz.detail.regrade}
            </button>
          )}
        </div>
      </div>

      <div className="stats">
        {exam.aiEnabled && (
          <div className="stat-card">
            <div className="stat-label">{uz.results.col.ai}</div>
            <div className="stat-value">{attempt.aiScore ?? uz.common.none}</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">{uz.results.col.teacher}</div>
          <div className="stat-value">{attempt.teacherScore ?? uz.common.none}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{uz.results.col.penalties}</div>
          <div className="stat-value">{attempt.penaltyTotal ? `−${attempt.penaltyTotal}` : 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{uz.results.col.final}</div>
          <div className="stat-value">{attempt.finalScore}</div>
        </div>
      </div>

      <div className="detail-cols">
        <div className="detail-left">
          {exam.aiEnabled ? (
            <>
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
                    <input
                      className={c.score > c.weight ? "input input-weight invalid" : "input input-weight"}
                      type="number"
                      min={0}
                      max={c.weight}
                      value={c.score}
                      onChange={(e) => setCrits((x) => x.map((y, j) => (j === i ? { ...y, score: Number(e.target.value) } : y)))}
                    />
                    <span className="muted">/ {c.weight}</span>
                  </div>
                  <textarea
                    className="input textarea-sm"
                    placeholder={uz.detail.comment}
                    value={c.comment}
                    onChange={(e) => setCrits((x) => x.map((y, j) => (j === i ? { ...y, comment: e.target.value } : y)))}
                  />
                </div>
              ))}
              <label className="field" style={{ marginTop: 12 }}>
                <span>{uz.detail.overall}</span>
                <textarea className="input textarea-sm" value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
              <div className="grade-foot">
                <span className="final-note">
                  {uz.results.col.final}: <b>{attempt.finalScore}</b>
                </span>
                <button className="btn btn-primary btn-sm" disabled={busy !== ""} onClick={() => void saveGrade()}>
                  {uz.detail.save}
                </button>
              </div>
            </section>

            </>
          ) : (
            <TeacherGrade attempt={attempt} onSaved={() => void reload(true)} />
          )}
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
          {exam.aiEnabled && attempt.aiError && <div className="form-error">{uz.detail.aiError}: {attempt.aiError}</div>}

          <section className="card">
            <div className="card-head">
              <h2>{uz.detail.penaltiesList}</h2>
            </div>
            {attempt.penalties.length === 0 ? (
              <div className="muted small">{uz.detail.noPenalties}</div>
            ) : (
              <ul className="penalty-list">
                {attempt.penalties.map((p) => (
                  <li key={p.id}>
                    <span className="pen-pts">−{p.points}</span>
                    <span className="pen-reason">{p.reason}</span>
                    <button className="btn btn-xs btn-danger" onClick={() => void removePenalty(p.id, p.points)}>
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
              <label className="alerts-toggle">
                <input type="checkbox" checked={showCommands} onChange={(e) => setShowCommands(e.target.checked)} />
                {uz.live.showCommands}
              </label>
            </div>
            {events.length === 0 ? (
              <div className="muted small">{uz.live.noAlerts}</div>
            ) : (
              <div className="event-log">
                {events.map((e) => (
                  <div className={`event-row ev-${e.severity.toLowerCase()}`} key={e.id}>
                    <span className="ev-time">{time(e.createdAt)}</span>
                    <span className="ev-type">{uz.eventNames[e.type] ?? e.type}</span>
                    <span className="ev-detail mono">{eventSummary(e.type, e.details)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="detail-right">
          <section className="card card-code">
            <div className="card-head">
              <div>
                <h2>{uz.detail.files}</h2>
                <div className="card-sub">{uz.detail.diffHint}</div>
              </div>
            </div>
            <Suspense fallback={<div style={{ padding: 16 }}><Skeleton lines={8} /></div>}>
              <CodeBrowser files={files} reference={exam.referenceFiles} />
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Bu versiyada baholashni faqat o'qituvchi qiladi: ball (0–100) + izoh. */
function TeacherGrade({ attempt, onSaved }: { attempt: AttemptDetail; onSaved(): void }) {
  const toast = useToast();
  const [score, setScore] = useState(attempt.teacherScore === null ? "" : String(attempt.teacherScore));
  const [comment, setComment] = useState(attempt.teacherComment ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number(score);
    if (score.trim() === "" || !Number.isInteger(n) || n < 0 || n > 100) return toast.error(uz.subs.scoreRange);
    setBusy(true);
    try {
      await api.put(`/attempts/${attempt.id}/grade`, { teacherScore: n, teacherComment: comment });
      toast.success(uz.subs.saved);
      onSaved();
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (attempt.status === "ANNULLED") return <div className="form-error">{uz.subs.annulled}</div>;
  return (
    <section className="card">
      <div className="card-head">
        <h2>{uz.subs.grade}</h2>
        {attempt.teacherScore === null && <span className="badge badge-plain badge-warn">{uz.subs.notGraded}</span>}
      </div>
      <label className="field">
        <span>{uz.subs.score}</span>
        <input className="input input-weight" type="number" min={0} max={100} value={score} placeholder="0–100" onChange={(e) => setScore(e.target.value)} />
      </label>
      <label className="field">
        <span>{uz.subs.comment}</span>
        <textarea className="input textarea-sm" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="grade-foot">
        <span className="final-note">
          {uz.results.col.final}: <b>{score.trim() === "" ? uz.common.none : Math.max(0, (Number(score) || 0) - attempt.penaltyTotal)}</b>
          {attempt.penaltyTotal > 0 && <span className="muted"> (−{attempt.penaltyTotal})</span>}
        </span>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
          {uz.subs.save}
        </button>
      </div>
    </section>
  );
}
