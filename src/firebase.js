import { initializeApp, getApps } from "firebase/app";

export function initFirebaseApp() {
  try {
    if (getApps().length) return getApps()[0];

    const cfg = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    // Optional
    if (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) {
      cfg.storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
    }
    if (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) {
      cfg.messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
    }

    // Guard against missing required fields (prevent runtime crash)
    const required = ["apiKey", "authDomain", "projectId", "appId"];
    const missing = required.filter((k) => !cfg[k]);
    if (missing.length) {
      console.warn(
        "[SetForge] Firebase env missing:",
        missing.join(", "),
        "— auth screens will be disabled."
      );
      // Initialize a dummy app to prevent "No Firebase App" crash.
      // Note: Auth flows will not work until env vars are set.
      return initializeApp({
        apiKey: "demo",
        authDomain: "demo.local",
        projectId: "demo",
        appId: "demo:app",
      });
    }

    return initializeApp(cfg);
  } catch (e) {
    console.error("[SetForge] Firebase init failed:", e);
    // Fallback dummy app so getAuth() doesn't crash later.
    return initializeApp({
      apiKey: "demo",
      authDomain: "demo.local",
      projectId: "demo",
      appId: "demo:app",
    });
  }
}
