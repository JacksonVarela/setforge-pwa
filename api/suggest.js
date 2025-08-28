// /api/suggest.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { name="", history=[], targetLow=8, targetHigh=12, units="lb", bodyweight=false, failureFlags=[], rirHistory=[] } = await readJSON(req);

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role:"system", content:
`You recommend next-session load for hypertrophy.
Inputs:
- name: exercise name
- history: last sets like [{weight:number,reps:number,fail:boolean}]
- rirHistory: last sets RIR values or null (0–5)
- target rep range: [targetLow, targetHigh]
- units: lb or kg
Rules:
- Bias last 3–5 sets strongly; consider trends.
- If recent sets exceeded the top of range at RIR≤1 or to failure, increase load.
- If below range or RIR≥3, reduce load or reps; for bodyweight, suggest assistance.
- If data sparse, be conservative and provide a simple plan.
Return ONLY JSON:
{"next":{"weight":number|null,"reps":number|null,"note":string,"decision":"increase|keep|decrease"}}`},
        { role:"user", content: JSON.stringify({ name, history, rirHistory, targetLow, targetHigh, units, bodyweight, failureFlags }) }
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
