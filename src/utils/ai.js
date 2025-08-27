// src/utils/ai.js
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
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
    equip: r.equip || "machine",
    group: r.group || "upper",
    isCompound: !!r.isCompound,
    attachments: Array.isArray(r.attachments) ? r.attachments : []
  };
}

export async function coachChatSend(localMessages, { units = "lb", day = "" } = {}) {
  const messages = (localMessages || []).map(m => ({
    role: m.role,
    content: String(m.content ?? m.text ?? "")
  }));
  const r = await postJSON("/api/coach-chat", { messages, units, day });
  if (!r.ok) throw new Error("chat failed");
  return r.reply || "";
}

export async function aiCoachNote(session, recent = [], units = "lb", day = "") {
  const r = await postJSON("/api/coach", { session, recent, units, day });
  return r.advice || "";
}

export async function aiSuggestNext(payload) {
  const r = await postJSON("/api/suggest", payload);
  if (!r.ok) throw new Error("suggest failed");
  return r.next || { weight: null, reps: null, note: "" };
}

export async function aiDescribe(name) {
  const r = await postJSON("/api/describe", { name });
  if (!r.ok) return "";
  return r.text || "";
}
