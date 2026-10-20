import { useEffect, useMemo, useState } from "react";
import type { EventSeverity } from "@exam-ide/shared";
import { api } from "../lib/api";
import { eventSummary } from "../lib/events";
import type { LiveAlert } from "../lib/useExamSocket";
import { errorText, useModal, useToast } from "./ui";
import { uz } from "../uz";

const time = (iso: string) => new Date(iso).toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Oddiy (ruxsat etilgan) buyruqlar standart yashirin — muhim ogohlantirishlarni pastga surmasin. */
const NOISY_TYPES = new Set(["TERMINAL_COMMAND"]);
/** Shuncha vaqt "YANGI" belgisi bilan ajralib turadi. */
const FRESH_MS = 90_000;

const SEVERITIES: EventSeverity[] = ["DANGER", "WARN", "INFO"];

export function AlertsFeed({ alerts, studentFilter, onClearStudent }: { alerts: LiveAlert[]; studentFilter?: string | null; onClearStudent?(): void }) {
  const [severities, setSeverities] = useState<Set<EventSeverity>>(new Set(SEVERITIES));
  const [type, setType] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [, setTick] = useState(0);

  // "YANGI" belgisi vaqt o'tishi bilan o'chishi uchun.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 10_000);
    return () => window.clearInterval(t);
  }, []);

  const types = useMemo(() => [...new Set(alerts.map((a) => a.event.type))].sort(), [alerts]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { DANGER: 0, WARN: 0, INFO: 0 };
    for (const a of alerts) if (!NOISY_TYPES.has(a.event.type) || showCommands) c[a.event.severity] = (c[a.event.severity] ?? 0) + 1;
    return c;
  }, [alerts, showCommands]);

  const visible = alerts.filter(
    (a) =>
      severities.has(a.event.severity) &&
      (!type || a.event.type === type) &&
      (showCommands || type === "TERMINAL_COMMAND" || !NOISY_TYPES.has(a.event.type)) &&
      (!studentFilter || a.event.attemptId === studentFilter),
  );
  const hiddenCommands = alerts.filter((a) => NOISY_TYPES.has(a.event.type)).length;

  const toggle = (s: EventSeverity) =>
    setSeverities((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <aside className="alerts">
      <div className="alerts-head">
        <div className="alerts-title">
          <h2>{uz.live.alerts}</h2>
          <span className="muted small">{visible.length}</span>
        </div>
        <div className="alerts-filters">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              className={`filter-chip f-${s.toLowerCase()} ${severities.has(s) ? "on" : ""}`}
              onClick={() => toggle(s)}
              title={uz.live.severityHint}
            >
              {uz.severity[s]} {counts[s] ?? 0}
            </button>
          ))}
          <select className="input alerts-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{uz.live.allTypes}</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {uz.eventNames[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div className="alerts-filters">
          <label className="alerts-toggle">
            <input type="checkbox" checked={showCommands} onChange={(e) => setShowCommands(e.target.checked)} />
            {uz.live.showCommands}
            {!showCommands && hiddenCommands > 0 && <span> ({hiddenCommands})</span>}
          </label>
          {studentFilter && (
            <button className="filter-chip on f-info" onClick={onClearStudent}>
              {uz.live.onlyStudent} ×
            </button>
          )}
        </div>
      </div>
      <div className="alerts-body">
        {visible.length === 0 ? (
          <div className="empty-inline">{alerts.length === 0 ? uz.live.noAlerts : uz.live.noFiltered}</div>
        ) : (
          visible.map((a) => <AlertItem key={a.key} alert={a} />)
        )}
      </div>
    </aside>
  );
}

function AlertItem({ alert }: { alert: LiveAlert }) {
  const modal = useModal();
  const toast = useToast();
  const [done, setDone] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const { event, studentName } = alert;
  const sev = event.severity.toLowerCase();
  const extra = eventSummary(event.type, event.details);
  const name = uz.eventNames[event.type] ?? event.type;
  const fresh = alert.fresh && !seen && Date.now() - Date.parse(event.createdAt) < FRESH_MS;

  const penalize = async (points: number, reason: string) => {
    try {
      await api.post(`/attempts/${event.attemptId}/penalties`, { points, reason, eventId: event.id });
      setDone(`−${points}`);
      toast.success(uz.live.penaltyAdded(studentName, points));
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    }
  };

  const other = async () => {
    const res = await modal.prompt({
      title: uz.live.otherTitle(studentName),
      okLabel: uz.live.penalty,
      fields: [
        { name: "points", label: uz.live.penaltyPoints, initial: "10", type: "number" },
        { name: "reason", label: uz.live.penaltyReason, initial: name },
      ],
    });
    if (!res) return;
    const pts = Math.round(Number(res.points));
    if (!Number.isFinite(pts) || pts < 1 || pts > 100) return toast.error(uz.live.penaltyRange);
    await penalize(pts, (res.reason ?? name).trim() || name);
  };

  const annul = async () => {
    const yes = await modal.confirm({
      title: uz.live.annulTitle(studentName),
      text: uz.live.confirmAnnul,
      okLabel: uz.live.annul,
      danger: true,
    });
    if (!yes) return;
    try {
      await api.post(`/attempts/${event.attemptId}/annul`);
      setDone(uz.live.annulled);
      toast.show("warn", uz.live.annulled, studentName);
    } catch (e) {
      toast.error(uz.common.error, errorText(e));
    }
  };

  const canPenalize = event.severity !== "INFO";

  return (
    <div className={`alert alert-${sev} ${fresh ? "fresh" : ""}`} onMouseEnter={() => fresh && setSeen(true)}>
      <div className="alert-top">
        <span className="alert-type">{name}</span>
        <span className="alert-time">{time(event.createdAt)}</span>
      </div>
      <div className="alert-student">{studentName}</div>
      {extra && <div className="alert-extra small">{extra}</div>}
      {canPenalize && !done && (
        <div className="alert-actions">
          <button className="btn btn-xs" onClick={() => void penalize(5, name)}>
            −5
          </button>
          <button className="btn btn-xs" onClick={() => void penalize(10, name)}>
            −10
          </button>
          <button className="btn btn-xs" onClick={() => void other()}>
            {uz.live.other}
          </button>
          <button className="btn btn-xs btn-danger" onClick={() => void annul()}>
            {uz.live.annul}
          </button>
        </div>
      )}
      {done && <div className="alert-done">✓ {done}</div>}
    </div>
  );
}
