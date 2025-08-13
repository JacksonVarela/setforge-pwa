export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { name="", history=[], targetLow=8, targetHigh=12, units="lb", bodyweight=false, failureFlags=[] } = await readJSON(req);

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role:"system", content:
`You recommend next-session load for hypertrophy.
- Bias the last 3 sessions if available.
- If user hit FAILURE recently, weight that record more.
- If reps exceeded top of range at RIR~0, increase load more.
- If reps below range, decrease or suggest assistance (for BW).
Return JSON: {"next":{"weight":number|null,"reps":number|null,"note":string}} in ${units}.
For bodyweight lifts, allow {"weight":null,"note":"Use -30 lb assist"} etc.`},
        { role:"user", content: JSON.stringify({ name, history, targetLow, targetHigh, units, bodyweight, failureFlags }) }
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
    res.status(200).json({ ok:true, ...out });
  } catch {
    res.status(200).json({ ok:false });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
