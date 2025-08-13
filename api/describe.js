// api/describe.js
export default async function handler(req, res) {
  try {
    const { exercise } = req.body || {};
    const system = `You explain gym exercises briefly for hypertrophy. 
Keep it under 80 words. Include 2–3 precise cues (e.g., brace, slow eccentric), 
and note common attachments/handles if relevant. If unclear, say "Unknown."`;
    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Exercise: ${exercise || "Unknown"}` }
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
    const text = j?.choices?.[0]?.message?.content?.trim() || "Unknown";
    return res.status(200).json({ ok: true, text });
  } catch (e) {
    return res.status(200).json({ ok: false, text: "Unknown" });
  }
}
