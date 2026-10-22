import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { errorLines } from "../lib/errors";
import { useAuth } from "../lib/auth";
import type { Teacher } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import { errorText, PageMessage, Skeleton, useModal, useToast } from "../components/ui";
import { uz } from "../uz";

export function Teachers() {
  const { me } = useAuth();
  const modal = useModal();
  const toast = useToast();
  const { status, data: list, error: loadError, reload } = useLoad(() => api.get<Teacher[]>("/teachers"), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"TEACHER" | "ADMIN">("TEACHER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(`${uz.teachers.name}: ${uz.common.required}`);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(uz.login.emailRequired);
    if (password.length < 8) return setError(uz.teachers.passwordShort);
    setBusy(true);
    setError("");
    try {
      await api.post("/teachers", { name: name.trim(), email: email.trim(), password, role });
      toast.success(uz.teachers.created, name.trim());
      setName("");
      setEmail("");
      setPassword("");
      setRole("TEACHER");
      void reload(true);
    } catch (err) {
      setError(errorLines(err, uz.common.error).join("\n"));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (t: Teacher, body: { disabled?: boolean; role?: "ADMIN" | "TEACHER" }) => {
    if (body.disabled === true) {
      const yes = await modal.confirm({ title: uz.teachers.confirmDisable, text: uz.teachers.confirmDisableText(t.name), okLabel: uz.teachers.disable, danger: true });
      if (!yes) return;
    }
    if (body.role === "ADMIN") {
      const yes = await modal.confirm({ title: uz.teachers.confirmAdmin, text: uz.teachers.confirmAdminText(t.name), okLabel: uz.teachers.makeAdmin });
      if (!yes) return;
    }
    try {
      await api.patch(`/teachers/${t.id}`, body);
      toast.success(body.disabled === true ? uz.teachers.disabledToast : body.disabled === false ? uz.teachers.enabledToast : uz.teachers.roleToast);
      void reload(true);
    } catch (err) {
      toast.error(uz.common.error, errorText(err));
    }
  };

  const remove = async (t: Teacher) => {
    const yes = await modal.confirm({
      title: uz.teachers.confirmDelete,
      text: uz.teachers.confirmDeleteText(t.name),
      okLabel: uz.teachers.delete,
      danger: true,
    });
    if (!yes) return;
    try {
      await api.del(`/teachers/${t.id}`);
      toast.success(uz.teachers.deleted);
      void reload(true);
    } catch (err) {
      toast.error(uz.common.error, errorText(err));
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{uz.teachers.title}</h1>
          <div className="page-sub">{uz.teachers.subtitle}</div>
        </div>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>{uz.teachers.add}</h2>
        </div>
        <form className="grid-2" onSubmit={(e) => void add(e)} noValidate>
          <label className="field">
            <span>{uz.teachers.name}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>{uz.teachers.email}</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>{uz.teachers.password}</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>{uz.teachers.role}</span>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as "TEACHER" | "ADMIN")}>
              <option value="TEACHER">{uz.teachers.teacher}</option>
              <option value="ADMIN">{uz.teachers.admin}</option>
            </select>
          </label>
          <div>
            <button className="btn btn-primary" disabled={busy}>
              + {uz.teachers.create}
            </button>
          </div>
        </form>
        {error && <div className="form-error">{error}</div>}
      </section>

      {status === "loading" && (
        <div className="card">
          <Skeleton lines={3} height={20} />
        </div>
      )}
      {(status === "error" || status === "notFound") && <PageMessage kind="error" text={loadError} onRetry={() => void reload()} />}
      {list && (
        <div className="table-wrap">
          <table className="table table-mobile">
            <thead>
              <tr>
                <th>{uz.teachers.name}</th>
                <th>{uz.teachers.email}</th>
                <th>{uz.teachers.role}</th>
                <th>{uz.teachers.status}</th>
                <th>{uz.teachers.lastLogin}</th>
                <th className="num">{uz.teachers.exams}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="cell-main">
                    <b>{t.name}</b>
                    {t.id === me?.id && <span className="muted small"> ({uz.teachers.you})</span>}
                  </td>
                  <td className="mono">
                    {t.email}
                    <span className="muted small"> · {t.google ? uz.teachers.viaGoogle : uz.teachers.viaPassword}</span>
                  </td>
                  <td>
                    <span className={t.role === "ADMIN" ? "badge badge-plain badge-lobby" : "badge badge-plain badge-draft"}>
                      {t.role === "ADMIN" ? uz.teachers.admin : uz.teachers.teacher}
                    </span>
                  </td>
                  <td>
                    <span className={t.disabled ? "badge badge-danger" : "badge badge-success"}>{t.disabled ? uz.teachers.disabled : uz.teachers.active}</span>
                  </td>
                  <td className="muted small">{t.lastLoginAt ? new Date(t.lastLoginAt).toLocaleString("uz-UZ") : uz.teachers.never}</td>
                  <td className="num">{t.examCount ?? 0}</td>
                  <td>
                    <div className="row-actions">
                      {t.id !== me?.id && (
                        <>
                          <button className="btn btn-xs" onClick={() => void patch(t, { role: t.role === "ADMIN" ? "TEACHER" : "ADMIN" })}>
                            {t.role === "ADMIN" ? uz.teachers.makeTeacher : uz.teachers.makeAdmin}
                          </button>
                          <button className="btn btn-xs" onClick={() => void patch(t, { disabled: !t.disabled })}>
                            {t.disabled ? uz.teachers.enable : uz.teachers.disable}
                          </button>
                          <button className="btn btn-xs btn-danger" onClick={() => void remove(t)}>
                            {uz.teachers.delete}
                          </button>
                        </>
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
