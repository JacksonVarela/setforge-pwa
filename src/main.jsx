import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// PWA: show a refresh dialog when a new version is ready
let unregisterPromptShown = false;
async function setupPWA() {
  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({
      onNeedRefresh() {
        if (unregisterPromptShown) return;
        unregisterPromptShown = true;
        const ok = window.confirm("A new version of SetForge is available. Reload now?");
        if (ok) window.location.reload();
      },
      onOfflineReady() {
        // Optional: console.log("SetForge is ready to work offline.");
      }
    });
  } catch {
    // no-op if PWA not available
  }
}
setupPWA();

const root = createRoot(document.getElementById("root"));
root.render(<App />);
