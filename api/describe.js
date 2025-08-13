export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { name = "", equip = "machine", cat = "iso_small" } = await readJSON(req);
    const prompt = `Write a concise how-to for: "${name}".
Category: ${cat}. Equipment: ${equip}.
Goal: hypertrophy. Max 90 words. Include 3 short bullet cues and 1 common mistake. No emojis.`;

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: "You explain exercises clearly and briefly." },
        { role: "user", content: prompt }
      ]
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
    res.status(200).json({ ok:true, text: j?.choices?.[0]?.message?.content || "" });
  } catch {
    res.status(200).json({ ok:false, text:"" });
  }
}

async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
