// src/utils/ai.js
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---- Importer (v2) ----
export async function aiParseSplit(text) {
  const r = await postJSON("/api/parse-split", { text });
  if (!r.ok) throw new Error("parse failed");
  return r.out; // { days: [...] }
}

// ---- Exercise meta ----
export async function aiExerciseInfo(name) {
  const r = await postJSON("/api/exercise-info", { name });
  if (!r.ok) return {};
  const { equip, group, isCompound, attachments } = r;
  return { equip, group, isCompound, attachments };
}

// ---- Logging helpers (AI) ----
export async function aiSuggestNext(payload) {
  // { name, history, targetLow, targetHigh, units, bodyweight, rirHistory, failureFlags }
  const r = await postJSON("/api/suggest", payload);
  if (!r.ok) throw new Error("suggest failed");
  return r.next; // { weight, reps, decision, note }
}

export async function aiRestSuggest(payload) {
  // { name, lastSet, intensity, history }
  const r = await postJSON("/api/rest", payload);
  if (!r.ok) throw new Error("rest failed");
  return r.restSec; // seconds
}

export async function aiWarmupPlan(payload) {
  // { name, workingWeight, units, recentTops: [...] }
  const r = await postJSON("/api/warmup", payload);
  if (!r.ok) throw new Error("warmup failed");
  return r.warmups; // [{percent, weight, reps}]
}

// ---- Coach: describe & daily note ----
export async function aiDescribe({ name = "", equip = "machine", cat = "iso_small" }) {
  const r = await postJSON("/api/describe", { name, equip, cat });
  return r.ok ? (r.text || "") : "";
}
export async function aiCoachNote(session, recent = [], units = "lb", day = "") {
  const r = await postJSON("/api/coach", { session, recent, units, day });
  return r.ok ? (r.advice || "") : "";
}

// ---- Chat ----
export async function coachChatSend(messages, { units = "lb", day = "" } = {}) {
  const r = await postJSON("/api/coach-chat", { messages, units, day });
  if (!r.ok) throw new Error("chat failed");
  return r.reply || "";
}
