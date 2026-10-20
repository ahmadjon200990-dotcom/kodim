import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DEFAULT_ALLOWED_PACKAGES } from "@exam-ide/shared";
import type { ExamTemplate, TaskType } from "@exam-ide/shared";
import { api, ApiError } from "../lib/api";
import { PageMessage, PageSkeleton } from "../components/ui";
import { errorLines } from "../lib/errors";
import type { ExamFull } from "../lib/types";
import { uz } from "../uz";

interface TaskForm {
  title: string;
  type: TaskType;
  description: string;
  expectedOutput: string;
  figmaUrl: string;
}
interface FileForm {
  path: string;
  content: string;
}
interface CriterionForm {
  name: string;
  weight: number;
  description: string;
}

const emptyTask = (): TaskForm => ({ title: "", type: "EXERCISE", description: "", expectedOutput: "", figmaUrl: "" });

export function ExamEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const editing = Boolean(id);

  const [title, setTitle] = useState("");
  const [durationMin, setDuration] = useState(60);
  const [template, setTemplate] = useState<ExamTemplate>("HTML");
  const [tasks, setTasks] = useState<TaskForm[]>([emptyTask()]);
  const [reference, setReference] = useState<FileForm[]>([]);
  const [criteria, setCriteria] = useState<CriterionForm[]>([{ name: "", weight: 100, description: "" }]);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiModel, setAiModel] = useState<"DEFAULT" | "STRONG">("DEFAULT");
  const [packages, setPackages] = useState<string[]>([...DEFAULT_ALLOWED_PACKAGES]);
  const [newPackage, setNewPackage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "notFound" | "error">(id ? "loading" : "ready");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoadState("loading");
    void api.get<ExamFull>(`/exams/${id}`).then((e) => {
      setLoadState("ready");
      setTitle(e.title);
      setDuration(e.durationMin);
      setTemplate(e.template);
      setTasks(
        e.tasks.length
          ? e.tasks.map((t) => ({
              title: t.title,
              type: t.type,
              description: t.description,
              expectedOutput: t.expectedOutput ?? "",
              figmaUrl: t.figmaUrl ?? "",
            }))
          : [emptyTask()],
      );
      setReference(e.referenceFiles);
      setCriteria(e.criteria.length ? e.criteria : [{ name: "", weight: 100, description: "" }]);
      setAiEnabled(e.aiEnabled);
      setAiModel(e.aiModel);
      setPackages(e.allowedPackages);
    }, (err: unknown) => {
      setLoadError(err instanceof Error ? err.message : "");
      setLoadState(err instanceof ApiError && (err.status === 404 || err.status === 400) ? "notFound" : "error");
    });
  }, [id]);

  const weightSum = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  const setTask = (i: number, patch: Partial<TaskForm>) => setTasks((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setCrit = (i: number, patch: Partial<CriterionForm>) =>
    setCriteria((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setFile = (i: number, patch: Partial<FileForm>) => setReference((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setError("");
    if (tasks.length === 0) return setError(uz.edit.needTask);
    if (criteria.length === 0) return setError(uz.edit.needCriterion);
    if (weightSum !== 100) return setError(`${uz.edit.sumError}${weightSum})`);
    const body = {
      title: title.trim(),
      durationMin: Number(durationMin),
      template,
      aiEnabled,
      aiModel,
      allowedPackages: packages,
      referenceFiles: reference.filter((f) => f.path.trim()),
      starterFiles: [],
      criteria: criteria.map((c) => ({ name: c.name.trim(), weight: Number(c.weight), description: c.description })),
      tasks: tasks.map((t) => ({
        title: t.title.trim(),
        type: t.type,
        description: t.description,
        ...(t.type === "FIGMA" ? { figmaUrl: t.figmaUrl.trim() } : {}),
        ...(t.expectedOutput.trim() ? { expectedOutput: t.expectedOutput } : {}),
      })),
    };
    setBusy(true);
    try {
      if (editing) await api.put(`/exams/${id}`, body);
      else await api.post("/exams", body);
      nav("/");
    } catch (e) {
      setError(errorLines(e, uz.common.error).join("\n"));
    } finally {
      setBusy(false);
    }
  };

  if (loadState === "loading") return <PageSkeleton />;
  if (loadState === "notFound") return <PageMessage kind="notFound" title={uz.common.examNotFound} text={uz.common.examNotFoundText} />;
  if (loadState === "error") return <PageMessage kind="error" text={loadError} />;

  return (
    <div className="edit-page">
      <div className="page-head">
        <h1>{editing ? uz.edit.editTitle : uz.edit.newTitle}</h1>
      </div>

      <section className="card">
        <div className="grid-2">
          <label className="field">
            <span>{uz.edit.name}</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>{uz.edit.duration}</span>
            <input
              className="input"
              type="number"
              min={1}
              value={durationMin}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="field">
          <span>{uz.edit.template}</span>
          <select className="input" value={template} onChange={(e) => setTemplate(e.target.value as ExamTemplate)}>
            {(["EMPTY", "HTML", "REACT_VITE"] as const).map((t) => (
              <option key={t} value={t}>
                {uz.edit.templates[t]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{uz.edit.tasks}</h2>
          <button className="btn btn-sm" onClick={() => setTasks((t) => [...t, emptyTask()])}>
            + {uz.edit.addTask}
          </button>
        </div>
        {tasks.map((t, i) => (
          <div className="sub-card" key={i}>
            <div className="sub-head">
              <span className="sub-n">{i + 1}</span>
              <input
                className="input"
                placeholder={uz.edit.taskTitle}
                value={t.title}
                onChange={(e) => setTask(i, { title: e.target.value })}
              />
              <select className="input input-auto" value={t.type} onChange={(e) => setTask(i, { type: e.target.value as TaskType })}>
                <option value="EXERCISE">{uz.edit.exercise}</option>
                <option value="FIGMA">{uz.edit.figma}</option>
              </select>
              {tasks.length > 1 && (
                <button className="btn btn-sm btn-danger" onClick={() => setTasks((x) => x.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </div>
            <textarea
              className="input textarea"
              placeholder={uz.edit.description}
              value={t.description}
              onChange={(e) => setTask(i, { description: e.target.value })}
            />
            {t.type === "EXERCISE" ? (
              <input
                className="input"
                placeholder={uz.edit.expectedOutput}
                value={t.expectedOutput}
                onChange={(e) => setTask(i, { expectedOutput: e.target.value })}
              />
            ) : (
              <>
                <input
                  className="input"
                  placeholder={uz.edit.figmaUrl}
                  value={t.figmaUrl}
                  onChange={(e) => setTask(i, { figmaUrl: e.target.value })}
                />
                <div className="hint">{uz.edit.figmaHint}</div>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{uz.edit.reference}</h2>
          <button className="btn btn-sm" onClick={() => setReference((f) => [...f, { path: "", content: "" }])}>
            + {uz.edit.addFile}
          </button>
        </div>
        <div className="hint">{uz.edit.referenceHint}</div>
        {reference.map((f, i) => (
          <div className="sub-card" key={i}>
            <div className="sub-head">
              <input
                className="input mono"
                placeholder={uz.edit.filePath}
                value={f.path}
                onChange={(e) => setFile(i, { path: e.target.value })}
              />
              <button className="btn btn-sm btn-danger" onClick={() => setReference((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
            <textarea
              className="input textarea mono"
              value={f.content}
              onChange={(e) => setFile(i, { content: e.target.value })}
            />
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            {uz.edit.criteria} <span className={weightSum === 100 ? "sum-ok" : "sum-bad"}>({weightSum}%)</span>
          </h2>
          <button className="btn btn-sm" onClick={() => setCriteria((c) => [...c, { name: "", weight: 0, description: "" }])}>
            + {uz.edit.addCriterion}
          </button>
        </div>
        <div className="hint">{uz.edit.criteriaHint}</div>
        {criteria.map((c, i) => (
          <div className="crit-row" key={i}>
            <input
              className="input"
              placeholder={uz.edit.criterionName}
              value={c.name}
              onChange={(e) => setCrit(i, { name: e.target.value })}
            />
            <input
              className="input input-weight"
              type="number"
              min={0}
              max={100}
              value={c.weight}
              onChange={(e) => setCrit(i, { weight: Number(e.target.value) })}
            />
            <input
              className="input"
              placeholder={uz.edit.criterionDesc}
              value={c.description}
              onChange={(e) => setCrit(i, { description: e.target.value })}
            />
            {criteria.length > 1 && (
              <button className="btn btn-sm btn-danger" onClick={() => setCriteria((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{uz.edit.ai}</h2>
        </div>
        <label className="check">
          <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} /> {uz.edit.aiOn}
        </label>
        {aiEnabled && (
          <label className="field">
            <span>{uz.edit.aiModel}</span>
            <select className="input" value={aiModel} onChange={(e) => setAiModel(e.target.value as "DEFAULT" | "STRONG")}>
              <option value="DEFAULT">{uz.edit.modelDefault}</option>
              <option value="STRONG">{uz.edit.modelStrong}</option>
            </select>
          </label>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{uz.edit.packages}</h2>
        </div>
        <div className="pkg-list">
          {packages.map((p) => (
            <span className="pkg" key={p}>
              {p}
              <button onClick={() => setPackages((x) => x.filter((q) => q !== p))}>×</button>
            </span>
          ))}
        </div>
        <div className="pkg-add">
          <input
            className="input mono"
            placeholder="paket nomi"
            value={newPackage}
            onChange={(e) => setNewPackage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPackage.trim()) {
                setPackages((x) => [...new Set([...x, newPackage.trim().toLowerCase()])]);
                setNewPackage("");
              }
            }}
          />
          <button
            className="btn btn-sm"
            onClick={() => {
              if (newPackage.trim()) {
                setPackages((x) => [...new Set([...x, newPackage.trim().toLowerCase()])]);
                setNewPackage("");
              }
            }}
          >
            + {uz.edit.addPackage}
          </button>
        </div>
      </section>

      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn" onClick={() => nav("/")}>
          {uz.edit.cancel}
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? uz.edit.saving : uz.edit.save}
        </button>
      </div>
    </div>
  );
}
