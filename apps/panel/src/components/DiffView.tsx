import { useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import "../lib/monacoSetup";
import { uz } from "../uz";

const LANGS: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  py: "python",
  vue: "html",
  xml: "xml",
  svg: "xml",
  yml: "yaml",
  yaml: "yaml",
};

const lang = (path: string): string => LANGS[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? "plaintext";

interface FileLike {
  path: string;
  content: string;
}

/**
 * O'quvchi fayllari: chapda ro'yxat, o'ngda Monaco (faqat o'qish).
 * `reference` berilsa — namuna yechim bilan diff (namunada bo'lmagan fayl oddiy ko'rinishda).
 */
export function CodeBrowser({ files, reference }: { files: FileLike[]; reference?: FileLike[] }) {
  const sorted = useMemo(() => [...files].sort((a, b) => a.path.localeCompare(b.path)), [files]);
  const [active, setActive] = useState<string | null>(null);
  const current = sorted.find((f) => f.path === active) ?? sorted[0] ?? null;

  if (!current) return <div className="empty-inline">{uz.detail.noFiles}</div>;
  const ref = reference?.find((f) => f.path === current.path);
  return (
    <div className="code-view">
      <div className="code-files">
        {sorted.map((f) => (
          <button
            key={f.path}
            className={f.path === current.path ? "file-item active" : "file-item"}
            title={f.path}
            onClick={() => setActive(f.path)}
          >
            {f.path}
          </button>
        ))}
      </div>
      {ref ? (
        <DiffView path={current.path} student={current.content} reference={ref.content} />
      ) : (
        <CodeView path={current.path} content={current.content} />
      )}
    </div>
  );
}

/** O'quvchi kodi ↔ namuna yechim (Monaco diff, faqat o'qish). */
export function DiffView({ path, student, reference }: { path: string; student: string; reference: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const editor = monaco.editor.createDiffEditor(hostRef.current, {
      theme: "vs-dark",
      readOnly: true,
      automaticLayout: true,
      renderSideBySide: true,
      fontSize: 13,
      minimap: { enabled: false },
    });
    const original = monaco.editor.createModel(reference, lang(path));
    const modified = monaco.editor.createModel(student, lang(path));
    editor.setModel({ original, modified });
    return () => {
      editor.dispose();
      original.dispose();
      modified.dispose();
    };
  }, [path, student, reference]);

  return <div className="diff-host" ref={hostRef} />;
}

export function CodeView({ path, content }: { path: string; content: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const model = monaco.editor.createModel(content, lang(path));
    const editor = monaco.editor.create(hostRef.current, {
      model,
      theme: "vs-dark",
      readOnly: true,
      domReadOnly: true,
      automaticLayout: true,
      fontSize: 13,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    });
    return () => {
      editor.dispose();
      model.dispose();
    };
  }, [path, content]);

  return <div className="code-host" ref={hostRef} />;
}
