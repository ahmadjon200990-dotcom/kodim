import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AttemptSummary } from "@exam-ide/shared";
import { api, downloadExport } from "../lib/api";
import type { ExamFull } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, PageMessage, PageSkeleton, useToast } from "../components/ui";
import { uz } from "../uz";
import { Icon } from "../components/Icon";

type SortKey = "name" | "final" | "ai" | "warnings";

export function Results() {
  const { id } = useParams();
  const toast = useToast();
  const [sort, setSort] = useState<SortKey>("final");
  const examLoad = useLoad(() => api.get<ExamFull>(`/exams/${id}`), [id]);
  const rowsLoad = useLoad(() => api.get<AttemptSummary[]>(`/exams/${id}/attempts`), [id]);
  const { reload: reloadRows } = rowsLoad;

  // Baholash davomida natijalar o'zgarib turadi — jim yangilash.
  useEffect(() => {
    const t = window.setInterval(() => void reloadRows(true), 4000);
    return () => window.clearInterval(t);
  }, [reloadRows]);

  const rows = rowsLoad.data;
  const sorted = useMemo(() => {
    const r = [...(rows ?? [])];
    r.sort((a, b) => {
      if (sort === "name") return a.studentName.localeCompare(b.studentName);
      if (sort === "ai") return (b.aiScore ?? -1) - (a.aiScore ?? -1);
      if (sort === "warnings") return b.warningCount - a.warningCount;
      return b.finalScore - a.finalScore;
    });
    return r;
  }, [rows, sort]);

  if (examLoad.status === "loading") return <PageSkeleton />;
  if (examLoad.status === "notFound")
    return <PageMessage kind="notFound" title={uz.common.examNotFound} text={uz.common.examNotFoundText} />;
  if (examLoad.status === "error") return <PageMessage kind="error" text={examLoad.error} onRetry={() => void examLoad.reload()} />;
  const exam = examLoad.data;

  const exportXlsx = async () => {
    try {
      await downloadExport(exam.id, `${exam.title}.xlsx`);
      toast.success(uz.results.exported);
    } catch {
      toast.error(uz.results.exportFailed);
    }
  };

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={`${cls} sortable ${sort === key ? "sorted" : ""}`} onClick={() => setSort(key)}>
      {label}
    </th>
  );

  const submitted = sorted.filter((a) => a.status === "SUBMITTED").length;
  const graded = (a: AttemptSummary) => a.teacherScore !== null || a.aiScore !== null;
  const gradedRows = sorted.filter((a) => graded(a) || a.status === "ANNULLED");
  const avg = gradedRows.length ? Math.round(gradedRows.reduce((s, a) => s + a.finalScore, 0) / gradedRows.length) : 0;
  const ungradedCount = sorted.filter((a) => !graded(a) && a.status !== "ANNULLED" && a.status !== "JOINED").length;
  // AI baholash bu versiyada o'chiq — AI ustunlari faqat AI yoqilgan (eski) imtihonlarda.
  const ai = exam.aiEnabled;

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/">{uz.nav.exams}</Link> / {exam.title}
      </div>
      <div className="page-head">
        <div>
          <h1>
            {uz.results.title} <StatusBadge status={exam.status} />
          </h1>
          <div className="page-sub">{exam.title}</div>
        </div>
        <div className="row-actions">
          <Link to={`/exams/${exam.id}/live`} className="btn btn-sm">
            {uz.live.title}
          </Link>
          <Link to={`/exams/${exam.id}/submissions`} className="btn btn-sm">
            <Icon name="folder" /> {uz.subs.title}
          </Link>
          <button className="btn btn-primary btn-sm" onClick={() => void exportXlsx()} disabled={sorted.length === 0}>
            ⤓ {uz.results.export}
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-label">{uz.results.statStudents}</div>
          <div className="stat-value">{sorted.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{uz.results.statSubmitted}</div>
          <div className="stat-value">{submitted}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{uz.results.statUngraded}</div>
          <div className="stat-value" style={{ color: ungradedCount ? "var(--warn)" : undefined }}>{ungradedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{uz.results.statAverage}</div>
          <div className="stat-value">{avg}</div>
        </div>
      </div>

      {rowsLoad.status === "error" && <PageMessage kind="error" text={rowsLoad.error} onRetry={() => void reloadRows()} />}
      {rowsLoad.status === "ready" && sorted.length === 0 && (
        <EmptyState icon="∅" title={uz.results.emptyTitle} text={uz.results.empty} />
      )}
      {sorted.length > 0 && (
        <div className="table-wrap">
          <table className="table table-mobile">
            <thead>
              <tr>
                <th className="num">{uz.results.col.n}</th>
                {th("name", uz.results.col.name)}
                {ai && <th>{uz.results.col.aiState}</th>}
                {ai && th("ai", uz.results.col.ai, "num")}
                <th className="num">{uz.results.col.teacher}</th>
                <th className="num">{uz.results.col.penalties}</th>
                {th("final", uz.results.col.final, "num")}
                <th>{uz.results.col.status}</th>
                {th("warnings", uz.results.col.warnings, "num")}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => (
                <tr key={a.id} className={a.status === "ANNULLED" ? "annulled-row" : !graded(a) && a.status !== "JOINED" ? "row-ungraded" : ""}>
                  <td className="num">{i + 1}</td>
                  <td className="cell-main">
                    <Link to={`/attempts/${a.id}`} className="title-cell">
                      {a.studentName}
                    </Link>
                  </td>
                  {ai && (
                    <td data-label={uz.results.col.aiState}>
                      <AiState a={a} exam={exam} />
                    </td>
                  )}
                  {ai && (
                    <td className="num" data-label={uz.results.col.ai}>
                      {a.aiScore ?? uz.common.none}
                    </td>
                  )}
                  <td className="num" data-label={uz.results.col.teacher}>
                    {a.teacherScore ?? (a.status === "ANNULLED" || a.status === "JOINED" ? uz.common.none : <span className="badge badge-plain badge-warn">{uz.subs.notGraded}</span>)}
                  </td>
                  <td className="num" data-label={uz.results.col.penalties}>
                    {a.penaltyTotal > 0 ? <span className="badge badge-plain badge-danger">−{a.penaltyTotal}</span> : uz.common.none}
                  </td>
                  <td className="num" data-label={uz.results.col.final}>
                    <b>{graded(a) || a.status === "ANNULLED" ? a.finalScore : uz.common.none}</b>
                  </td>
                  <td data-label={uz.results.col.status}>{uz.attemptStatus[a.status]}</td>
                  <td className="num" data-label={uz.results.col.warnings}>
                    {a.warningCount ? <span className="badge badge-plain badge-warn">{a.warningCount}</span> : uz.common.none}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/exams/${exam.id}/submissions`} className="btn btn-xs">
                        {uz.subs.grade}
                      </Link>
                      <Link to={`/attempts/${a.id}`} className="btn btn-xs">
                        {uz.results.col.detail}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** AI baholash holati (CLAUDE.md 7.5): tayyor / xato (sababi tooltipda) / baholanmoqda / o'chiq. */
function AiState({ a, exam }: { a: AttemptSummary; exam: ExamFull }) {
  const t = uz.results.aiState;
  if (!exam.aiEnabled) return <span className="ai-state ai-off">{t.off}</span>;
  if (a.aiScore !== null) return <span className="ai-state ai-ready">{t.ready}</span>;
  if (a.aiError) {
    return (
      <span className="ai-state ai-error" title={a.aiError}>
        {t.error}
      </span>
    );
  }
  if (exam.status === "GRADING") return <span className="ai-state ai-grading">{t.grading}</span>;
  return <span className="muted">{t.none}</span>;
}
