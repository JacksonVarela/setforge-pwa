// src/utils/ai.js
const TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > TTL) return null;
    return v;
  } catch { return null; }
}
function cacheSet(key, v) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
}

async function postJSON(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ----- Importer -----
export async function aiParseSplit(raw) {
  // no cache; user may paste different text repeatedly
  return postJSON("/api/parse-split", { raw });
}

// ----- Exercise Info (equip/group/attachments guess) -----
export async function aiExerciseInfo(name) {
  const key = `v1:ex-info:${name.toLowerCase()}`;
  const c = cacheGet(key);
  if (c) return c;
  const v = await postJSON("/api/exercise-info", { name });
  cacheSet(key, v);
  return v;
}

// ----- Description (with optional image URL) -----
export async function aiDescribe(name) {
  const key = `v1:ex-desc:${name.toLowerCase()}`;
  const c = cacheGet(key);
  if (c) return c;
  const v = await postJSON("/api/describe", { name });
  cacheSet(key, v);
  return v;
}

// ----- Suggestions (progression) -----
export async function aiSuggest(payload) {
  // cache based on last session id + exercise name to reduce calls
  const key = `v1:suggest:${payload.exercise}:${payload.lastSessionId || "none"}`;
  const c = cacheGet(key);
  if (c) return c;
  const v = await postJSON("/api/suggest", payload);
  cacheSet(key, v);
  return v;
}

// ----- Coach chat -----
export async function aiCoachChat(messages) {
  return postJSON("/api/coach-chat", { messages });
}
