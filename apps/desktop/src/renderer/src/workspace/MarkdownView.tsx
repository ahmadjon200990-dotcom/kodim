import { useEffect, useState, type ReactNode } from "react";
import { uz } from "../uz";

// Yengil markdown ko'rsatuvchi (savollar.md va dizaynlar/*.md faqat o'qish uchun). Tashqi kutubxonasiz.
// Faqat loyihada yaratiladigan markdown qo'llab-quvvatlanadi: sarlavha, ro'yxat, kod, qalin, kursiv, inline-kod, havola.

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text: string, key: string): ReactNode {
  // `kod` ni ajratamiz, keyin **qalin**, *kursiv*.
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={`${key}-${i}`} className="md-code">
          {p.slice(1, -1)}
        </code>
      );
    }
    const html = escape(p)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    return <span key={`${key}-${i}`} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

function render(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="md-list">
          {list.map((li, i) => (
            <li key={i}>{inline(li, `li-${out.length}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1]!.length;
      const Tag = (`h${level}` as "h1" | "h2" | "h3" | "h4");
      out.push(
        <Tag key={`h-${i}`} className="md-h">
          {inline(h[2]!, `h-${i}`)}
        </Tag>,
      );
    } else if (li) {
      list.push(li[1]!);
    } else if (line === "") {
      flush();
    } else {
      flush();
      out.push(
        <p key={`p-${i}`} className="md-p">
          {inline(line, `p-${i}`)}
        </p>,
      );
    }
  });
  flush();
  return out;
}

export function MarkdownView({ path }: { path: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    void window.kodim.fs.read(path).then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (text === null) return <div className="md-view muted small">{uz.editor.loading}</div>;
  return <div className="md-view">{render(text)}</div>;
}
