import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { ExamListItem } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, errorText, PageMessage, Skeleton, useModal, useToast } from "../components/ui";
import { uz } from "../uz";

export function ExamsList() {
  const nav = useNavigate();
  const modal = useModal();
  const toast = useToast();
  const { status, data: exams, error, reload } = useLoad(() => api.get<ExamListItem[]>("/exams"), []);

  const remove = async (e: ExamListItem) => {
    const yes = await modal.confirm({
      title: uz.exams.confirmDeleteTitle,
      text: uz.exams.confirmDelete(e.title),
      okLabel: uz.exams.delete,
      danger: true,
    });
    if (!yes) return;
    try {
      await api.del(`/exams/${e.id}`);
      toast.success(uz.exams.deleted);
      void reload(true);
    } catch (err) {
      toast.error(uz.common.error, errorText(err));
    }
  };

  const head = (
    <div className="page-head">
      <div>
        <h1>{uz.exams.title}</h1>
        <div className="page-sub">{uz.exams.subtitle}</div>
      </div>
      <Link to="/exams/new" className="btn btn-primary">
        + {uz.exams.create}
      </Link>
    </div>
  );

  if (status === "loading")
    return (
      <div>
        {head}
        <div className="card">
          <Skeleton lines={6} height={20} />
        </div>
      </div>
    );
  if (status === "error" || status === "notFound")
    return (
      <div>
        {head}
        <PageMessage kind="error" text={error} onRetry={() => void reload()} />
      </div>
    );

  const list = exams ?? [];
  const active = list.filter((e) => e.status === "LOBBY" || e.status === "RUNNING").length;
  const students = list.reduce((s, e) => s + e._count.attempts, 0);

  return (
    <div>
      {head}
      <div className="stats">
        <div className="stat-card">
          <div className="stat-label">{uz.exams.statTotal}</div>
          <div className="stat-value">{list.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{uz.exams.statActive}</div>
          <div className="stat-value">{active}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{uz.exams.statStudents}</div>
          <div className="stat-value">{students}</div>
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon="+"
          title={uz.exams.emptyTitle}
          text={uz.exams.empty}
          action={
            <Link to="/exams/new" className="btn btn-primary">
              + {uz.exams.create}
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table table-mobile">
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
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="cell-main">
                    <Link
                      to={e.status === "GRADING" || e.status === "FINISHED" ? `/exams/${e.id}/results` : `/exams/${e.id}/live`}
                      className="title-cell"
                    >
                      {e.title}
                    </Link>
                    {e.code && <span className="code-pill">{e.code}</span>}
                    <div className="small muted">{e.teacher.name}</div>
                  </td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="num" data-label={uz.exams.col.students}>
                    {e._count.attempts}
                  </td>
                  <td className="num" data-label={uz.exams.col.tasks}>
                    {e._count.tasks}
                  </td>
                  <td className="num" data-label={uz.exams.col.duration}>
                    {e.durationMin} {uz.exams.min}
                  </td>
                  <td>
                    <div className="row-actions">
                      {(e.status === "DRAFT" || e.status === "LOBBY" || e.status === "RUNNING") && (
                        <button className="btn btn-sm btn-primary" onClick={() => nav(`/exams/${e.id}/live`)}>
                          {e.status === "DRAFT" ? uz.exams.open : uz.exams.manage}
                        </button>
                      )}
                      {(e.status === "GRADING" || e.status === "FINISHED" || e.status === "RUNNING") && (
                        <>
                          <button className="btn btn-sm" onClick={() => nav(`/exams/${e.id}/submissions`)}>
                            📁 {uz.subs.open}
                          </button>
                          <button className="btn btn-sm" onClick={() => nav(`/exams/${e.id}/results`)}>
                            {uz.exams.results}
                          </button>
                        </>
                      )}
                      {e.status === "DRAFT" && (
                        <button className="btn btn-sm" onClick={() => nav(`/exams/${e.id}/edit`)}>
                          {uz.exams.edit}
                        </button>
                      )}
                      {(e.status === "DRAFT" || e.status === "FINISHED") && (
                        <button className="btn btn-sm btn-danger" onClick={() => void remove(e)}>
                          {uz.exams.delete}
                        </button>
                      )}
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
