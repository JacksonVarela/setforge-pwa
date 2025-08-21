// src/firebase.js
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence, // logs out when the browser closes (recommended)
  // browserLocalPersistence, // stays logged in across restarts
  // inMemoryPersistence,      // logs out on refresh
} from "firebase/auth";

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

  const app = initializeApp(cfg);

  // Configure how Firebase keeps you signed in:
  const auth = getAuth(app);
  setPersistence(auth, browserSessionPersistence).catch(() => {});

  return app;
}

// A single shared auth instance the whole app uses
export const auth = getAuth(initFirebaseApp());
