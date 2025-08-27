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
  return {
    equip: r.equip || "",
    group: r.group || "",
    isCompound: !!r.isCompound,
    attachments: Array.isArray(r.attachments) ? r.attachments : []
  };
}

export async function aiSuggestNext({
  name, history, targetLow, targetHigh, units, bodyweight, failureFlags, lastRIR = null, lastRPE = null
}) {
  const r = await postJSON("/api/suggest", {
    name, history, targetLow, targetHigh, units, bodyweight, failureFlags, lastRIR, lastRPE
  });
  if (!r.ok) throw new Error("suggest failed");
  return {
    next: r.next || { weight: null, reps: null, note: "" , restSeconds: 90 },
    warmup: r.warmup || []
  };
}

export async function aiCoachNote(session, recent = [], units = "lb", day = "") {
  const r = await postJSON("/api/coach", { session, recent, units, day });
  return r.ok ? (r.advice || "") : "";
}

export async function aiDescribe(name, equip = "machine", cat = "iso_small") {
  const r = await postJSON("/api/describe", { name, equip, cat });
  return r.ok ? (r.text || "") : "";
}
