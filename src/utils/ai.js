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

// ---- Parser (what you asked to fix) ----
export async function aiParseSplit(text) {
  const r = await postJSON("/api/parse-split", { text });
  if (!r.ok) throw new Error("parse failed");
  return { days: r.days || [] };
}

// ---- Keep these so other tabs don’t break, even if you don’t use them now ----
export async function aiExerciseInfo(name) {
  const r = await postJSON("/api/exercise-info", { name });
  if (!r.ok) return {};
  const { ok, ...info } = r;
  return info;
}

export async function coachChatSend(messages, { units = "lb", day = "" } = {}) {
  const r = await postJSON("/api/coach-chat", { messages, units, day });
  if (!r.ok) throw new Error("chat failed");
  return r.reply || "";
}

// === Minimal, working exports to satisfy App.jsx ===
export async function aiSuggestNext({
  name = "",
  history = [],
  targetLow = 8,
  targetHigh = 12,
  units = "lb",
  bodyweight = false,
  failureFlags = [],
}) {
  const r = await postJSON("/api/suggest", {
    name, history, targetLow, targetHigh, units, bodyweight, failureFlags,
  });
  if (!r.ok) throw new Error("suggest failed");
  const out = r.next ?? r;
  return { weight: out?.weight ?? null, reps: out?.reps ?? null, note: out?.note ?? "" };
}

export async function aiCoachNote(session, recent = [], units = "lb", day = "") {
  const r = await postJSON("/api/coach", { session, recent, units, day });
  if (!r.ok) return "";
  return r.advice || "";
}

export async function aiDescribe(name, equip = "machine", cat = "iso_small") {
  const r = await postJSON("/api/describe", { name, equip, cat });
  if (!r.ok) return "";
  return r.text || "";
}
