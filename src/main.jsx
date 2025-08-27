// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./firebase";

import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { registerSW } from "virtual:pwa-register";

// Force-refresh to newest build as soon as it’s ready
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // take over and reload right away so users don’t see stale UI
    updateSW(true);
  },
  onOfflineReady() {
    // no-op, just quiet success
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
