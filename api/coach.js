export default async function handler(req, res) {
  try {
    const { day, session, recent, units } = req.body || {};
    const system = `You are an evidence-based hypertrophy coach (Israetel/Nippard style).
Keep it under 80 words total. Use double-progression logic. Units: ${units}.`;
    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ day, session, recent }) },
      ],
      temperature: 0.2,
    };
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
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
