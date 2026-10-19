// Electron'da window.prompt yo'q — oddiy modal oynalar (prompt / confirm / xabar).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { uz } from "./uz";

interface DialogRequest {
  kind: "prompt" | "confirm" | "alert";
  title: string;
  text?: string;
  initial?: string;
  okLabel?: string;
  danger?: boolean;
  resolve: (value: string | boolean | null) => void;
}

interface DialogApi {
  prompt(title: string, initial?: string): Promise<string | null>;
  confirm(title: string, text: string, okLabel?: string, danger?: boolean): Promise<boolean>;
  alert(title: string, text?: string): Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);
const DialogOpenContext = createContext(false);

/** Modal oyna ochiqmi (ichki brauzer view'i DOM ustida turgani uchun yashiriladi). */
export function useDialogOpen(): boolean {
  return useContext(DialogOpenContext);
}

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("DialogProvider yo'q");
  return api;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const open = useCallback(
    (r: Omit<DialogRequest, "resolve">) => new Promise<string | boolean | null>((resolve) => setRequest({ ...r, resolve })),
    [],
  );

  const api = useMemo<DialogApi>(
    () => ({
      prompt: async (title, initial = "") => {
        const v = await open({ kind: "prompt", title, initial });
        return typeof v === "string" ? v : null;
      },
      confirm: async (title, text, okLabel, danger) => (await open({ kind: "confirm", title, text, okLabel, danger })) === true,
      alert: async (title, text) => {
        await open({ kind: "alert", title, text });
      },
    }),
    [open],
  );

  const close = (value: string | boolean | null) => {
    request?.resolve(value);
    setRequest(null);
  };

  return (
    <DialogContext.Provider value={api}>
      <DialogOpenContext.Provider value={request !== null}>
        {children}
        {request && <DialogView request={request} onClose={close} />}
      </DialogOpenContext.Provider>
    </DialogContext.Provider>
  );
}

function DialogView({ request, onClose }: { request: DialogRequest; onClose: (v: string | boolean | null) => void }) {
  const [value, setValue] = useState(request.initial ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request.kind === "prompt") {
      const input = inputRef.current;
      input?.focus();
      // Fayl nomida kengaytmadan oldingi qismni belgilash (VS Code kabi).
      const dot = (request.initial ?? "").lastIndexOf(".");
      input?.setSelectionRange(0, dot > 0 ? dot : (request.initial ?? "").length);
    } else okRef.current?.focus();
  }, [request]);

  const submit = () => {
    if (request.kind === "prompt") onClose(value.trim() || null);
    else onClose(true);
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => onClose(request.kind === "prompt" ? null : false)}>
      <div
        className="modal"
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose(request.kind === "prompt" ? null : false);
          if (e.key === "Enter") submit();
        }}
      >
        <div className="modal-title">{request.title}</div>
        {request.text && <div className="modal-text">{request.text}</div>}
        {request.kind === "prompt" && (
          <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        )}
        <div className="modal-actions">
          {request.kind !== "alert" && (
            <button className="btn btn-secondary" onClick={() => onClose(request.kind === "prompt" ? null : false)}>
              {uz.dialog.cancel}
            </button>
          )}
          <button ref={okRef} className={request.danger ? "btn btn-danger" : "btn"} onClick={submit}>
            {request.okLabel ?? uz.dialog.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
