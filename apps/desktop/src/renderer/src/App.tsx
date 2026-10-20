import { useEffect, useRef, useState } from "react";
import type { ClientState } from "../../common/api";
import { DialogProvider } from "./Dialog";
import { Lobby } from "./screens/Lobby";
import { Login } from "./screens/Login";
import { Rules } from "./screens/Rules";
import { Submitted } from "./screens/Submitted";
import { Workspace } from "./workspace/Workspace";

export function App() {
  const [state, setState] = useState<ClientState | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const wasLogin = useRef(true);

  useEffect(() => {
    const off = window.kodim.onState(setState);
    void window.kodim.getState().then(setState);
    return off;
  }, []);

  // Har safar login ekraniga qaytganda qoidalar rozi-ligi qayta so'raladi.
  useEffect(() => {
    if (!state) return;
    if (state.screen === "login") {
      wasLogin.current = true;
      if (acknowledged) setAcknowledged(false);
    } else {
      wasLogin.current = false;
    }
  }, [state, acknowledged]);

  if (!state) return null;

  const needRules = (state.screen === "lobby" || state.screen === "workspace") && !acknowledged;

  return (
    <DialogProvider>
      {state.screen === "login" && <Login connected={state.connected} />}
      {needRules && <Rules examTitle={state.exam?.title} onAccept={() => setAcknowledged(true)} />}
      {!needRules && state.screen === "lobby" && <Lobby state={state} />}
      {!needRules && state.screen === "workspace" && <Workspace state={state} />}
      {state.screen === "submitted" && <Submitted state={state} />}
    </DialogProvider>
  );
}
