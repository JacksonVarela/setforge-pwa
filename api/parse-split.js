export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { text = "" } = await readJSON(req);
    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content:
`Parse a training split into JSON with rich fields.

Output ONLY JSON:
{
  "days":[
    {
      "name":"Upper A",
      "items":[
        { "type":"exercise","name":"Bench Press","sets":4,"low":5,"high":8,
          "equip":"barbell","group":"push","cat":"compound",
          "ss":"A",           // same letter pairs are supersets (optional)
          "dropsets":0,       // integer
          "amrap":false,      // boolean
          "toFailure":false,  // boolean
          "rir":null,         // number or null
          "tempo":"",         // e.g. "3-1-1"
          "restSec":null      // e.g. 120
        },
        { "type":"heading","name":"Arms" }
      ]
    }
  ]
}

Rules:
- Detect headings vs exercises.
- Parse "3x8–12", "3 × 8-12", "3xAMRAP", "3x10 @ RIR2", "DS x2", "to failure".
- Supersets: recognize A1/A2, "superset", linking with same letter via "ss":"A" etc.
- Normalize fields; omit nonsense.
- Keep equipment if obvious (barbell, dumbbell, machine, cable, smith, bodyweight).
- Keep group (upper, lower, push, pull, legs, core, arms).
- Return ONLY JSON.
`},
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

    res.status(200).json({ ok:true, out: out || { days:[] } });
  } catch {
    res.status(200).json({ ok:false, out:{ days:[] } });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
