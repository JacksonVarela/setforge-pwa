// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import "./firebase"; // ensure Firebase init
import { registerSW } from "virtual:pwa-register";

// Top-level error boundary wrapper
import ErrorBoundary from "./components/ErrorBoundary.jsx";

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
