// /api/parse-split.js
function hGuessEquip(n) {
  n = n.toLowerCase();
  if (/\bsmith\b/.test(n)) return "smith";
  if (/(barbell|bb\b)/.test(n)) return "barbell";
  if (/(dumbbell|db\b)/.test(n)) return "dumbbell";
  if (/(cable|rope|pulldown|row\b)/.test(n)) return "cable";
  if (/(dip|hanging|push-up|chin|pull-up|neck|leg raise|back extension)/.test(n)) return "bodyweight";
  if (/(machine|pec deck|leg press|abduction|adduction|ham.*curl|leg extension|calf)/.test(n)) return "machine";
  return "machine";
}
function hGuessCat(n) {
  n = n.toLowerCase();
  if (/(squat|deadlift|romanian|rdl|leg press|split squat|hack squat)/.test(n)) return "lower_comp";
  if (/(bench|press|row|pulldown|pull-up|dip|ohp|shoulder press)/.test(n)) return "upper_comp";
  return "iso_small";
}
function localParse(raw) {
  const out = [];
  let cur = null;
  const lines = String(raw).replace(/\r/g, "").split(/\n+/);
  const exLine = /^(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;

  const isHeader = (line) => {
    const t = line.trim().replace(/^[-•*°\d.\)]\s*/, "");
    return (
      /:$/.test(t) ||
      /^(push|pull|legs?|upper|lower|day\s*\d+|chest|back|shoulders|arms|rest|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
        t
      ) ||
      (t === t.toUpperCase() && t.split(/\s+/).length <= 4)
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isHeader(line)) {
      cur = { id: cryptoRandom(), name: line.replace(/:$/, "").trim(), exercises: [] };
      out.push(cur);
      continue;
    }
    const m = line.match(exLine);
    if (m) {
      const name = m[1].trim();
      const sets = +m[2];
      const low = +m[3];
      const high = +(m[4] || m[3]);
      cur ||= { id: cryptoRandom(), name: "DAY 1", exercises: [] } && out.push(cur);
      cur.exercises.push({
        name,
        sets,
        low,
        high,
        cat: hGuessCat(name),
        equip: hGuessEquip(name),
      });
    }
  }
  return out;
}
const cryptoRandom = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const { text = "" } = await readJSON(req);

    // Ask AI to structure first
    let aiDays = [];
    try {
      const body = {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Parse a workout split into JSON with keys: days:[{name, exercises:[{name, sets, low, high}]}]. Guess sets x rep-range if not present using common patterns. Do NOT invent day names—use user headings. Return ONLY JSON.",
          },
          { role: "user", content: text.slice(0, 25_000) },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      };
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      const json = JSON.parse(j?.choices?.[0]?.message?.content || "{}");
      aiDays = (json?.days || []).map((d) => ({
        id: cryptoRandom(),
        name: String(d.name || "").trim() || "DAY",
        exercises: (d.exercises || []).map((e)
