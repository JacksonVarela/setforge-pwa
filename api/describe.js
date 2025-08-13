export default async function handler(req, res) {
  try {
    const { exercise, attachment } = req.body || {};
    if (!process.env.OPENAI_API_KEY) return res.status(200).json({ text: "Tip: enable AI to get technique notes." });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: "You are a concise hypertrophy coach. 4 bullets max. Focus on stimulus & safety. If an attachment is provided, include grip/path notes." },
          { role: "user", content: `Exercise: ${exercise}\nAttachment: ${attachment || "none"}` }
        ]
      })
    });
    const j = await r.json();
    res.status(200).json({ text: j?.choices?.[0]?.message?.content?.trim() || "" });
  } catch {
    res.status(200).json({ text: "" });
  }
}
