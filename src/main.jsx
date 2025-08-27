// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./firebase";

import { registerSW } from "virtual:pwa-register";

// Immediately swap to the newest service worker and refresh
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true); // skipWaiting + clientsClaim
  },
  onOfflineReady() {
    // noop
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
