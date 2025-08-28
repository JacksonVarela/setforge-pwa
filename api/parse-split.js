// /api/parse-split.js
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
      {"type":"exercise","name":"Incline Barbell Press","sets":3,"low":6,"high":10,"superset":null}
    ]}
  ]
}
Rules:
- Detect days and exercises. Headings allowed but DROP them in final items (convert to type:"exercise" only).
- Parse "3x8–12" or "3 × 8-12" into sets/low/high.
- If "failure", set low & high both to "failure".
- SUPERSSETS: if a line indicates "A1/A2", "(superset)", "+", "&", or "SS:", assign the same integer "superset" group for both exercises (0,1,2...). If none, superset:null.
- Ignore dropsets on import; users add them while logging.
- Return ONLY JSON.` },
        { role: "user", content: text }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content || "{}";
    let out = {};
    try { out = JSON.parse(raw); } catch {}
    res.status(200).json({ ok:true, days: out.days || [] });
  } catch {
    res.status(200).json({ ok:false, days:[] });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
