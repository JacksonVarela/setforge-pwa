// src/firebase.js
import { initializeApp, getApps } from "firebase/app";

export function initFirebaseApp() {
  if (getApps().length) return getApps()[0];
  // These should be set on Vercel Project → Settings → Environment Variables
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  };
  return initializeApp(config);
}
