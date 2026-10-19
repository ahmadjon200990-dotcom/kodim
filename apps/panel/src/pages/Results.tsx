import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AttemptSummary } from "@exam-ide/shared";
import { api, downloadExport } from "../lib/api";
import type { ExamFull } from "../lib/types";
import { uz } from "../uz";

type SortKey = "name" | "final" | "ai" | "warnings";

export function Results() {
  const { id } = useParams();
  const [exam, setExam] = useState<ExamFull | null>(null);
  const [rows, setRows] = useState<AttemptSummary[]>([]);
  const [sort, setSort] = useState<SortKey>("final");
  const [error, setError] = useState("");

  const load = () => {
    void api.get<AttemptSummary[]>(`/exams/${id}/attempts`).then(setRows);
  };
  useEffect(() => {
    void api.get<ExamFull>(`/exams/${id}`).then(setExam);
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [id]);

  const sorted = useMemo(() => {
    const r = [...rows];
    r.sort((a, b) => {
      if (sort === "name") return a.studentName.localeCompare(b.studentName);
      if (sort === "ai") return (b.aiScore ?? -1) - (a.aiScore ?? -1);
      if (sort === "warnings") return b.warningCount - a.warningCount;
      return b.finalScore - a.finalScore;
    });
    return r;
  }, [rows, sort]);

  const exportXlsx = async () => {
    try {
      await downloadExport(id!, `${exam?.title ?? "natijalar"}.xlsx`);
    } catch {
      setError("Excel yuklab bo'lmadi");
    }
  };

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={`${cls} sortable ${sort === key ? "sorted" : ""}`} onClick={() => setSort(key)}>
      {label}
    </th>
  );

  return (
    <div>
      <div className="page-head">
        <h1>
          {uz.results.title}: {exam?.title}
        </h1>
        <div className="row-actions">
          <Link to={`/exams/${id}/live`} className="btn btn-sm">
            {uz.live.title}
          </Link>
          <button className="btn btn-primary btn-sm" onClick={() => void exportXlsx()}>
            ⤓ {uz.results.export}
          </button>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      <table className="table">
        <thead>
          <tr>
            <th className="num">{uz.results.col.n}</th>
            {th("name", uz.results.col.name)}
            <th>{uz.results.col.aiState}</th>
            {th("ai", uz.results.col.ai, "num")}
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
            <tr key={a.id} className={a.status === "ANNULLED" ? "annulled-row" : ""}>
              <td className="num">{i + 1}</td>
              <td>{a.studentName}</td>
              <td>
                <AiState a={a} exam={exam} />
              </td>
              <td className="num">{a.aiScore ?? uz.common.none}</td>
              <td className="num">{a.teacherScore ?? uz.common.none}</td>
              <td className="num">{a.penaltyTotal > 0 ? `−${a.penaltyTotal}` : uz.common.none}</td>
              <td className="num">
                <b>{a.finalScore}</b>
              </td>
              <td>{uz.attemptStatus[a.status]}</td>
              <td className="num">{a.warningCount || uz.common.none}</td>
              <td>
                <Link to={`/attempts/${a.id}`} className="btn btn-xs">
                  {uz.results.col.detail}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** AI baholash holati (CLAUDE.md 7.5): tayyor / xato (sababi tooltipda) / baholanmoqda / o'chiq. */
function AiState({ a, exam }: { a: AttemptSummary; exam: ExamFull | null }) {
  const t = uz.results.aiState;
  if (exam && !exam.aiEnabled) return <span className="ai-state ai-off">{t.off}</span>;
  if (a.aiScore !== null) return <span className="ai-state ai-ready">{t.ready}</span>;
  if (a.aiError) {
    return (
      <span className="ai-state ai-error" title={a.aiError}>
        {t.error}
      </span>
    );
  }
  if (exam?.status === "GRADING") return <span className="ai-state ai-grading">{t.grading}</span>;
  return <span className="muted">{t.none}</span>;
}
