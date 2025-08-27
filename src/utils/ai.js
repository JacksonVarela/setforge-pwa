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

/**
 * Parse a plain-text split into structured days/items via /api/parse-split
 * Returns: { days: [...] }
 */
export async function aiParseSplit(text) {
  const r = await postJSON("/api/parse-split", { text });
  if (!r.ok) throw new Error("parse failed");
  return { days: r.days || [] };
}

/**
 * Given an exercise name, fetch inferred metadata (equip, group, isCompound, attachments)
 * Your /api/exercise-info returns { ok:true, ...info }, so peel off ok
 */
export async function aiExerciseInfo(name) {
  const r = await postJSON("/api/exercise-info", { name });
  if (!r.ok) return {};
  const { ok, ...info } = r;
  return info;
}

/**
 * Chat with coach (works with your /api/coach-chat)
 */
export async function coachChatSend(messages, { units = "lb", day = "" } = {}) {
  const r = await postJSON("/api/coach-chat", { messages, units, day });
  if (!r.ok) throw new Error("chat failed");
  return r.reply || "";
}

/**
 * Suggest next weight/reps using your /api/suggest
 * That API typically returns { ok:true, next: { weight, reps, note } }
 * Normalize to { weight, reps, note } so UI can do e.suggest.weight, etc.
 */
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
    name,
    history,
    targetLow,
    targetHigh,
    units,
    bodyweight,
    failureFlags,
  });

  if (!r.ok) throw new Error("suggest failed");
  // Prefer r.next if present; otherwise accept flattened shape
  const out = r.next ?? r;
  return {
    weight: out?.weight ?? null,
    reps: out?.reps ?? null,
    note: out?.note ?? "",
  };
}

/**
 * Short coach note for a saved session via /api/coach
 * API returns { ok:true, advice: string }
 */
export async function aiCoachNote(session, recent = [], units = "lb", day = "") {
  const r = await postJSON("/api/coach", { session, recent, units, day });
  if (!r.ok) return "";
  return r.advice || "";
}

/**
 * Short exercise how-to via /api/describe
 * API returns { ok:true, text: string }
 */
export async function aiDescribe(name, equip = "machine", cat = "iso_small") {
  const r = await postJSON("/api/describe", { name, equip, cat });
  if (!r.ok) return "";
  return r.text || "";
}
