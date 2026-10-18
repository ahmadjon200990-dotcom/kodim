import { useEffect, useRef, useState } from "react";
import { bindEditorClipboard, editorCopy, editorCut, editorPaste } from "../editorClipboard";
import { monaco } from "../monaco";
import { openModel, save } from "../models";
import { uz } from "../uz";

interface Props {
  path: string | null;
  readOnly: boolean;
  locked: boolean;
}

interface Menu {
  x: number;
  y: number;
}

export function EditorPane({ path, readOnly, locked }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const pathRef = useRef<string | null>(null);
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
  const [menu, setMenu] = useState<Menu | null>(null);

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
      // Standart menyu tizim clipboard'ini ishlatadi — o'rniga o'z menyumiz.
      contextmenu: false,
      // Tashqaridan matn/fayl tashlab bo'lmaydi.
      dropIntoEditor: { enabled: false },
      dragAndDrop: false,
      pasteAs: { enabled: false },
    });
    bindEditorClipboard(editor);
    // Ctrl+S — darhol saqlash (avtosaqlash baribir ishlaydi).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (pathRef.current) void save(pathRef.current);
    });
    const ctx = editor.onContextMenu((e) => {
      e.event.preventDefault();
      setMenu({ x: e.event.posx, y: e.event.posy });
    });
    editorRef.current = editor;
    return () => {
      ctx.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

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

  const run = (fn: (e: monaco.editor.IStandaloneCodeEditor) => Promise<void> | void) => {
    setMenu(null);
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    void fn(editor);
  };

  return (
    <div className="editor-host">
      <div ref={hostRef} className="editor-monaco" style={{ visibility: path ? "visible" : "hidden" }} />
      {!path && <div className="editor-welcome">{uz.editor.welcome}</div>}
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div className={readOnly ? "context-item context-disabled" : "context-item"} onClick={() => !readOnly && run(editorCut)}>
            {uz.editor.cut} <span className="context-key">Ctrl+X</span>
          </div>
          <div className="context-item" onClick={() => run(editorCopy)}>
            {uz.editor.copy} <span className="context-key">Ctrl+C</span>
          </div>
          <div className={readOnly ? "context-item context-disabled" : "context-item"} onClick={() => !readOnly && run(editorPaste)}>
            {uz.editor.paste} <span className="context-key">Ctrl+V</span>
          </div>
          <div className="context-sep" />
          <div
            className="context-item"
            onClick={() =>
              run((e) => {
                const model = e.getModel();
                if (model) e.setSelection(model.getFullModelRange());
              })
            }
          >
            {uz.editor.selectAll} <span className="context-key">Ctrl+A</span>
          </div>
        </div>
      )}
    </div>
  );
}
