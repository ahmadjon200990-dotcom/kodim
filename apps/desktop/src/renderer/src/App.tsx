import { useEffect, useState } from "react";
import type { ClientState } from "../../common/api";
import { DialogProvider } from "./Dialog";
import { Lobby } from "./screens/Lobby";
import { Login } from "./screens/Login";
import { Submitted } from "./screens/Submitted";
import { Workspace } from "./workspace/Workspace";

export function App() {
  const [state, setState] = useState<ClientState | null>(null);

  useEffect(() => {
    const off = window.kodim.onState(setState);
    void window.kodim.getState().then(setState);
    return off;
  }, []);

  if (!state) return null;
  return (
    <DialogProvider>
      {state.screen === "login" && <Login connected={state.connected} />}
      {state.screen === "lobby" && <Lobby state={state} />}
      {state.screen === "workspace" && <Workspace state={state} />}
      {state.screen === "submitted" && <Submitted state={state} />}
    </DialogProvider>
  );
}
