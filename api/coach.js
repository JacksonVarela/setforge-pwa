// /api/coach.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { session = null, recent = [], units = "lb", day = "" } = await readJSON(req);

    const system = `You are an evidence-based hypertrophy coach.
Give an <=80 word note about today's ${day || "unknown"} session. Be supportive, note trends, and give 1 concrete next-step cue. Units are ${units}.`;

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ session, recent }) }
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

    if (!r.ok) {
      const txt = await r.text();
      return res.status(200).json({ ok: false, advice: `OpenAI error: ${r.status} ${txt.slice(0, 180)}` });
    }

    const j = await r.json();
    const advice = j?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ ok: true, advice });
  } catch {
    return res.status(200).json({ ok: false, advice: "" });
  }
}

async function readJSON(req) {
  const a = [];
  for await (const c of req) a.push(c);
  try {
    return JSON.parse(Buffer.concat(a).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

