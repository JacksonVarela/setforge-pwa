// src/auth.js
import { getAuth } from "firebase/auth";
import { initFirebaseApp } from "./firebase";

// Create ONE auth instance tied to the ONE app
const app = initFirebaseApp();
export const auth = getAuth(app);
export default auth;
