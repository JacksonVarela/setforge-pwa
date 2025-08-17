// src/firebase.js
import { initializeApp, getApps } from "firebase/app";

/**
 * Initializes (or returns) the singleton Firebase App using Vite env vars.
 * Make sure these are set in Vercel:
 * - VITE_FIREBASE_API_KEY
 * - VITE_FIREBASE_AUTH_DOMAIN
 * - VITE_FIREBASE_PROJECT_ID
 * - VITE_FIREBASE_APP_ID
 * - VITE_FIREBASE_STORAGE_BUCKET (e.g. setforge-7c5ce.appspot.com)
 * - VITE_FIREBASE_MESSAGING_SENDER_ID
 */
export function initFirebaseApp() {
  // Reuse existing app in dev / hot reload
  const existing = getApps();
  if (existing.length) return existing[0];

  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  // Optional fields (nice-to-have, but we read them if provided)
  if (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) {
    cfg.storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET; // e.g. setforge-7c5ce.appspot.com
  }
  if (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) {
    cfg.messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  }

  return initializeApp(cfg);
}
