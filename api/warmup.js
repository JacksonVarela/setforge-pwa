export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { name="", workingWeight=0, units="lb", recentTops=[] } = await readJSON(req);
    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role:"system", content:
`Plan warm-up sets to reach working weight smoothly.
Return 2–5 steps. Use % and exact weight (rounded to nearest 5 ${units} if ${units==="lb"?"true":"false"}).
Keep total reps low-moderate.

Return ONLY JSON:
{"warmups":[{"percent": number, "weight": number, "reps": number}]}
`
        },
        { role:"user", content: JSON.stringify({ name, workingWeight, units, recentTops }) }
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
    res.status(200).json({ ok:true, warmups: Array.isArray(out?.warmups)? out.warmups : [] });
  } catch {
    res.status(200).json({ ok:false, warmups: [] });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
