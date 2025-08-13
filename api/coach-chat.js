// /api/coach-chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const { messages = [], mode = "training", units = "lb" } = await readJSON(req);

    const system = [
      "You are SetForge Coach — an evidence-based hypertrophy assistant (Israetel/Nippard vibe).",
      "Be concise, practical, and cite principles casually (not formal citations).",
      "Stay within mainstream, peer-reviewed direction. Avoid medical claims.",
      "You can also answer app navigation questions (how to use tabs, import, logging).",
      `Use units: ${units}.`,
      mode === "app"
        ? "Focus on helping the user navigate and use the SetForge app features."
        : "Focus on muscle growth programming, progression, and form tips."
    ].join(" ");

    const body = {
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: system }].concat(messages || []),
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
    const reply = j?.choices?.[0]?.message?.content || "Sorry, I didn’t catch that.";
    return res.status(200).json({ ok: true, reply });
  } catch (e) {
    return res.status(200).json({ ok: false, reply: "Coach is unavailable right now." });
  }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
