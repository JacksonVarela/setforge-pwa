// src/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";

// Build the config from Vite env (only the required ones)
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
// Optional bits (safe if missing)
if (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) {
  cfg.storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
}
if (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) {
  cfg.messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
}

// Create (or re-use) the default app immediately on import
const app = getApps().length ? getApp() : initializeApp(cfg);

// Export a shared Auth instance and ensure local persistence
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => { /* ignore */ });

// Export helpers (if anyone wants the app directly)
export function initFirebaseApp() {
  return app;
}
export default app;
