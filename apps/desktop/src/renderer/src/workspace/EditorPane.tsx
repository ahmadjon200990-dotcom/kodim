import { useEffect, useRef } from "react";
import { monaco } from "../monaco";
import { openModel, save } from "../models";
import { uz } from "../uz";

interface Props {
  path: string | null;
  readOnly: boolean;
  locked: boolean;
}

export function EditorPane({ path, readOnly, locked }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const pathRef = useRef<string | null>(null);
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());

  useEffect(() => {
    if (!hostRef.current) return;
    const editor = monaco.editor.create(hostRef.current, {
      model: null,
      theme: "vs-dark",
      automaticLayout: true,
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 14,
      tabSize: 2,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
    });
    // Ctrl+S — darhol saqlash (avtosaqlash baribir ishlaydi).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (pathRef.current) void save(pathRef.current);
    });
    editorRef.current = editor;
    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const prev = pathRef.current;
    if (prev) viewStates.current.set(prev, editor.saveViewState());
    pathRef.current = path;
    if (!path) {
      editor.setModel(null);
      return;
    }
    let cancelled = false;
    void openModel(path).then((model) => {
      if (cancelled || pathRef.current !== path) return;
      editor.setModel(model);
      const view = viewStates.current.get(path);
      if (view) editor.restoreViewState(view);
      editor.focus();
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly,
      readOnlyMessage: { value: locked ? uz.editor.locked : uz.editor.readonly },
    });
  }, [readOnly, locked]);

  return (
    <div className="editor-host">
      <div ref={hostRef} className="editor-monaco" style={{ visibility: path ? "visible" : "hidden" }} />
      {!path && <div className="editor-welcome">{uz.editor.welcome}</div>}
    </div>
  );
}
