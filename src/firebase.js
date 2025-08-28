// src/firebase.js
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export function initFirebaseApp() {
  if (getApps().length) return getApps()[0];

  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) cfg.storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) cfg.messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;

  const app = initializeApp(cfg);

  const auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});

  return app;
}

const app = initFirebaseApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
