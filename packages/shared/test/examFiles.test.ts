// Ish papkasi tarkibi testlari (CLAUDE.md 0.2, 0.7): savollar.md, dizaynlar/, shablonlar.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInitialFiles, mergeStudentFiles, readonlyFiles, starterFiles } from "../src/examFiles.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("starterFiles", () => {
  it("EMPTY shablonda hech qanday fayl yo'q", () => {
    assert.deepEqual(starterFiles({ title: "T", template: "EMPTY" }), []);
  });
  it("HTML shablon: index.html, style.css, script.js", () => {
    assert.deepEqual(
      starterFiles({ title: "T", template: "HTML" }).map((f) => f.path),
      ["index.html", "style.css", "script.js"],
    );
  });
  it("CUSTOM: o'qituvchi materiallari yo'llari olib tashlanadi", () => {
    const files = starterFiles({
      title: "T",
      template: "CUSTOM",
      starterFiles: [
        { path: "a.js", content: "1" },
        { path: "savollar.md", content: "x" },
        { path: "dizaynlar/x.md", content: "y" },
      ],
    });
    assert.deepEqual(files.map((f) => f.path), ["a.js"]);
  });
});

describe("readonlyFiles", () => {
  const tasks = [
    { title: "Ikkinchi: Sahifa", order: 2, description: "Figma bo'yicha", type: "FIGMA", figmaUrl: "https://www.figma.com/design/abc/x", images: [] },
    { title: "Birinchi", order: 1, description: "  Mashq  ", type: "EXERCISE", images: [{ name: "logo", dataUrl: PNG }] },
  ];
  const files = readonlyFiles({ title: "Imtihon", template: "EMPTY" }, tasks);

  it("tartib bo'yicha savollar.md", () => {
    const q = files.find((f) => f.path === "savollar.md");
    assert.ok(q);
    assert.match(q.content, /^# Imtihon\n\n## 1\. Birinchi\n\nMashq\n/);
    assert.match(q.content, /## 2\. Ikkinchi: Sahifa/);
    assert.match(q.content, /Dizayn \(Figma\): `dizaynlar\/2-ikkinchi-sahifa\.md`/);
  });
  it("Figma havolasi va dizayn rasmi dizaynlar/ ga tushadi", () => {
    assert.deepEqual(files.map((f) => f.path).sort(), [
      "dizaynlar/1-birinchi/logo.png",
      "dizaynlar/2-ikkinchi-sahifa.md",
      "savollar.md",
    ]);
    const img = files.find((f) => f.path.endsWith("logo.png"));
    assert.equal(img?.encoding, "base64");
    assert.equal(img?.content, "iVBORw0KGgo=");
  });
  it("buildInitialFiles = shablon + materiallar", () => {
    const all = buildInitialFiles({ title: "Imtihon", template: "HTML" }, tasks);
    assert.equal(all.length, 3 + files.length);
  });
});

describe("mergeStudentFiles", () => {
  it("o'quvchi saqlagan faqat-o'qish nusxasi e'tiborsiz", () => {
    const merged = mergeStudentFiles(
      [{ path: "savollar.md", content: "asl" }],
      [{ path: "savollar.md", content: "buzilgan" }, { path: "index.html", content: "<p>" }],
    );
    assert.deepEqual(merged, [{ path: "savollar.md", content: "asl" }, { path: "index.html", content: "<p>" }]);
  });
});
