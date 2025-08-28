// src/utils/ai.js
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return r.json();
}

// --- Split parsing / exercise metadata ---
export async function aiParseSplit(text) {
  const j = await postJSON("/api/parse-split", { text });
  if (!j.ok) throw new Error("AI parse failed");
  return { days: j.days || [] };
}
export async function aiExerciseInfo(name) {
  const j = await postJSON("/api/exercise-info", { name });
  if (!j.ok) return {};
  const { equip, group, isCompound, attachments } = j;
  return { equip, group, isCompound, attachments: attachments || [] };
}

// --- Coach chat (in-app assistant) ---
export async function coachChatSend(messages, { units = "lb", day = "" } = {}) {
  const j = await postJSON("/api/coach-chat", { messages, units, day });
  if (!j.ok) throw new Error("chat failed");
  return j.reply || "";
}

// --- Suggestions & notes ---
export async function aiSuggestNext({
  name = "", history = [], targetLow = 8, targetHigh = 12, units = "lb",
  bodyweight = false, failureFlags = [],
} = {}) {
  const j = await postJSON("/api/suggest", {
    name, history, targetLow, targetHigh, units, bodyweight, failureFlags,
  });
  if (!j.ok) throw new Error("suggest failed");
  return { next: j.next || { weight: null, reps: null, note: "" } };
}
export async function aiCoachNote({ session = null, recent = [], units = "lb", day = "" } = {}) {
  const j = await postJSON("/api/coach", { session, recent, units, day });
  if (!j.ok) return { advice: "" };
  return { advice: j.advice || "" };
}
export async function aiDescribe({ name = "", equip = "machine", cat = "iso_small" } = {}) {
  const j = await postJSON("/api/describe", { name, equip, cat });
  if (!j.ok) return { text: "" };
  return { text: j.text || "" };
}

// --- Warm-up & Rest helpers ---
export async function aiWarmupPlan({ name = "", units = "lb", target = null } = {}) {
  const j = await postJSON("/api/warmup", { name, units, target });
  if (!j.ok) return { text: "" };
  return { text: j.text || "" };
}
export async function aiRest({ name = "" } = {}) {
  const j = await postJSON("/api/rest", { name });
  if (!j.ok) return { text: "" };
  return { text: j.text || "" };
}
