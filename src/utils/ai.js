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
  // your /api/parse-split serverless route
  const r = await postJSON("/api/parse-split", { text });
  if (!r.ok) throw new Error("parse failed");
  return r.out;
}

export async function aiExerciseInfo(name) {
  const r = await postJSON("/api/exercise-info", { name });
  if (!r.ok) return {};
  return r.info || {};
}

export async function coachChatSend(messages, { units = "lb", day = "" } = {}) {
  // IMPORTANT: hits /api/coach-chat (you already have api/coach-chat.js)
  const r = await postJSON("/api/coach-chat", { messages, units, day });
  if (!r.ok) throw new Error("chat failed");
  return r.reply || "";
}
