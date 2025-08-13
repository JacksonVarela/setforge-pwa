export default async function handler(req, res) {
  try {
    const { question, units, recent } = req.body || {};
    const system = `You are a concise, evidence-based hypertrophy coach.
- Prioritize muscle growth, recovery, progression, exercise selection & technique.
- Cite principles (MEV/MRV concepts, rep ranges, double progression) without formal citations.
- When macros are asked: give protein 1.6–2.2 g/kg, simple carb/fat guidance; mention total calories.
- Keep answers ~120 words unless asked to expand.
- Units: ${units||"lb"}.`;

    const userMsg = {
      question: String(question||""),
      context: {
        recent_sessions: Array.isArray(recent) ? recent.slice(0,6) : []
      }
    };

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userMsg) },
      ],
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
    const reply = j?.choices?.[0]?.message?.content?.trim() || "…";
    return res.status(200).json({ ok: true, reply });
  } catch (e) {
    return res.status(200).json({ ok: false, reply: "Error. Try again." });
  }
}
