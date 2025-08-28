import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./firebase";

import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: true });

// OPTIONAL Sentry via CDN if <meta name="sentry-dsn"> is set
const dsn = document.querySelector('meta[name="sentry-dsn"]')?.getAttribute("content") || "";
if (dsn) {
  const s = document.createElement("script");
  s.src = "https://browser.sentry-cdn.com/7.120.0/bundle.tracing.min.js";
  s.crossOrigin = "anonymous";
  s.onload = () => { if (window.Sentry) window.Sentry.init({ dsn, tracesSampleRate: 0.1 }); };
  document.head.appendChild(s);
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
