export async function aiParseSplit(text) {
  const r = await fetch("/api/parse-split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then(x => x.json());
  if (!r.ok) throw new Error("parse failed");
  return { days: r.days || [] };
}
