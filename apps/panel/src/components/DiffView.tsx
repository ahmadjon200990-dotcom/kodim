import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import "../lib/monacoSetup";

const lang = (path: string): string => {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = { html: "html", css: "css", js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", json: "json", md: "markdown" };
  return map[ext] ?? "plaintext";
};

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
