import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// Register SW (safe to import, does nothing in dev)
import "virtual:pwa-register";

function Root() {
  // simple global flag for debugging in console
  if (typeof window !== "undefined") window.SF_DEBUG = true;
  return (
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

const mount = document.getElementById("root");
createRoot(mount).render(<Root />);
