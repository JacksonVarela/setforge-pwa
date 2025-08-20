// /api/coach-chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { messages = [], units = "lb", day = "" } = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    const system = `You are an evidence-based hypertrophy coach named Akai Ronin.
Be concise and friendly. Units are ${units}. Day context: ${day || "unknown"}. 
If the user asks about the app, give practical in-app steps. Max ~120 words per reply.`;

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        ...messages.map(m => ({ role: m.role, content: String(m.content ?? "") })),
      ],
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
      return res.status(200).json({ ok: false, reply: `OpenAI error: ${r.status} ${txt.slice(0, 180)}` });
    }

    const j = await r.json();
    const reply = j?.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ ok: true, reply });
  } catch (e) {
    return res.status(200).json({ ok: false, reply: "Server error reaching AI." });
  }
}
