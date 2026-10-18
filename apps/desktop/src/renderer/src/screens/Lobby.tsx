import type { ClientState } from "../../../common/api";
import { uz } from "../uz";

export function Lobby({ state }: { state: ClientState }) {
  return (
    <div className="center-screen">
      <div className="card lobby">
        <div className="muted small">{uz.lobby.title}</div>
        <h1>{state.exam?.title}</h1>
        <div className="spinner" />
        <p>{uz.lobby.wait}</p>
        <div className="lobby-count">{uz.lobby.joined(state.joinedCount)}</div>
        <div className="muted small">
          {uz.lobby.you} <b>{state.studentName}</b>
        </div>
        {!state.connected && <div className="form-error">{uz.status.offline}</div>}
      </div>
    </div>
  );
}
