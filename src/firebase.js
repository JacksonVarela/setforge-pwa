import { initializeApp, getApps } from "firebase/app";

export function initFirebaseApp() {
  if (getApps().length) return getApps()[0];
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) {
    cfg.storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  }
  if (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) {
    cfg.messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  }
  return initializeApp(cfg);
}
