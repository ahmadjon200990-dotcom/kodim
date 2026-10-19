// Monaco uchun ichki clipboard (CLAUDE.md 5.4): Ctrl+C/X/V, Ctrl+Insert, Shift+Insert, Shift+Delete
// va kontekst menyu tizim clipboard'i o'rniga ilovaning ichki clipboard'ini ishlatadi.
import { monaco } from "./monaco";
import { runInternalEdit } from "./models";

type Editor = monaco.editor.IStandaloneCodeEditor;

/** Bo'sh tanlovda butun qator olinadi (VS Code kabi). */
function selectionRanges(editor: Editor): { ranges: monaco.IRange[]; wholeLines: boolean } {
  const model = editor.getModel();
  const selections = editor.getSelections() ?? [];
  if (!model) return { ranges: [], wholeLines: false };
  if (selections.every((s) => s.isEmpty())) {
    const lines = [...new Set(selections.map((s) => s.positionLineNumber))].sort((a, b) => a - b);
    const ranges = lines.map((line) =>
      line < model.getLineCount()
        ? new monaco.Range(line, 1, line + 1, 1)
        : new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
    );
    return { ranges, wholeLines: true };
  }
  return { ranges: selections.filter((s) => !s.isEmpty()), wholeLines: false };
}

function copyText(editor: Editor): string {
  const model = editor.getModel();
  if (!model) return "";
  const { ranges, wholeLines } = selectionRanges(editor);
  const parts = ranges.map((r) => model.getValueInRange(r));
  if (wholeLines) return parts.map((p) => (p.endsWith("\n") ? p : `${p}\n`)).join("");
  return parts.join(model.getEOL());
}

const isReadOnly = (editor: Editor) => editor.getOption(monaco.editor.EditorOption.readOnly);

export async function editorCopy(editor: Editor): Promise<void> {
  const text = copyText(editor);
  if (text) await window.kodim.clipboard.write(text);
}

export async function editorCut(editor: Editor): Promise<void> {
  const text = copyText(editor);
  if (!text) return;
  await window.kodim.clipboard.write(text);
  if (isReadOnly(editor)) return;
  const { ranges } = selectionRanges(editor);
  editor.pushUndoStop();
  editor.executeEdits("kodim-cut", ranges.map((range) => ({ range, text: "" })));
  editor.pushUndoStop();
}

export async function editorPaste(editor: Editor): Promise<void> {
  if (isReadOnly(editor)) return;
  const text = await window.kodim.clipboard.paste("editor");
  if (!text) return;
  const selections = editor.getSelections() ?? [];
  // Ichki paste — LARGE_INSERT yozilmasin.
  runInternalEdit(() => {
    editor.pushUndoStop();
    editor.executeEdits(
      "kodim-paste",
      selections.map((range) => ({ range, text, forceMoveMarkers: true })),
    );
    editor.pushUndoStop();
  });
  editor.focus();
}

/** Standart clipboard tugmalarini ichki clipboard bilan almashtiradi. */
export function bindEditorClipboard(editor: Editor): void {
  const { KeyMod, KeyCode } = monaco;
  const bind = (keys: number[], fn: (e: Editor) => Promise<void>) => {
    for (const k of keys) editor.addCommand(k, () => void fn(editor));
  };
  bind([KeyMod.CtrlCmd | KeyCode.KeyC, KeyMod.CtrlCmd | KeyCode.Insert], editorCopy);
  bind([KeyMod.CtrlCmd | KeyCode.KeyX, KeyMod.Shift | KeyCode.Delete], editorCut);
  bind([KeyMod.CtrlCmd | KeyCode.KeyV, KeyMod.Shift | KeyCode.Insert], editorPaste);
}
