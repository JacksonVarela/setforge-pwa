// /api/coach-chat.js (ESM)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const { messages = [], question = "" } = await readJSON(req);
    const system = `You are "Coach Kitsu", a friendly evidence-based hypertrophy coach.
Keep it practical, peer-reviewed, concise. Avoid medical claims.`;
    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        ...messages,
        ...(question ? [{ role: "user", content: question }] : []),
      ],
      temperature: 0.4,
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
    return res.status(200).json({ ok: true, text: j?.choices?.[0]?.message?.content || "" });
  } catch (e) {
    return res.status(200).json({ ok: false, text: "" });
  }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
