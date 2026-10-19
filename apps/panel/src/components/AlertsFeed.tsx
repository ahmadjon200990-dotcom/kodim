import { useState } from "react";
import { api } from "../lib/api";
import type { LiveAlert } from "../lib/useExamSocket";
import { uz } from "../uz";

const time = (iso: string) => new Date(iso).toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Event tafsilotidan qisqa izoh. */
function describe(type: string, details: unknown): string {
  const d = (details ?? {}) as Record<string, unknown>;
  switch (type) {
    case "FORBIDDEN_PROCESS":
      return String(d.process ?? "");
    case "DANGEROUS_COMMAND":
    case "TERMINAL_COMMAND":
      return String(d.line ?? "");
    case "UNKNOWN_PACKAGE":
      return Array.isArray(d.packages) ? d.packages.join(", ") : "";
    case "EXTERNAL_FILE_CHANGE":
    case "READONLY_TAMPER":
      return String(d.path ?? "");
    case "FOCUS_LOST":
      return d.durationSec ? `${String(d.durationSec)} s` : "";
    case "EXTRA_DISPLAY":
      return `${String(d.count ?? "")} monitor`;
    case "LARGE_INSERT":
      return `${String(d.chars ?? "")} belgi`;
    case "DEVICE_CHANGED":
      return "boshqa qurilma";
    case "LATE_JOIN":
      return d.minutesAfterStart ? `+${String(d.minutesAfterStart)}'` : "";
    default:
      return "";
  }
}

/** Oqimni to'ldirib, muhim ogohlantirishlarni pastga suradigan oddiy buyruqlar (batafsil sahifada to'liq tarix bor). */
const NOISY_TYPES = new Set(["TERMINAL_COMMAND"]);

export function AlertsFeed({ alerts }: { alerts: LiveAlert[] }) {
  const [showCommands, setShowCommands] = useState(false);
  const visible = showCommands ? alerts : alerts.filter((a) => !NOISY_TYPES.has(a.event.type));
  const hidden = alerts.length - visible.length;

  return (
    <aside className="alerts">
      <div className="alerts-head">
        <span>{uz.live.alerts}</span>
        <label className="alerts-toggle">
          <input type="checkbox" checked={showCommands} onChange={(e) => setShowCommands(e.target.checked)} />
          {uz.live.showCommands}
          {!showCommands && hidden > 0 && <span className="muted"> ({hidden})</span>}
        </label>
      </div>
      <div className="alerts-body">
        {visible.length === 0 ? (
          <div className="muted small alerts-empty">{uz.live.noAlerts}</div>
        ) : (
          visible.map((a) => <AlertItem key={a.key} alert={a} />)
        )}
      </div>
    </aside>
  );
}

function AlertItem({ alert }: { alert: LiveAlert }) {
  const [done, setDone] = useState(false);
  const { event, studentName } = alert;
  const sev = event.severity.toLowerCase();
  const extra = describe(event.type, event.details);

  const penalize = async (points: number, reason: string) => {
    try {
      await api.post(`/attempts/${event.attemptId}/penalties`, { points, reason, eventId: event.id });
      setDone(true);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : uz.common.error);
    }
  };

  const other = () => {
    const pts = Number(prompt(uz.live.penaltyPoints, "10"));
    if (!pts || pts <= 0) return;
    const reason = prompt(uz.live.penaltyReason, uz.eventNames[event.type] ?? event.type);
    if (reason) void penalize(pts, reason);
  };

  const annul = async () => {
    if (!confirm(uz.live.confirmAnnul)) return;
    try {
      await api.post(`/attempts/${event.attemptId}/annul`);
      setDone(true);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : uz.common.error);
    }
  };

  const canPenalize = event.severity !== "INFO";

  return (
    <div className={`alert alert-${sev}`}>
      <div className="alert-top">
        <span className="alert-type">{uz.eventNames[event.type] ?? event.type}</span>
        <span className="alert-time">{time(event.createdAt)}</span>
      </div>
      <div className="alert-student">{studentName}</div>
      {extra && <div className="alert-extra mono">{extra}</div>}
      {canPenalize && !done && (
        <div className="alert-actions">
          <button className="btn btn-xs" onClick={() => void penalize(5, uz.eventNames[event.type] ?? event.type)}>
            −5
          </button>
          <button className="btn btn-xs" onClick={() => void penalize(10, uz.eventNames[event.type] ?? event.type)}>
            −10
          </button>
          <button className="btn btn-xs" onClick={other}>
            {uz.live.other}
          </button>
          <button className="btn btn-xs btn-danger" onClick={() => void annul()}>
            {uz.live.annul}
          </button>
        </div>
      )}
      {done && <div className="alert-done">✓</div>}
    </div>
  );
}
