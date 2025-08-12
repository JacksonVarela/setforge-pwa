// src/firebase.js
import { initializeApp, getApps } from "firebase/app";

export function initFirebaseApp() {
  const cfg = {
    apiKey: "AIzaSyDAud4CscB0f-xwQZZDC0xX6LN4RhemvYg",
    authDomain: "setforge-7c5ce.firebaseapp.com",
    projectId: "setforge-7c5ce",
    storageBucket: "setforge-7c5ce.firebasestorage.app",
    messagingSenderId: "727053846381",
    appId: "1:727053846381:web:d831e7f627ccf08721fc64",
  };
  if (!getApps().length) initializeApp(cfg);
}
