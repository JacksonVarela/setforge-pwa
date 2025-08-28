export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { name="", history=[], targetLow=8, targetHigh=12, units="lb", bodyweight=false, rirHistory=[], failureFlags=[] } = await readJSON(req);
    const body = {
      model: "gpt-4o-mini",
      temperature: 0.15,
      messages: [
        { role:"system", content:
`You recommend the next-session load for hypertrophy.
Consider last 3 sessions most; use RIR & failure flags strongly.
If last top set exceeded top of range with RIR 0-1 → recommend ↑.
If below low end or frequent failure → consider ↓ or identical with cue.
Bodyweight moves may return {"weight":null,"reps":null,"note":"Use -nn ${units} assistance"}.

Return ONLY JSON:
{"next":{"weight":number|null,"reps":number|null,"decision":"up|down|keep","note":"short reason"}} in ${units}.`
        },
        { role:"user", content: JSON.stringify({ name, history, targetLow, targetHigh, units, bodyweight, rirHistory, failureFlags }) }
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
    res.status(200).json({ ok:true, next: out?.next || { weight:null, reps:null, decision:"keep", note:"" }});
  } catch {
    res.status(200).json({ ok:false });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
