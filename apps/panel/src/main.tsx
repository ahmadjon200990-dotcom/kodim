import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { BRAND } from "@exam-ide/shared";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import "./styles.css";

document.title = BRAND.panelName;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
