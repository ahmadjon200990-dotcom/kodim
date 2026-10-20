import { useEffect, useRef, useState } from "react";
import { BRAND } from "@exam-ide/shared";
import type { ClientState } from "../../../common/api";
import { useDialog } from "../Dialog";
import { saveAll } from "../models";
import { uz } from "../uz";

const WARNING_MS = 5 * 60_000;

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Qolgan vaqt server vaqti bo'yicha: endsAt − (hozir + serverOffset). */
function remaining(endsAt: string | null, offsetMs: number): number | null {
  return endsAt ? Date.parse(endsAt) - (Date.now() + offsetMs) : null;
}

function useRemaining(endsAt: string | null, offsetMs: number): number | null {
  const [left, setLeft] = useState(() => remaining(endsAt, offsetMs));
  useEffect(() => {
    setLeft(remaining(endsAt, offsetMs));
    const t = window.setInterval(() => setLeft(remaining(endsAt, offsetMs)), 500);
    return () => window.clearInterval(t);
  }, [endsAt, offsetMs]);
  return left;
}

export function TopBar({ state }: { state: ClientState }) {
  const dialog = useDialog();
  const left = useRemaining(state.endsAt, state.serverOffsetMs);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const shown = useRef({ five: false, one: false });

  // Vaqt tugashiga 5 va 1 daqiqa qolganda bir marta ogohlantirish.
  useEffect(() => {
    if (left === null) return;
    if (!shown.current.one && left <= 60_000) {
      shown.current.one = true;
      setWarn(uz.warn.one);
    } else if (!shown.current.five && left <= 5 * 60_000) {
      shown.current.five = true;
      setWarn(uz.warn.five);
    }
  }, [left]);

  useEffect(() => {
    if (!warn) return;
    const t = window.setTimeout(() => setWarn(null), 8000);
    return () => window.clearTimeout(t);
  }, [warn]);

  const submit = async () => {
    const yes = await dialog.confirm(uz.top.confirmTitle, uz.top.confirmText, uz.top.confirmYes, true);
    if (!yes) return;
    setBusy(true);
    await saveAll();
    const res = await window.kodim.submit();
    setBusy(false);
    if (!res.ok) await dialog.alert(res.error);
  };

  return (
    <header className="topbar">
      {warn && <div className={`time-banner ${left !== null && left <= 60_000 ? "time-banner-red" : ""}`}>{warn}</div>}
      <div className="topbar-left">
        <span className="topbar-brand">{BRAND.name}</span>
        <span className="topbar-sep" />
        <span className="topbar-title">{state.exam?.title}</span>
      </div>
      <div className={left !== null && left <= WARNING_MS ? "timer timer-warn" : "timer"} title={uz.top.timeLeft}>
        {left === null ? "--:--" : format(left)}
      </div>
      <div className="topbar-right">
        <span className="topbar-student">{state.studentName}</span>
        <button className="btn btn-submit" disabled={busy || state.locked} onClick={() => void submit()}>
          {uz.top.submit}
        </button>
      </div>
    </header>
  );
}
