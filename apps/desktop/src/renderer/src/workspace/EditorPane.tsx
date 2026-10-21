import { useEffect, useRef, useState } from "react";
import { isFigmaDesignFile, isReadonlyPath } from "@exam-ide/shared";
import { bindEditorClipboard, editorCopy, editorCut, editorPaste } from "../editorClipboard";
import { attachEditorFeatures, installEditorFeatures } from "../editorFeatures";
import { monaco } from "../monaco";
import { openModel, save } from "../models";
import { uz } from "../uz";
import { DesignView } from "./DesignView";
import { ImageView } from "./ImageView";
import { MarkdownView } from "./MarkdownView";

interface Props {
  path: string | null;
  readOnly: boolean;
  locked: boolean;
  /** Markdown faqat-o'qish fayllarida: true — ko'rinish (preview), false — manba. */
  markdownPreview: boolean;
  onCursor(pos: { line: number; col: number } | null): void;
  registerEditor(editor: monaco.editor.IStandaloneCodeEditor | null): void;
  /** Figma havolasini ichki brauzerda ochish (dizayn ko'rinishidan). */
  onOpenLive(url: string): void;
}

interface Menu {
  x: number;
  y: number;
}

const isImage = (p: string) => /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(p);
const isMarkdown = (p: string) => /\.md$/i.test(p);
/** Matn sifatida ochib bo'lmaydigan binar fayllar (shrift, arxiv, audio/video). */
const isBinary = (p: string) => /\.(woff2?|ttf|otf|eot|pdf|zip|rar|7z|mp3|mp4|wav|ogg|webm|mov|exe|dll)$/i.test(p);

export function EditorPane({ path, readOnly, locked, markdownPreview, onCursor, registerEditor, onOpenLive }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const pathRef = useRef<string | null>(null);
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
  const [menu, setMenu] = useState<Menu | null>(null);

  const showImage = path !== null && isImage(path);
  const showMarkdown = path !== null && isMarkdown(path) && isReadonlyPath(path) && markdownPreview;
  const showBinary = path !== null && isBinary(path);
  const showDesign = path !== null && isFigmaDesignFile(path);
  const showMonaco = path !== null && !showImage && !showMarkdown && !showBinary && !showDesign;

  useEffect(() => {
    if (!hostRef.current) return;
    installEditorFeatures();
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
      autoClosingBrackets: "languageDefined",
      autoClosingQuotes: "languageDefined",
      suggestOnTriggerCharacters: true,
      quickSuggestions: { other: true, comments: false, strings: true },
      quickSuggestionsDelay: 10,
      snippetSuggestions: "top",
      tabCompletion: "on",
      acceptSuggestionOnEnter: "on",
      suggest: { snippetsPreventQuickSuggestions: false, showWords: true, preview: true },
      linkedEditing: true,
      formatOnPaste: true,
      formatOnType: true,
      autoIndent: "full",
      contextmenu: false,
      dropIntoEditor: { enabled: false },
      dragAndDrop: false,
      pasteAs: { enabled: false },
    });
    bindEditorClipboard(editor);
    const features = attachEditorFeatures(editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (pathRef.current) void save(pathRef.current);
    });
    // Masshtab (Ctrl+= / Ctrl+-) va so'zni o'rash (Alt+Z) — VS Code'dagidek.
    const zoom = (delta: number) => {
      const size = editor.getOption(monaco.editor.EditorOption.fontSize);
      editor.updateOptions({ fontSize: Math.max(8, Math.min(40, size + delta)) });
    };
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => zoom(1));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => zoom(-1));
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
      const wrap = editor.getOption(monaco.editor.EditorOption.wordWrap);
      editor.updateOptions({ wordWrap: wrap === "on" ? "off" : "on" });
    });
    editor.onDidChangeCursorPosition((e) => onCursor({ line: e.position.lineNumber, col: e.position.column }));
    const ctx = editor.onContextMenu((e) => {
      e.event.preventDefault();
      setMenu({ x: e.event.posx, y: e.event.posy });
    });
    editorRef.current = editor;
    registerEditor(editor);
    return () => {
      ctx.dispose();
      features.dispose();
      editor.dispose();
      editorRef.current = null;
      registerEditor(null);
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
    pathRef.current = showMonaco ? path : null;
    if (!showMonaco || !path) {
      editor.setModel(null);
      onCursor(null);
      return;
    }
    let cancelled = false;
    void openModel(path).then((model) => {
      if (cancelled || pathRef.current !== path) return;
      editor.setModel(model);
      const view = viewStates.current.get(path);
      if (view) editor.restoreViewState(view);
      editor.focus();
      const pos = editor.getPosition();
      if (pos) onCursor({ line: pos.lineNumber, col: pos.column });
    });
    return () => {
      cancelled = true;
    };
  }, [path, showMonaco]);

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
      <div ref={hostRef} className="editor-monaco" style={{ visibility: showMonaco ? "visible" : "hidden" }} />
      {showImage && path && <ImageView path={path} />}
      {showMarkdown && path && <MarkdownView path={path} />}
      {showDesign && path && <DesignView path={path} onOpenLive={onOpenLive} />}
      {showBinary && (
        <div className="editor-welcome">
          <div>{uz.editor.binary}</div>
          <div className="muted small">{path}</div>
        </div>
      )}
      {!path && (
        <div className="editor-welcome">
          <div className="editor-welcome-logo">&lt;/&gt;</div>
          <div>{uz.editor.welcome}</div>
          <div className="muted small">{uz.editor.welcomeHint}</div>
        </div>
      )}
      {menu && showMonaco && (
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
