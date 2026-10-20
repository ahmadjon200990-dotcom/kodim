// Monaco lokal yuklanadi (CDN emas): worker'lar Vite orqali bundle qilinadi.
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import CssWorker from "monaco-editor/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      case "typescript":
      case "javascript":
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

// Emmet (HTML/CSS/JSX) — teg/qisqartmalarni kengaytirish (Tab bilan).
import { emmetCSS, emmetHTML, emmetJSX } from "emmet-monaco-es";
emmetHTML(monaco, ["html", "vue"]);
emmetCSS(monaco, ["css", "scss", "less"]);
emmetJSX(monaco, ["javascript", "typescript"]);

// node_modules ko'rinmagani uchun "modul topilmadi" xatolari chalg'itadi — faqat sintaksis tekshiriladi.
const ts = monaco.typescript;
for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
  defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  defaults.setCompilerOptions({
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  });
}

export { monaco };
