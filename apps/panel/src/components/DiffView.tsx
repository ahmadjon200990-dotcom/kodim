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

export interface FileLike {
  path: string;
  content: string;
  /** "base64" — binar (rasm, shrift). */
  encoding?: "base64";
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
};
const extOf = (p: string) => p.slice(p.lastIndexOf(".") + 1).toLowerCase();

/** Fayllar ro'yxatidan papka daraxti qatorlari (papkalar oldin, alifbo bo'yicha). */
function treeRows(files: FileLike[]): { kind: "dir" | "file"; path: string; name: string; depth: number }[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const entries = [
    ...[...dirs].map((d) => ({ kind: "dir" as const, path: d })),
    ...files.map((f) => ({ kind: "file" as const, path: f.path })),
  ];
  // Tartib: har bir darajada papkalar fayllardan oldin.
  const key = (e: { kind: "dir" | "file"; path: string }) =>
    e.path
      .split("/")
      .map((seg, i, arr) => (i === arr.length - 1 ? (e.kind === "dir" ? "0" : "1") : "0") + seg.toLowerCase())
      .join("/");
  return entries
    .sort((x, y) => key(x).localeCompare(key(y)))
    .map((e) => ({ ...e, name: e.path.slice(e.path.lastIndexOf("/") + 1), depth: e.path.split("/").length - 1 }));
}

/**
 * O'quvchi fayllari: chapda papka daraxti, o'ngda Monaco (faqat o'qish) yoki rasm.
 * `reference` berilsa — namuna yechim bilan diff (namunada bo'lmagan fayl oddiy ko'rinishda).
 */
export function CodeBrowser({ files, reference }: { files: FileLike[]; reference?: FileLike[] }) {
  const rows = useMemo(() => treeRows(files), [files]);
  const [active, setActive] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const firstFile = rows.find((r) => r.kind === "file")?.path ?? null;
  const current = files.find((f) => f.path === (active ?? firstFile)) ?? null;

  if (files.length === 0) return <div className="empty-inline">{uz.detail.noFiles}</div>;
  const hidden = (p: string) => [...collapsed].some((c) => p.startsWith(`${c}/`));
  const ref = current && reference?.find((f) => f.path === current.path && !f.encoding);
  const mime = current ? IMAGE_MIME[extOf(current.path)] : undefined;

  return (
    <div className="code-view">
      <div className="code-files">
        {rows
          .filter((r) => !hidden(r.path))
          .map((r) =>
            r.kind === "dir" ? (
              <button
                key={`d:${r.path}`}
                className="file-item file-dir"
                style={{ paddingLeft: 10 + r.depth * 14 }}
                onClick={() =>
                  setCollapsed((s) => {
                    const n = new Set(s);
                    if (n.has(r.path)) n.delete(r.path);
                    else n.add(r.path);
                    return n;
                  })
                }
              >
                {collapsed.has(r.path) ? "▸" : "▾"} {r.name}
              </button>
            ) : (
              <button
                key={r.path}
                className={r.path === current?.path ? "file-item active" : "file-item"}
                style={{ paddingLeft: 22 + r.depth * 14 }}
                title={r.path}
                onClick={() => setActive(r.path)}
              >
                {r.name}
              </button>
            ),
          )}
      </div>
      {!current ? (
        <div className="empty-inline">{uz.detail.noFiles}</div>
      ) : mime ? (
        <div className="image-host">
          <img
            src={current.encoding === "base64" ? `data:${mime};base64,${current.content}` : `data:${mime};charset=utf-8,${encodeURIComponent(current.content)}`}
            alt={current.path}
          />
        </div>
      ) : current.encoding === "base64" ? (
        <div className="empty-inline">{uz.detail.binaryFile}</div>
      ) : ref ? (
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
