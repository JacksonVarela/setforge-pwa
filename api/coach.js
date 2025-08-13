// /api/coach.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const { session, recent = [], units = "lb", day = "" } = await readJSON(req);
    const system = `You are an evidence-based hypertrophy coach. 
Give an 80-word max note about today's session for ${day}. 
Be supportive, note trends, and 1 next-step cue. Units are ${units}.`;
    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ session, recent }) },
      ],
      temperature: 0.3,
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
    return res.status(200).json({ ok: true, advice: j?.choices?.[0]?.message?.content || "" });
  } catch {
    return res.status(200).json({ ok: false, advice: "" });
  }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
