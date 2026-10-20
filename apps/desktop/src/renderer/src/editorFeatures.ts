// VS Code darajasidagi editor imkoniyatlari (Monaco ustiga, bir marta o'rnatiladi):
// - Emmet (HTML/CSS/SCSS/LESS/JSX): "!", "h1", "div.box>ul>li*3", "a:link", "m10" … takliflar ro'yxatida, Tab/Enter bilan.
// - Mashhur snippetlar: clg/log, for, fori, foreach, if, ifelse, func, afn, imp, imd, rfce, rafce, useState …
// - HTML/JSX: ">" yozilganda yopuvchi teg avtomatik qo'yiladi; teg nomi o'zgarsa juftini ham o'zgartirish (linked editing).
import expand, { extract } from "emmet";
import { monaco } from "./monaco";

type Model = monaco.editor.ITextModel;

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "!doctype"]);

/** HTML teglari — bitta so'zli emmet qisqartmasi faqat shulardan bo'lsa taklif qilinadi (JS'da "const" → <const> bo'lmasin). */
const HTML_TAGS = new Set(
  (
    "a abbr address article aside audio b blockquote body br button canvas caption code col dd details dialog div dl dt em " +
    "fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hr html i iframe img input label legend li link main " +
    "map mark meta nav noscript ol optgroup option output p picture pre progress q s section select small source span strong " +
    "style sub summary sup table tbody td template textarea tfoot th thead time title tr u ul video"
  ).split(" "),
);

const isJsx = (model: Model) => /\.(jsx|tsx)$/i.test(model.uri.path);
const fileBase = (model: Model) => {
  const name = model.uri.path.slice(model.uri.path.lastIndexOf("/") + 1);
  const base = name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]/g, "");
  return base ? base[0]!.toUpperCase() + base.slice(1) : "Component";
};

/** Emmet natijasidagi `${1:..}` maydonlari Monaco snippet sintaksisiga mos. */
const field = (index: number, placeholder: string) => `\${${index}${placeholder ? `:${placeholder}` : ""}}`;

/** Kursor HTML teg ichidami (`<div cla|`) — u yerda emmet emas, atribut takliflari kerak. */
function insideTag(textBefore: string): boolean {
  const lt = textBefore.lastIndexOf("<");
  return lt > textBefore.lastIndexOf(">");
}

/** CSS'da kursor qoida tanasida ({ … ichida}) bo'lsa — emmet xususiyatlari. */
function insideCssBlock(model: Model, offset: number): boolean {
  const text = model.getValue().slice(0, offset);
  return text.lastIndexOf("{") > text.lastIndexOf("}");
}

function emmetItems(model: Model, position: monaco.Position, kind: "markup" | "stylesheet"): monaco.languages.CompletionItem[] {
  const line = model.getLineContent(position.lineNumber);
  const before = line.slice(0, position.column - 1);
  const lang = model.getLanguageId();
  if (kind === "markup") {
    if (lang === "html" && insideTag(before)) return [];
    if ((lang === "javascript" || lang === "typescript") && !isJsx(model)) return [];
  } else if (!insideCssBlock(model, model.getOffsetAt(position))) {
    return [];
  }
  const found = extract(line, position.column - 1, { type: kind, lookAhead: false });
  if (!found || !found.abbreviation) return [];
  const abbr = found.abbreviation;
  const simpleWord = /^[a-z][a-z0-9]*$/i.test(abbr);
  if (kind === "markup") {
    if (abbr !== "!" && simpleWord && !HTML_TAGS.has(abbr.toLowerCase())) return [];
    // JSX'da faqat teg boshlanadigan joyda (oldida = ( yoki bo'sh/teg) — oddiy JS so'zlarida emas.
    if (lang !== "html" && simpleWord && !/(^|[\s(>{=]|return\s)$/.test(before.slice(0, found.start))) return [];
  }
  let text: string;
  try {
    text = expand(abbr, {
      type: kind,
      syntax: kind === "markup" ? (lang === "html" || lang === "vue" ? "html" : "jsx") : lang === "scss" || lang === "less" ? lang : "css",
      options: { "output.field": field, "output.indent": "\t", "output.baseIndent": "" },
    });
  } catch {
    return [];
  }
  if (!text || text === abbr) return [];
  if (kind === "stylesheet" && /^[a-z-]+: ;?$/.test(text.replace(/\$\{\d+\}/g, ""))) return [];
  const range = new monaco.Range(position.lineNumber, found.start + 1, position.lineNumber, found.end + 1);
  return [
    {
      label: { label: abbr, description: "Emmet" },
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: "Emmet",
      documentation: { value: "```\n" + text.replace(/\$\{\d+(:([^}]*))?\}/g, "$2") + "\n```" },
      insertText: text,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      sortText: "!0",
      preselect: true,
    },
  ];
}

interface Snippet {
  prefix: string;
  body: string;
  description: string;
}

const JS_SNIPPETS: Snippet[] = [
  { prefix: "clg", body: "console.log($1);", description: "console.log()" },
  { prefix: "log", body: "console.log($1);", description: "console.log()" },
  { prefix: "cer", body: "console.error($1);", description: "console.error()" },
  { prefix: "for", body: "for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {\n\t$0\n}", description: "for sikli" },
  { prefix: "fori", body: "for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}", description: "for (indeks bilan)" },
  { prefix: "forof", body: "for (const ${1:item} of ${2:items}) {\n\t$0\n}", description: "for...of" },
  { prefix: "forin", body: "for (const ${1:key} in ${2:object}) {\n\t$0\n}", description: "for...in" },
  { prefix: "foreach", body: "${1:array}.forEach((${2:item}) => {\n\t$0\n});", description: "forEach" },
  { prefix: "map", body: "${1:array}.map((${2:item}) => $0)", description: "map" },
  { prefix: "filter", body: "${1:array}.filter((${2:item}) => $0)", description: "filter" },
  { prefix: "if", body: "if (${1:condition}) {\n\t$0\n}", description: "if" },
  { prefix: "ifelse", body: "if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}", description: "if / else" },
  { prefix: "while", body: "while (${1:condition}) {\n\t$0\n}", description: "while" },
  { prefix: "switch", body: "switch (${1:key}) {\n\tcase ${2:value}:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}", description: "switch" },
  { prefix: "try", body: "try {\n\t$1\n} catch (${2:error}) {\n\t$0\n}", description: "try / catch" },
  { prefix: "func", body: "function ${1:name}(${2:params}) {\n\t$0\n}", description: "function" },
  { prefix: "fn", body: "function ${1:name}(${2:params}) {\n\t$0\n}", description: "function" },
  { prefix: "afn", body: "(${1:params}) => {\n\t$0\n}", description: "arrow function" },
  { prefix: "caf", body: "const ${1:name} = (${2:params}) => {\n\t$0\n};", description: "const arrow function" },
  { prefix: "asf", body: "async function ${1:name}(${2:params}) {\n\t$0\n}", description: "async function" },
  { prefix: "imp", body: "import ${2:name} from \"${1:module}\";", description: "import" },
  { prefix: "imd", body: "import { ${2:name} } from \"${1:module}\";", description: "import { }" },
  { prefix: "exp", body: "export default ${1:name};", description: "export default" },
  { prefix: "cl", body: "class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t$0\n\t}\n}", description: "class" },
  { prefix: "sto", body: "setTimeout(() => {\n\t$0\n}, ${1:1000});", description: "setTimeout" },
  { prefix: "qs", body: "document.querySelector(\"${1:selector}\")", description: "querySelector" },
  { prefix: "ael", body: "${1:element}.addEventListener(\"${2:click}\", (${3:e}) => {\n\t$0\n});", description: "addEventListener" },
  { prefix: "fetch", body: "fetch(\"${1:url}\")\n\t.then((res) => res.json())\n\t.then((data) => {\n\t\t$0\n\t});", description: "fetch" },
];

const REACT_SNIPPETS = (component: string): Snippet[] => [
  {
    prefix: "rfce",
    body: `function ${component}() {\n\treturn (\n\t\t<div>$0</div>\n\t);\n}\n\nexport default ${component};`,
    description: "React funksional komponent (export default)",
  },
  {
    prefix: "rafce",
    body: `const ${component} = () => {\n\treturn (\n\t\t<div>$0</div>\n\t);\n};\n\nexport default ${component};`,
    description: "React arrow komponent (export default)",
  },
  { prefix: "rfc", body: `export default function ${component}() {\n\treturn <div>$0</div>;\n}`, description: "React komponent" },
  { prefix: "useState", body: "const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:initial});", description: "useState" },
  { prefix: "useEffect", body: "useEffect(() => {\n\t$0\n}, [${1}]);", description: "useEffect" },
  { prefix: "imr", body: "import React from \"react\";", description: "import React" },
  { prefix: "imrs", body: "import { useState } from \"react\";", description: "import { useState }" },
];

const CSS_SNIPPETS: Snippet[] = [
  { prefix: "flexc", body: "display: flex;\njustify-content: center;\nalign-items: center;", description: "flex markazlash" },
  { prefix: "grid", body: "display: grid;\ngrid-template-columns: ${1:repeat(3, 1fr)};\ngap: ${2:16px};", description: "grid" },
];

function snippetItems(model: Model, position: monaco.Position, list: Snippet[]): monaco.languages.CompletionItem[] {
  const word = model.getWordUntilPosition(position);
  const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  return list.map((s) => ({
    label: { label: s.prefix, description: s.description },
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: s.description,
    documentation: { value: "```\n" + s.body.replace(/\$\{\d+:?([^}]*)\}/g, "$1").replace(/\$\d/g, "") + "\n```" },
    insertText: s.body,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    sortText: s.prefix === word.word ? "!1" : `~${s.prefix}`,
  }));
}

/** HTML/JSX: `<div ...>` yozib ">" bosilganda `</div>` avtomatik qo'yiladi (kursor o'rtada qoladi). */
function autoCloseTag(editor: monaco.editor.IStandaloneCodeEditor, e: monaco.editor.IModelContentChangedEvent): void {
  const model = editor.getModel();
  if (!model || e.isUndoing || e.isRedoing || e.isFlush || e.changes.length !== 1) return;
  const change = e.changes[0]!;
  if (change.text !== ">") return;
  const lang = model.getLanguageId();
  if (lang !== "html" && lang !== "vue" && !((lang === "javascript" || lang === "typescript") && isJsx(model))) return;
  const pos = model.getPositionAt(change.rangeOffset + 1);
  const before = model.getValueInRange(new monaco.Range(pos.lineNumber, 1, pos.lineNumber, pos.column));
  const m = /<([A-Za-z][\w:.-]*)(?:\s[^<>]*?)?>$/.exec(before);
  if (!m || before.endsWith("/>")) return;
  const tag = m[1]!;
  if (VOID_TAGS.has(tag.toLowerCase()) && lang !== "javascript" && lang !== "typescript") return;
  const after = model.getValueInRange(new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column + tag.length + 3));
  if (after.startsWith(`</${tag}>`)) return;
  // Hodisa ichida tahrir qilib bo'lmaydi — keyingi mikrotaskda.
  queueMicrotask(() => {
    if (editor.getModel() !== model) return;
    editor.executeEdits("kodim-autoclose", [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: `</${tag}>` }]);
    editor.setPosition(pos);
  });
}

/** Teg nomi ustida: ochuvchi/yopuvchi teg nomlari juftligi (linked editing). */
function linkedRanges(model: Model, position: monaco.Position): monaco.languages.LinkedEditingRanges | null {
  const text = model.getValue();
  const offset = model.getOffsetAt(position);
  // Kursor turgan teg nomini topamiz.
  const tagRe = /<\/?([A-Za-z][\w:.-]*)/g;
  let current: { name: string; start: number; end: number; closing: boolean } | null = null;
  for (let m = tagRe.exec(text); m; m = tagRe.exec(text)) {
    const closing = m[0][1] === "/";
    const start = m.index + (closing ? 2 : 1);
    const end = start + m[1]!.length;
    if (offset >= start && offset <= end) {
      current = { name: m[1]!, start, end, closing };
      break;
    }
    if (m.index > offset) break;
  }
  if (!current || VOID_TAGS.has(current.name.toLowerCase())) return null;
  // Juftini qidiramiz (ichma-ich bir xil teglarni hisobga olib).
  const all: { name: string; start: number; end: number; closing: boolean; selfClosing: boolean }[] = [];
  const fullRe = /<(\/?)([A-Za-z][\w:.-]*)([^<>]*?)(\/?)>/g;
  for (let m = fullRe.exec(text); m; m = fullRe.exec(text)) {
    const closing = m[1] === "/";
    const start = m.index + 1 + (closing ? 1 : 0);
    all.push({ name: m[2]!, start, end: start + m[2]!.length, closing, selfClosing: m[4] === "/" });
  }
  const idx = all.findIndex((t) => t.start === current!.start);
  if (idx < 0) return null;
  const me = all[idx]!;
  let depth = 0;
  let pair: (typeof all)[number] | undefined;
  if (!me.closing) {
    for (let i = idx + 1; i < all.length; i++) {
      const t = all[i]!;
      if (t.name !== me.name || t.selfClosing) continue;
      if (!t.closing) depth++;
      else if (depth === 0) {
        pair = t;
        break;
      } else depth--;
    }
  } else {
    for (let i = idx - 1; i >= 0; i--) {
      const t = all[i]!;
      if (t.name !== me.name || t.selfClosing) continue;
      if (t.closing) depth++;
      else if (depth === 0) {
        pair = t;
        break;
      } else depth--;
    }
  }
  if (!pair) return null;
  const toRange = (s: number, e: number) => {
    const a = model.getPositionAt(s);
    const b = model.getPositionAt(e);
    return new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column);
  };
  return { ranges: [toRange(me.start, me.end), toRange(pair.start, pair.end)], wordPattern: /[A-Za-z][\w:.-]*/ };
}

let installed = false;

export function installEditorFeatures(): void {
  if (installed) return;
  installed = true;
  const L = monaco.languages;
  const markupLangs = ["html", "vue", "javascript", "typescript"];
  for (const lang of markupLangs) {
    L.registerCompletionItemProvider(lang, {
      triggerCharacters: ["!", ".", ">", "*", "+", "#", "]", ")", "}"],
      provideCompletionItems: (model, position) => ({ suggestions: emmetItems(model, position, "markup") }),
    });
  }
  for (const lang of ["css", "scss", "less"]) {
    L.registerCompletionItemProvider(lang, {
      provideCompletionItems: (model, position) => ({
        suggestions: [...emmetItems(model, position, "stylesheet"), ...snippetItems(model, position, CSS_SNIPPETS)],
      }),
    });
  }
  for (const lang of ["javascript", "typescript"]) {
    L.registerCompletionItemProvider(lang, {
      provideCompletionItems: (model, position) => {
        const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        // Satr/izoh ichida snippet taklif qilmaymiz.
        if (/(^|[^\\])["'`][^"'`]*$/.test(line) || /\/\//.test(line)) return { suggestions: [] };
        return { suggestions: snippetItems(model, position, [...JS_SNIPPETS, ...REACT_SNIPPETS(fileBase(model))]) };
      },
    });
  }
  for (const lang of ["html", "vue", "javascript", "typescript"]) {
    L.registerLinkedEditingRangeProvider(lang, {
      provideLinkedEditingRanges: (model, position) => {
        if ((lang === "javascript" || lang === "typescript") && !isJsx(model)) return null;
        return linkedRanges(model, position);
      },
    });
  }
}

/** Har bir editor nusxasiga ulanadigan qism (teg avto-yopish). */
export function attachEditorFeatures(editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable {
  return editor.onDidChangeModelContent((e) => autoCloseTag(editor, e));
}
