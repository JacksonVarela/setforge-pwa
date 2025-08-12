// src/firebase.js
import { initializeApp, getApps } from "firebase/app";

export function initFirebaseApp() {
  const cfg = {
    apiKey: import.meta.env.VITE_FB_API_KEY,
    authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FB_PROJECT_ID,
    appId: import.meta.env.VITE_FB_APP_ID,
    // (optional if you want)
    // storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
    // messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  };
  if (!getApps().length) initializeApp(cfg);
}

