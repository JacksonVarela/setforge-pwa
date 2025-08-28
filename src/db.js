// src/db.js
import { db } from "./firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

export function subscribeUserState(uid, onChange) {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    onChange({
      split: data.split || null,
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      workDraft: data.workDraft || null,
    });
  });
}

export async function saveSplit(uid, split) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { split, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveSessions(uid, sessions) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { sessions, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveWorkDraft(uid, workDraft) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { workDraft, updatedAt: serverTimestamp() }, { merge: true });
}

export async function clearWorkDraft(uid) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { workDraft: null, updatedAt: serverTimestamp() }, { merge: true });
}
