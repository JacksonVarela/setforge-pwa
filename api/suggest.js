// /api/suggest.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const {
      name = "",
      history = [],         // [{date,sets:[{weight,reps,fail}]}] (last 3 best)
      targetLow = 8,
      targetHigh = 12,
      units = "lb",
      bodyweight = false,
      failureFlags = [],
      lastRIR = null,       // 0..5 (null if unknown)
      lastRPE = null        // optional number (ignored if null)
    } = await readJSON(req);

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role:"system", content:
`You are an evidence-based hypertrophy coach.
Given lift name, recent history, target rep range, RIR/RPE signal:
- Prefer last 3 sessions; weight failure sets more.
- If exceeded top of range at ~0–1 RIR, increase load slightly (2–5%).
- If under range, decrease or give assistance (for bodyweight).
- Use ${units}.
Output ONLY JSON:
{
  "next": {
    "weight": number|null,   // null for bodyweight
    "reps": number|null,     // recommended reps within range
    "note": string,          // 1–2 short sentences (why up/down/same)
    "restSeconds": number    // AI recommended rest (60–240 typical)
  },
  "warmup": [
    {"weight": number|null, "reps": number},
    ...
  ]
}
Warmup rule of thumb:
- 40% x 8, 60% x 5, 75% x 3 of target, then working sets.
Adjust if target is very light/heavy.`
        },
        { role:"user", content: JSON.stringify({ name, history, targetLow, targetHigh, units, bodyweight, failureFlags, lastRIR, lastRPE }) }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(200).json({ ok:false, error:`OpenAI error: ${r.status} ${t.slice(0,160)}` });
    }
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content || "{}";
    let out = {};
    try { out = JSON.parse(raw); } catch {}
    const next = out.next || {};
    const warmup = Array.isArray(out.warmup) ? out.warmup : [];
    res.status(200).json({ ok:true, next, warmup });
  } catch {
    res.status(200).json({ ok:false });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
