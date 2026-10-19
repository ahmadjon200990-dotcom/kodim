import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Teacher } from "../lib/types";
import { uz } from "../uz";

export function Teachers() {
  const { me } = useAuth();
  const [list, setList] = useState<Teacher[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"TEACHER" | "ADMIN">("TEACHER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => void api.get<Teacher[]>("/teachers").then(setList);
  useEffect(load, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/teachers", { name: name.trim(), email: email.trim(), password, role });
      setName("");
      setEmail("");
      setPassword("");
      setRole("TEACHER");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : uz.common.error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(uz.teachers.confirmDelete)) return;
    try {
      await api.del(`/teachers/${id}`);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : uz.common.error);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>{uz.teachers.title}</h1>
      </div>
      <section className="card">
        <form className="teacher-form" onSubmit={(e) => void add(e)}>
          <input className="input" placeholder={uz.teachers.name} value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="input" type="email" placeholder={uz.teachers.email} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className="input"
            type="password"
            placeholder={uz.teachers.password}
            value={password}
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <select className="input input-auto" value={role} onChange={(e) => setRole(e.target.value as "TEACHER" | "ADMIN")}>
            <option value="TEACHER">{uz.teachers.teacher}</option>
            <option value="ADMIN">{uz.teachers.admin}</option>
          </select>
          <button className="btn btn-primary" disabled={busy}>
            + {uz.teachers.create}
          </button>
        </form>
        {error && <div className="form-error">{error}</div>}
      </section>

      <table className="table">
        <thead>
          <tr>
            <th>{uz.teachers.name}</th>
            <th>{uz.teachers.email}</th>
            <th>{uz.teachers.role}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td className="mono">{t.email}</td>
              <td>{t.role === "ADMIN" ? uz.teachers.admin : uz.teachers.teacher}</td>
              <td className="row-actions">
                {t.id !== me?.id && (
                  <button className="btn btn-xs btn-danger" onClick={() => void remove(t.id)}>
                    {uz.teachers.delete}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
