import { BRAND } from "@exam-ide/shared";
import { uz } from "../uz";

/** Imtihon qoidalari ekrani (CLAUDE.md 0.5): o'quvchi "Tushundim" bosmaguncha ko'rinadi. */
export function Rules({ examTitle, onAccept }: { examTitle?: string; onAccept(): void }) {
  return (
    <div className="center-screen">
      <div className="card rules-card">
        <div className="brand">
          <div className="brand-name">{BRAND.name}</div>
          <div className="brand-slogan">{examTitle ?? BRAND.slogan}</div>
        </div>
        <h1>{uz.rules.title}</h1>
        <p className="muted">{uz.rules.intro}</p>
        <ul className="rules-list">
          {uz.rules.items.map((r, i) => (
            <li key={i}>
              <span className="rules-dot">•</span>
              {r}
            </li>
          ))}
        </ul>
        <p className="rules-note">{uz.rules.note}</p>
        <button className="btn btn-block" onClick={onAccept} autoFocus>
          {uz.rules.accept}
        </button>
      </div>
    </div>
  );
}
