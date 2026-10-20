import { BRAND } from "@exam-ide/shared";
import type { ClientState } from "../../../common/api";
import { uz } from "../uz";

export function Submitted({ state }: { state: ClientState }) {
  return (
    <div className="center-screen">
      <div className="card lobby">
        <div className="check">✓</div>
        <h1>{uz.submitted.title}</h1>
        <p>{uz.submitted.text}</p>
        <div className="muted small">
          {state.exam?.title} · {state.studentName}
        </div>
        <div className="muted small submitted-return">{uz.submitted.returning}</div>
        <div className="muted small brand-foot">{BRAND.name}</div>
      </div>
    </div>
  );
}
