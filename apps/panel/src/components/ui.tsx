// Panelning umumiy UI qismlari: modal oynalar (confirm/prompt), toast xabarlar, sahifa holatlari, skeletlar.
// Brauzerning confirm/prompt/alert oynalari ishlatilmaydi.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { uz } from "../uz";

// ---------- Toast ----------

type ToastKind = "success" | "error" | "info" | "danger" | "warn";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  text?: string;
}

interface ToastApi {
  show(kind: ToastKind, title: string, text?: string): void;
  success(title: string, text?: string): void;
  error(title: string, text?: string): void;
}

// ---------- Modal ----------

interface ModalRequest {
  kind: "confirm" | "prompt";
  title: string;
  text?: string;
  okLabel?: string;
  danger?: boolean;
  fields?: PromptField[];
  resolve(value: boolean | Record<string, string> | null): void;
}

export interface PromptField {
  name: string;
  label: string;
  initial?: string;
  type?: "text" | "number";
  required?: boolean;
}

interface ModalApi {
  confirm(opts: { title: string; text?: string; okLabel?: string; danger?: boolean }): Promise<boolean>;
  prompt(opts: { title: string; text?: string; okLabel?: string; fields: PromptField[] }): Promise<Record<string, string> | null>;
}

const ToastContext = createContext<ToastApi | null>(null);
const ModalContext = createContext<ModalApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("UiProvider yo'q");
  return ctx;
}

export function useModal(): ModalApi {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("UiProvider yo'q");
  return ctx;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<ModalRequest | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useMemo<ToastApi>(() => {
    const show = (kind: ToastKind, title: string, text?: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-4), { id, kind, title, text }]);
      window.setTimeout(() => dismiss(id), kind === "error" || kind === "danger" ? 7000 : 4000);
    };
    return { show, success: (t, x) => show("success", t, x), error: (t, x) => show("error", t, x) };
  }, [dismiss]);

  const modalApi = useMemo<ModalApi>(
    () => ({
      confirm: (o) =>
        new Promise((resolve) => setModal({ kind: "confirm", ...o, resolve: (v) => resolve(v === true) })),
      prompt: (o) =>
        new Promise((resolve) =>
          setModal({ kind: "prompt", ...o, resolve: (v) => resolve(v && typeof v === "object" ? v : null) }),
        ),
    }),
    [],
  );

  const close = (value: boolean | Record<string, string> | null) => {
    modal?.resolve(value);
    setModal(null);
  };

  return (
    <ToastContext.Provider value={toast}>
      <ModalContext.Provider value={modalApi}>
        {children}
        {modal && <ModalView request={modal} onClose={close} />}
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
              <div className="toast-title">{t.title}</div>
              {t.text && <div className="toast-text">{t.text}</div>}
            </div>
          ))}
        </div>
      </ModalContext.Provider>
    </ToastContext.Provider>
  );
}

function ModalView({ request, onClose }: { request: ModalRequest; onClose(v: boolean | Record<string, string> | null): void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((request.fields ?? []).map((f) => [f.name, f.initial ?? ""])),
  );
  const [error, setError] = useState("");
  const firstRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request.kind === "prompt") {
      firstRef.current?.focus();
      firstRef.current?.select();
    } else okRef.current?.focus();
  }, [request]);

  const cancel = () => onClose(request.kind === "prompt" ? null : false);
  const submit = () => {
    if (request.kind === "confirm") return onClose(true);
    const missing = (request.fields ?? []).find((f) => f.required !== false && !values[f.name]?.trim());
    if (missing) return setError(`${missing.label}: ${uz.common.required}`);
    onClose(values);
  };

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && cancel()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="modal-title">{request.title}</div>
        {request.text && <div className="modal-text">{request.text}</div>}
        {request.fields?.map((f, i) => (
          <label className="field" key={f.name}>
            <span>{f.label}</span>
            <input
              ref={i === 0 ? firstRef : undefined}
              className="input"
              type={f.type ?? "text"}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          </label>
        ))}
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={cancel}>
            {uz.common.cancel}
          </button>
          <button ref={okRef} type="submit" className={request.danger ? "btn btn-danger-solid" : "btn btn-primary"}>
            {request.okLabel ?? uz.common.ok}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Sahifa holatlari ----------

export function Skeleton({ lines = 4, height = 16 }: { lines?: number; height?: number }) {
  return (
    <div className="skeleton-block" aria-busy="true" aria-label={uz.common.loading}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, width: `${90 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <div className="skeleton skeleton-title" />
      <div className="card">
        <Skeleton lines={5} />
      </div>
    </div>
  );
}

/** "Topilmadi" yoki "Xatolik" — har doim ro'yxatga qaytish yo'li bor. */
export function PageMessage({
  kind,
  title,
  text,
  onRetry,
}: {
  kind: "notFound" | "error";
  title?: string;
  text?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty-state">
      <div className={`empty-icon ${kind === "error" ? "empty-icon-error" : ""}`}>{kind === "notFound" ? "?" : "!"}</div>
      <h2>{title ?? (kind === "notFound" ? uz.common.notFound : uz.common.error)}</h2>
      {text && <p className="muted">{text}</p>}
      <div className="row-actions">
        {onRetry && (
          <button className="btn" onClick={onRetry}>
            {uz.common.retry}
          </button>
        )}
        <Link to="/" className="btn btn-primary">
          {uz.common.backToList}
        </Link>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : uz.common.error;
}
