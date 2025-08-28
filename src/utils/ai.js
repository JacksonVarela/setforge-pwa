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

/** -------- Split Parsing -------- */
export async function aiParseSplit(text) {
  const r = await postJSON("/api/parse-split", { text });
  if (!r.ok) throw new Error("parse failed");
  // API returns { ok:true, days:[...] }
  return { days: r.days || [] };
}

/** -------- Exercise Info -------- */
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

/** -------- Coach Chat (Ronin) --------
 * Accepts either:
 *  - an array of messages [{role, content}] OR [{role, text}]
 *  - a single string (user message)
 */
export async function coachChatSend(messagesOrText, { units = "lb", day = "" } = {}) {
  let messages = [];
  if (Array.isArray(messagesOrText)) {
    messages = messagesOrText.map(m => ({
      role: m.role,
      content: String(m.content ?? m.text ?? "")
    }));
  } else if (typeof messagesOrText === "string") {
    messages = [{ role: "user", content: messagesOrText }];
  } else {
    messages = [];
  }
  const r = await postJSON("/api/coach-chat", { messages, units, day });
  if (!r.ok) throw new Error("chat failed");
  return r.reply || "";
}

/** -------- Suggestions (next weight/reps + AI rest + warmups) -------- */
export async function aiSuggestNext({
  name, history, targetLow, targetHigh, units, bodyweight, failureFlags, lastRIR = null, lastRPE = null
}) {
  const r = await postJSON("/api/suggest", {
    name, history, targetLow, targetHigh, units, bodyweight, failureFlags, lastRIR, lastRPE
  });
  if (!r.ok) throw new Error("suggest failed");
  return {
    next: r.next || { weight: null, reps: null, note: "", restSeconds: 90 },
    warmup: r.warmup || []
  };
}

/** -------- Coach session note (<=80 words) -------- */
export async function aiCoachNote(session, recent = [], units = "lb", day = "") {
  const r = await postJSON("/api/coach", { session, recent, units, day });
  return r.ok ? (r.advice || "") : "";
}

/** -------- Short exercise description/how-to -------- */
export async function aiDescribe(name, equip = "machine", cat = "iso_small") {
  const r = await postJSON("/api/describe", { name, equip, cat });
  return r.ok ? (r.text || "") : "";
}
