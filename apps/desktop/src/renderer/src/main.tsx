import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BRAND } from "@exam-ide/shared";
import { App } from "./App";
import "./styles.css";

document.title = BRAND.name;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
