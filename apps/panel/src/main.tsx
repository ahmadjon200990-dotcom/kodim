import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { BRAND } from "@exam-ide/shared";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { UiProvider } from "./components/ui";
import "@exam-ide/shared/tokens.css";
import "./styles.css";

document.title = BRAND.panelName;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <UiProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </UiProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
