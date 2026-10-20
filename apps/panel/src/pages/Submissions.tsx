import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isReadonlyPath, uniqueFolderNames } from "@exam-ide/shared";
import type { AttemptSummary } from "@exam-ide/shared";
import { api, downloadFile } from "../lib/api";
import type { AttemptDetail, ExamFull } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, errorText, PageMessage, PageSkeleton, Skeleton, useToast } from "../components/ui";
import { uz } from "../uz";

const CodeBrowser = lazy(() => import("../components/DiffView").then((m) => ({ default: m.CodeBrowser })));

const isGraded = (a: AttemptSummary) => a.teacherScore !== null || a.aiScore !== null;

/** "Topshirilgan ishlar": har o'quvchi — alohida papka (ismi bilan), kodni ko'rish, baholash, .zip yuklab olish. */
export function Submissions() {
  const { id } = useParams();
  const toast = useToast();
  const examLoad = useLoad(() => api.get<ExamFull>(`/exams/${id}`), [id]);
  const listLoad = useLoad(() => api.get<AttemptSummary[]>(`/exams/${id}/attempts`), [id]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "ungraded">("all");
  const [busy, setBusy] = useState(false);

  // Faqat ish boshlagan o'quvchilar (kutish xonasidan nariga o'tmaganlar papkasi bo'sh).
  const rows = useMemo(() => {
    const list = (listLoad.data ?? []).filter((a) => a.status !== "JOINED").sort((x, y) => x.studentName.localeCompare(y.studentName));
    const names = uniqueFolderNames(list.map((a) => a.studentName));
    return list.map((a, i) => ({ a, folder: names[i]! }));
  }, [listLoad.data]);

  useEffect(() => {
    if (!selected && rows[0]) setSelected(rows[0].a.id);
  }, [rows, selected]);

  if (examLoad.status === "loading") return <PageSkeleton />;
  if (examLoad.status === "notFound") return <PageMessage kind="notFound" title={uz.common.examNotFound} text={uz.common.examNotFoundText} />;
  if (examLoad.status === "error") return <PageMessage kind="error" text={examLoad.error} onRetry={() => void examLoad.reload()} />;
  const exam = examLoad.data;

  const visible = rows.filter((r) => filter === "all" || (!isGraded(r.a) && r.a.status !== "ANNULLED"));
  const ungraded = rows.filter((r) => !isGraded(r.a) && r.a.status !== "ANNULLED").length;

  const downloadAll = async () => {
    setBusy(true);
    try {
      await downloadFile(`/exams/${exam.id}/download.zip`, `${exam.title}.zip`);
    } catch (e) {
      toast.error(uz.subs.downloadFailed, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/">{uz.nav.exams}</Link> / <Link to={`/exams/${exam.id}/results`}>{exam.title}</Link> / {uz.subs.title}
      </div>
      <div className="page-head">
        <div>
          <h1>
            {uz.subs.title} <StatusBadge status={exam.status} />
          </h1>
          <div className="page-sub">{uz.subs.subtitle(rows.length, ungraded)}</div>
        </div>
        <div className="row-actions">
          <Link to={`/exams/${exam.id}/results`} className="btn btn-sm">
            {uz.results.title}
          </Link>
          <button className="btn btn-primary btn-sm" disabled={busy || rows.length === 0} onClick={() => void downloadAll()}>
            ⤓ {uz.subs.downloadAll}
          </button>
        </div>
      </div>

      {listLoad.status === "loading" && (
        <div className="card">
          <Skeleton lines={5} />
        </div>
      )}
      {listLoad.status === "error" && <PageMessage kind="error" text={listLoad.error} onRetry={() => void listLoad.reload()} />}
      {listLoad.status === "ready" && rows.length === 0 && <EmptyState icon="∅" title={uz.subs.emptyTitle} text={uz.subs.empty} />}

      {rows.length > 0 && (
        <div className="subs-layout">
          <aside className="subs-list card">
            <div className="segmented">
              <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
                {uz.subs.all} ({rows.length})
              </button>
              <button className={filter === "ungraded" ? "on" : ""} onClick={() => setFilter("ungraded")}>
                {uz.subs.ungraded} ({ungraded})
              </button>
            </div>
            {visible.map(({ a, folder }) => (
              <button key={a.id} className={a.id === selected ? "sub-item active" : "sub-item"} onClick={() => setSelected(a.id)}>
                <span className="sub-folder">📁</span>
                <span className="sub-name">
                  <span className="mono">{folder}</span>
                  <span className="small muted">{uz.attemptStatus[a.status]}</span>
                </span>
                {a.status === "ANNULLED" ? (
                  <span className="badge badge-plain badge-danger">0</span>
                ) : isGraded(a) ? (
                  <span className="badge badge-plain badge-success">{a.finalScore}</span>
                ) : (
                  <span className="badge badge-plain badge-warn">{uz.subs.notGraded}</span>
                )}
              </button>
            ))}
            {visible.length === 0 && <div className="empty-inline">{uz.subs.allGraded}</div>}
          </aside>
          <div className="subs-detail">
            {selected && (
              <SubmissionDetail
                key={selected}
                attemptId={selected}
                folder={rows.find((r) => r.a.id === selected)?.folder ?? ""}
                onSaved={() => void listLoad.reload(true)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionDetail({ attemptId, folder, onSaved }: { attemptId: string; folder: string; onSaved(): void }) {
  const toast = useToast();
  const { status, data: a, error, reload } = useLoad(() => api.get<AttemptDetail>(`/attempts/${attemptId}`), [attemptId]);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!a) return;
    setScore(a.teacherScore === null ? "" : String(a.teacherScore));
    setComment(a.teacherComment ?? "");
  }, [a]);

  if (status === "loading") return <div className="card"><Skeleton lines={8} /></div>;
  if (status !== "ready") return <PageMessage kind={status === "notFound" ? "notFound" : "error"} title={uz.common.attemptNotFound} text={error} />;

  // O'qituvchi bergan faqat-o'qish materiallari (savollar.md, dizaynlar/) ko'rsatilmaydi — faqat o'quvchi ishi.
  const files = a.files.filter((f) => !isReadonlyPath(f.path));
  const save = async () => {
    const n = Number(score);
    if (score.trim() === "" || !Number.isInteger(n) || n < 0 || n > 100) return toast.error(uz.subs.scoreRange);
    setBusy(true);
    try {
      await api.put(`/attempts/${a.id}/grade`, { teacherScore: n, teacherComment: comment });
      toast.success(uz.subs.saved, a.studentName);
      await reload(true);
      onSaved();
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      await downloadFile(`/attempts/${a.id}/download.zip`, `${folder}.zip`);
    } catch (e) {
      toast.error(uz.subs.downloadFailed, errorText(e));
    }
  };

  const final = Math.max(0, (Number(score) || 0) - a.penaltyTotal);

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>
              📁 <span className="mono">{folder}</span>
            </h2>
            <div className="card-sub">
              {a.studentName} · {uz.attemptStatus[a.status]}
              {a.submittedAt && ` · ${new Date(a.submittedAt).toLocaleString("uz")}`}
            </div>
          </div>
          <div className="row-actions">
            <Link to={`/attempts/${a.id}`} className="btn btn-sm">
              {uz.subs.details}
            </Link>
            <button className="btn btn-sm" onClick={() => void download()}>
              ⤓ {uz.subs.downloadOne}
            </button>
          </div>
        </div>
        {a.status === "ANNULLED" ? (
          <div className="form-error">{uz.subs.annulled}</div>
        ) : (
          <div className="grade-box">
            <label className="field">
              <span>{uz.subs.score}</span>
              <input
                className="input input-weight"
                type="number"
                min={0}
                max={100}
                value={score}
                placeholder="0–100"
                onChange={(e) => setScore(e.target.value)}
              />
            </label>
            <label className="field grade-comment">
              <span>{uz.subs.comment}</span>
              <textarea className="input textarea-sm" value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="grade-side">
              <div className="small muted">
                {uz.subs.penalties}: <b>{a.penaltyTotal ? `−${a.penaltyTotal}` : 0}</b>
              </div>
              <div className="final-note">
                {uz.results.col.final}: <b>{score.trim() === "" ? uz.common.none : final}</b>
              </div>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
                {uz.subs.save}
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="card card-code">
        <div className="card-head">
          <h2>{uz.detail.files}</h2>
          <span className="small muted">{uz.subs.filesCount(files.length)}</span>
        </div>
        <Suspense fallback={<div style={{ padding: 16 }}><Skeleton lines={8} /></div>}>
          <CodeBrowser files={files} />
        </Suspense>
      </section>
    </>
  );
}
