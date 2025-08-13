// src/utils/ai.js
export async function aiParseSplit(raw) {
  const r = await fetch("/api/importer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("parse-failed");
  return { days: j.days || [] };
}

export async function aiExerciseInfo(name) {
  const r = await fetch("/api/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("describe-failed");
  // this endpoint returns "text" (description); we don't force equip/group here
  return { text: j.text };
}

export async function chatCoach(messages, { mode = "training", units = "lb" } = {}) {
  const r = await fetch("/api/coach-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, mode, units }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("coach-failed");
  return j.reply;
}
