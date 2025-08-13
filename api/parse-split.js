export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { text = "" } = await readJSON(req);
    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content:
`Parse a pasted split into JSON:
{
  "days":[
    {"name":"PUSH A","items":[
      {"type":"heading","name":"Forearms"},
      {"type":"exercise","name":"Incline Barbell Press","sets":3,"low":6,"high":10}
    ]}
  ]
}
Rules:
- Detect headings vs exercises.
- For exercises, if you see "3x8–12" or "3 × 8–12", map to sets/low/high.
- If failure is specified, set low/high both to "failure" (string).
- Be tolerant to weird punctuation. Return ONLY JSON.`},
        { role: "user", content: text }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content || "{}";
    let out = {};
    try { out = JSON.parse(raw); } catch {}
    res.status(200).json({ ok:true, ...out });
  } catch {
    res.status(200).json({ ok:false, days:[] });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
