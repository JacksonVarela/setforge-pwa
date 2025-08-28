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

export async function aiParseSplit(text) {
  const r = await postJSON("/api/parse-split", { text });
  if (!r.ok) throw new Error("parse failed");
  return { days: r.days || [] };
}

export async function aiExerciseInfo(name) {
  const r = await postJSON("/api/exercise-info", { name });
  if (!r.ok) return {};
  return r.info || {};
}

export async function coachChatSend(messages, { units = "lb", day = "" } = {}) {
  const r = await postJSON("/api/coach-chat", { messages, units, day });
  if (!r.ok) throw new Error("chat failed");
  return r.reply || "";
}

export async function aiSuggestNext(payload) {
  const r = await postJSON("/api/suggest", payload);
  if (!r.ok) throw new Error("suggest failed");
  return r;
}

export async function aiDescribe({ name = "", equip = "machine", cat = "iso_small" } = {}) {
  const r = await postJSON("/api/describe", { name, equip, cat });
  return { text: r?.text || "" };
}

export async function aiWarmupPlan({ name = "", units = "lb", target = null } = {}) {
  const r = await postJSON("/api/warmup", { name, units, target });
  return { text: r?.text || "" };
}

export async function aiRest({ name = "" } = {}) {
  const r = await postJSON("/api/rest", { name });
  return { text: r?.text || "" };
}

// Optional (safe no-op if unused)
export async function aiCoachNote({ session = {}, recent = [], units = "lb", day = "" } = {}) {
  const r = await postJSON("/api/coach", { session, recent, units, day });
  return { advice: r?.advice || "" };
}
