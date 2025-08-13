export async function aiParseSplit(text) {
  const r = await fetch("/api/parse-split", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ text })
  });
  const j = await r.json();
  if (!j.ok) throw new Error("parse failed");
  return j;
}

export async function aiExerciseInfo(name) {
  const r = await fetch("/api/exercise-info", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ name })
  });
  const j = await r.json();
  if (!j.ok) return {};
  return j;
}

export async function aiDescribe({ name, equip, cat }) {
  const r = await fetch("/api/describe", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ name, equip, cat })
  });
  const j = await r.json();
  return j?.text || "";
}

export async function aiSuggest(payload) {
  const r = await fetch("/api/suggest", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  return j?.next || { weight:null, reps:null, note:"" };
}
