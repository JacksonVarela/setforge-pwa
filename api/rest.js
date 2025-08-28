export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { name="", lastSet={}, intensity={}, history=[] } = await readJSON(req);
    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role:"system", content:
`Recommend rest time (seconds) between sets for hypertrophy.
Heavier compounds (barbell squat/deadlift/press/row) tend to 120–180s.
Isolation may be 60–120s.
Use last set RIR/failure and reps vs target to bias slightly.

Return ONLY JSON: {"restSec": number}`
        },
        { role:"user", content: JSON.stringify({ name, lastSet, intensity, history }) }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content || "{}";
    let out = {};
    try { out = JSON.parse(raw); } catch {}
    res.status(200).json({ ok:true, restSec: Number(out?.restSec || 90) });
  } catch {
    res.status(200).json({ ok:false, restSec: 90 });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
