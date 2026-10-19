import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { ExamListItem } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { uz } from "../uz";

export function ExamsList() {
  const [exams, setExams] = useState<ExamListItem[] | null>(null);
  const [error, setError] = useState("");
  const nav = useNavigate();

  const load = () => {
    api
      .get<ExamListItem[]>("/exams")
      .then(setExams)
      .catch(() => setError(uz.common.error));
  };
  useEffect(load, []);

  const remove = async (id: string) => {
    if (!confirm(uz.exams.confirmDelete)) return;
    try {
      await api.del(`/exams/${id}`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : uz.common.error);
    }
  };

  if (error) return <div className="muted">{error}</div>;
  if (!exams) return <div className="muted">{uz.common.loading}</div>;

  return (
    <div>
      <div className="page-head">
        <h1>{uz.exams.title}</h1>
        <Link to="/exams/new" className="btn btn-primary">
          + {uz.exams.create}
        </Link>
      </div>
      {exams.length === 0 ? (
        <div className="empty">{uz.exams.empty}</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{uz.exams.col.title}</th>
              <th>{uz.exams.col.status}</th>
              <th className="num">{uz.exams.col.students}</th>
              <th className="num">{uz.exams.col.tasks}</th>
              <th className="num">{uz.exams.col.duration}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map((e) => (
              <tr key={e.id}>
                <td>
                  <b>{e.title}</b>
                  {e.code && <span className="code-pill">{e.code}</span>}
                </td>
                <td>
                  <StatusBadge status={e.status} />
                </td>
                <td className="num">{e._count.attempts}</td>
                <td className="num">{e._count.tasks}</td>
                <td className="num">{e.durationMin}'</td>
                <td className="row-actions">
                  {(e.status === "DRAFT" || e.status === "LOBBY" || e.status === "RUNNING") && (
                    <button className="btn btn-sm" onClick={() => nav(`/exams/${e.id}/live`)}>
                      {e.status === "DRAFT" ? uz.exams.open : uz.exams.manage}
                    </button>
                  )}
                  {(e.status === "GRADING" || e.status === "FINISHED" || e.status === "RUNNING") && (
                    <button className="btn btn-sm" onClick={() => nav(`/exams/${e.id}/results`)}>
                      {uz.exams.results}
                    </button>
                  )}
                  {e.status === "DRAFT" && (
                    <>
                      <button className="btn btn-sm" onClick={() => nav(`/exams/${e.id}/edit`)}>
                        {uz.exams.edit}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => void remove(e.id)}>
                        {uz.exams.delete}
                      </button>
                    </>
                  )}
                  {e.status === "FINISHED" && (
                    <button className="btn btn-sm btn-danger" onClick={() => void remove(e.id)}>
                      {uz.exams.delete}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
