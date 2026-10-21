import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { COMMAND_PRESETS, DEFAULT_ALLOWED_COMMANDS, DEFAULT_ALLOWED_PACKAGES, parseFigmaUrl } from "@exam-ide/shared";
import type { DesignImage, ExamTemplate, TaskType } from "@exam-ide/shared";
import { api, ApiError } from "../lib/api";
import { formatBytes, readFolder, readZip, StarterError, type StarterFile } from "../lib/starter";
import { errorLines } from "../lib/errors";
import type { ExamFull } from "../lib/types";
import { PageMessage, PageSkeleton, useToast } from "../components/ui";
import { FigmaStatus } from "../components/FigmaStatus";
import { uz } from "../uz";

interface TaskForm {
  title: string;
  type: TaskType;
  description: string;
  expectedOutput: string;
  figmaUrl: string;
  images: DesignImage[];
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

const TEMPLATES: { id: ExamTemplate; runtime?: string }[] = [
  { id: "EMPTY" },
  { id: "HTML" },
  { id: "REACT_VITE", runtime: "node" },
  { id: "VUE_VITE", runtime: "node" },
  { id: "TYPESCRIPT", runtime: "node" },
  { id: "NODE", runtime: "node" },
  { id: "PYTHON", runtime: "python" },
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/**
 * Bu versiyada AI baholash o'chiq: mezonlar va AI sozlamalari formadan yashirilgan (kod keyingi versiya uchun qoladi),
 * baholashni o'qituvchi "Topshirilgan ishlar" bo'limida qiladi.
 */
const SHOW_AI = false;
const emptyTask = (): TaskForm => ({ title: "", type: "EXERCISE", description: "", expectedOutput: "", figmaUrl: "", images: [] });

const readImage = (file: File) =>
  new Promise<DesignImage>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read"));
    r.onload = () => resolve({ name: file.name.slice(-100) || "dizayn.png", dataUrl: String(r.result) });
    r.readAsDataURL(file);
  });

export function ExamEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);

  const [title, setTitle] = useState("");
  const [durationMin, setDuration] = useState(60);
  const [template, setTemplate] = useState<ExamTemplate>("EMPTY");
  const [tasks, setTasks] = useState<TaskForm[]>([emptyTask()]);
  const [reference, setReference] = useState<FileForm[]>([]);
  const [starter, setStarter] = useState<StarterFile[]>([]);
  const [criteria, setCriteria] = useState<CriterionForm[]>([{ name: "", weight: 100, description: "" }]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiModel, setAiModel] = useState<"DEFAULT" | "STRONG">("DEFAULT");
  const [packages, setPackages] = useState<string[]>([...DEFAULT_ALLOWED_PACKAGES]);
  const [commands, setCommands] = useState<string[]>([...DEFAULT_ALLOWED_COMMANDS]);
  const [newPackage, setNewPackage] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "notFound" | "error">(id ? "loading" : "ready");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoadState("loading");
    void api.get<ExamFull>(`/exams/${id}`).then(
      (e) => {
        setLoadState("ready");
        setTitle(e.title);
        setDuration(e.durationMin);
        setTemplate(e.template);
        setStarter(
          (e.starterFiles ?? []).map((f) => ({
            ...f,
            size: f.encoding === "base64" ? Math.floor((f.content.length * 3) / 4) : new Blob([f.content]).size,
          })),
        );
        setTasks(
          e.tasks.length
            ? e.tasks.map((t) => ({
                title: t.title,
                type: t.type,
                description: t.description,
                expectedOutput: t.expectedOutput ?? "",
                figmaUrl: t.figmaUrl ?? "",
                images: (t.images ?? []) as DesignImage[],
              }))
            : [emptyTask()],
        );
        setReference(e.referenceFiles);
        setCriteria(e.criteria.length ? e.criteria : [{ name: "", weight: 100, description: "" }]);
        setAiEnabled(e.aiEnabled);
        setAiModel(e.aiModel);
        setPackages(e.allowedPackages);
        setCommands(e.allowedCommands ?? [...DEFAULT_ALLOWED_COMMANDS]);
      },
      (err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "");
        setLoadState(err instanceof ApiError && (err.status === 404 || err.status === 400) ? "notFound" : "error");
      },
    );
  }, [id]);

  const weightSum = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const runtime = TEMPLATES.find((t) => t.id === template)?.runtime;

  const setTask = (i: number, patch: Partial<TaskForm>) => setTasks((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setCrit = (i: number, patch: Partial<CriterionForm>) => setCriteria((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setFile = (i: number, patch: Partial<FileForm>) => setReference((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const addImages = async (i: number, files: FileList | File[]) => {
    const list = [...files].filter((f) => /^image\//.test(f.type));
    const tooBig = list.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) return toast.error(uz.edit.imageTooBig(tooBig.name));
    try {
      const imgs = await Promise.all(list.map(readImage));
      setTasks((t) => t.map((x, j) => (j === i ? { ...x, images: [...x.images, ...imgs].slice(0, 10) } : x)));
    } catch {
      toast.error(uz.edit.imageReadFailed);
    }
  };

  const applyPreset = (presetId: string) => {
    const p = COMMAND_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setCommands((c) => [...new Set([...c, ...p.commands])]);
    if (p.packages?.length) setPackages((c) => [...new Set([...c, ...p.packages!])]);
  };

  const save = async () => {
    setError("");
    if (!title.trim()) return setError(`${uz.edit.name}: ${uz.common.required}`);
    if (tasks.some((t) => !t.title.trim())) return setError(uz.edit.taskTitleRequired);
    if (tasks.some((t) => t.type === "FIGMA" && !t.figmaUrl.trim() && t.images.length === 0)) return setError(uz.edit.figmaSource);
    if (tasks.some((t) => t.type === "FIGMA" && t.figmaUrl.trim() && !parseFigmaUrl(t.figmaUrl))) return setError(uz.figma.badLink);
    if (SHOW_AI && aiEnabled && weightSum !== 100) return setError(`${uz.edit.sumError}${weightSum})`);
    if (template === "CUSTOM" && starter.length === 0) return setError(uz.edit.starterEmpty);
    const body = {
      title: title.trim(),
      durationMin: Number(durationMin),
      template,
      aiEnabled: SHOW_AI ? aiEnabled : false,
      aiModel,
      allowedPackages: packages,
      allowedCommands: commands,
      referenceFiles: reference.filter((f) => f.path.trim()),
      starterFiles: template === "CUSTOM" ? starter.map(({ path, content, encoding }) => ({ path, content, ...(encoding && { encoding }) })) : [],
      // Mezonlar ixtiyoriy — bo'sh nomlilar tashlanadi; AI o'chiq bo'lsa yuborilmaydi.
      criteria: SHOW_AI ? criteria.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), weight: Number(c.weight), description: c.description })) : [],
      tasks: tasks.map((t) => ({
        title: t.title.trim(),
        type: t.type,
        description: t.description,
        // Rasmlar HAR QANDAY turda yuboriladi (avval faqat FIGMA'da yuborilardi — rasm saqlanmay qolardi).
        images: t.images,
        ...(t.type === "FIGMA" ? { figmaUrl: t.figmaUrl.trim() || undefined } : {}),
        ...(t.expectedOutput.trim() ? { expectedOutput: t.expectedOutput } : {}),
      })),
    };
    setBusy(true);
    try {
      if (editing) await api.put(`/exams/${id}`, body);
      else await api.post("/exams", body);
      toast.success(editing ? uz.edit.updated : uz.edit.saved);
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
      <div className="breadcrumb">
        <button className="btn btn-ghost btn-xs" onClick={() => nav("/")}>
          ← {uz.nav.exams}
        </button>
      </div>
      <div className="page-head">
        <h1>{editing ? uz.edit.editTitle : uz.edit.newTitle}</h1>
      </div>
      {editing && id && <FigmaStatus examId={id} />}

      <section className="card">
        <div className="grid-2">
          <label className="field">
            <span>{uz.edit.name}</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>{uz.edit.duration}</span>
            <input className="input" type="number" min={1} value={durationMin} onChange={(e) => setDuration(Number(e.target.value))} />
          </label>
        </div>
        <div className="field">
          <span>{uz.edit.template}</span>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={template === t.id ? "template-card on" : "template-card"}
                onClick={() => setTemplate(t.id)}
              >
                <div className="template-name">{uz.edit.templates[t.id]}</div>
                <div className="template-desc">{t.runtime ? uz.edit.needs(t.runtime) : uz.edit.noRuntime}</div>
              </button>
            ))}
          </div>
          <div className="hint">{uz.edit.templateHint}</div>
        </div>
        <StarterFolder
          files={starter}
          active={template === "CUSTOM"}
          onFiles={(files) => {
            setStarter(files);
            setTemplate(files.length ? "CUSTOM" : "EMPTY");
          }}
        />
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
              <input className="input" placeholder={uz.edit.taskTitle} value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} />
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
            {t.type === "EXERCISE" && (
              <input
                className="input"
                placeholder={uz.edit.expectedOutput}
                value={t.expectedOutput}
                onChange={(e) => setTask(i, { expectedOutput: e.target.value })}
              />
            )}
            {/* Dizayn rasmlari har ikki turda ham (FIGMA'da havola bilan birga yoki o'rniga). */}
            <FigmaTask
              task={t}
              showUrl={t.type === "FIGMA"}
              onUrl={(figmaUrl) => setTask(i, { figmaUrl })}
              onImages={(f) => void addImages(i, f)}
              onRemove={(j) => setTask(i, { images: t.images.filter((_, k) => k !== j) })}
            />
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
              <input className="input mono" placeholder={uz.edit.filePath} value={f.path} onChange={(e) => setFile(i, { path: e.target.value })} />
              <button className="btn btn-sm btn-danger" onClick={() => setReference((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
            <textarea className="input textarea mono" value={f.content} onChange={(e) => setFile(i, { content: e.target.value })} />
          </div>
        ))}
      </section>

      {SHOW_AI && (
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
            <input className="input" placeholder={uz.edit.criterionName} value={c.name} onChange={(e) => setCrit(i, { name: e.target.value })} />
            <input className="input input-weight" type="number" min={0} max={100} value={c.weight} onChange={(e) => setCrit(i, { weight: Number(e.target.value) })} />
            <input className="input" placeholder={uz.edit.criterionDesc} value={c.description} onChange={(e) => setCrit(i, { description: e.target.value })} />
            {criteria.length > 1 && (
              <button className="btn btn-sm btn-danger" onClick={() => setCriteria((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
      </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>{uz.edit.commands}</h2>
        </div>
        <div className="hint">{uz.edit.commandsHint}</div>
        <div className="presets">
          {COMMAND_PRESETS.map((p) => (
            <button key={p.id} className="btn btn-xs" onClick={() => applyPreset(p.id)}>
              + {p.label}
            </button>
          ))}
        </div>
        <div className="chip-list">
          {commands.map((c) => (
            <span className="chip" key={c}>
              {c}
              <button onClick={() => setCommands((x) => x.filter((q) => q !== c))}>×</button>
            </span>
          ))}
          {commands.length === 0 && <span className="muted small">{uz.edit.noCommands}</span>}
        </div>
        <div className="chip-add">
          <input
            className="input mono"
            placeholder={uz.edit.commandPlaceholder}
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCommand.trim()) {
                setCommands((x) => [...new Set([...x, newCommand.trim().toLowerCase()])]);
                setNewCommand("");
              }
            }}
          />
          <button
            className="btn btn-sm"
            onClick={() => {
              if (newCommand.trim()) {
                setCommands((x) => [...new Set([...x, newCommand.trim().toLowerCase()])]);
                setNewCommand("");
              }
            }}
          >
            + {uz.edit.addCommand}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{uz.edit.packages}</h2>
        </div>
        <div className="hint">{uz.edit.packagesHint}</div>
        <div className="chip-list">
          {packages.map((p) => (
            <span className="chip" key={p}>
              {p}
              <button onClick={() => setPackages((x) => x.filter((q) => q !== p))}>×</button>
            </span>
          ))}
        </div>
        <div className="chip-add">
          <input
            className="input mono"
            placeholder={uz.edit.packagePlaceholder}
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

      {SHOW_AI && (
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
            <select className="input input-auto" value={aiModel} onChange={(e) => setAiModel(e.target.value as "DEFAULT" | "STRONG")}>
              <option value="DEFAULT">{uz.edit.modelDefault}</option>
              <option value="STRONG">{uz.edit.modelStrong}</option>
            </select>
          </label>
        )}
      </section>
      )}

      {error && <div className="form-error">{error}</div>}
      {runtime && <div className="hint">{uz.edit.runtimeNote(runtime)}</div>}
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

function FigmaTask({
  task,
  showUrl,
  onUrl,
  onImages,
  onRemove,
}: {
  task: TaskForm;
  showUrl: boolean;
  onUrl(url: string): void;
  onImages(files: FileList | File[]): void;
  onRemove(index: number): void;
}) {
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<DesignImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {showUrl && (
        <>
          <input className="input" placeholder={uz.edit.figmaUrl} value={task.figmaUrl} onChange={(e) => onUrl(e.target.value)} />
          {task.figmaUrl.trim() && !parseFigmaUrl(task.figmaUrl) ? (
            <div className="field-error">{uz.figma.badLink}</div>
          ) : (
            <div className="hint">{uz.edit.figmaHint}</div>
          )}
        </>
      )}
      <div
        className={over ? "dropzone over" : "dropzone"}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onImages(e.dataTransfer.files);
        }}
      >
        {uz.edit.dropImages}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) onImages(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {task.images.length > 0 && (
        <div className="thumbs">
          {task.images.map((img, j) => (
            <div className="thumb" key={j}>
              <img src={img.dataUrl} alt={img.name} onClick={() => setPreview(img)} />
              <div className="thumb-name" title={img.name}>
                {img.name}
              </div>
              <button className="thumb-remove" onClick={() => onRemove(j)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <div className="modal-backdrop" onMouseDown={() => setPreview(null)}>
          <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-title">{preview.name}</div>
            <img className="image-preview" src={preview.dataUrl} alt={preview.name} />
            <div className="modal-actions">
              <button className="btn" onClick={() => setPreview(null)}>
                {uz.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Tayyor papka: .zip yuklash yoki papka tanlash (rasmlar, ikonkalar, shriftlar, boshlang'ich fayllar). */
function StarterFolder({ files, active, onFiles }: { files: StarterFile[]; active: boolean; onFiles(files: StarterFile[]): void }) {
  const toast = useToast();
  const zipRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const total = files.reduce((s, f) => s + f.size, 0);

  const load = async (fn: () => Promise<StarterFile[]>) => {
    setBusy(true);
    try {
      const list = await fn();
      onFiles(list);
      toast.success(uz.edit.starterLoaded(list.length));
    } catch (e) {
      toast.error(uz.edit.starterFailed, e instanceof StarterError ? e.message : uz.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={active ? "starter starter-on" : "starter"}>
      <div className="card-head">
        <div>
          <div className="template-name">{uz.edit.starterTitle}</div>
          <div className="template-desc">{uz.edit.starterHint}</div>
        </div>
        <div className="row-actions">
          <button className="btn btn-sm" disabled={busy} onClick={() => zipRef.current?.click()}>
            ⤒ {uz.edit.starterZip}
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => dirRef.current?.click()}>
            📁 {uz.edit.starterDir}
          </button>
          {files.length > 0 && (
            <button className="btn btn-sm btn-danger" onClick={() => onFiles([])}>
              {uz.edit.starterClear}
            </button>
          )}
        </div>
      </div>
      <input
        ref={zipRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void load(() => readZip(f));
        }}
      />
      <input
        ref={dirRef}
        type="file"
        multiple
        hidden
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (list.length) void load(() => readFolder(list));
        }}
      />
      {files.length > 0 && (
        <>
          <div className="small muted">{uz.edit.starterSummary(files.length, formatBytes(total))}</div>
          <div className="starter-files">
            {files.slice(0, 200).map((f) => (
              <div key={f.path} className="starter-file">
                <span className="mono">{f.path}</span>
                <span className="muted small">
                  {f.encoding ? uz.edit.binary : ""} {formatBytes(f.size)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
