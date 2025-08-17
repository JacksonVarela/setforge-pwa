// /api/coach-chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  try {
    const { messages = [], units = "lb" } = await readJSON(req);

    const system =
      `You are Kurogane, SetForge's red-black anime-styled hypertrophy coach. ` +
      `Be supportive, concise, and practical. Use bullet points when helpful. ` +
      `Default to evidence-based programming (moderate volumes, proximity to failure, progressive overload). ` +
      `Prefer ${units} for weights. Keep replies under ~130 tokens.`;

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [{ role: "system", content: system }, ...messages]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const j = await r.json();
    const reply = j?.choices?.[0]?.message?.content || "…";
    return res.status(200).json({ ok: true, reply });
  } catch (e) {
    return res.status(200).json({ ok: false, reply: "" });
  }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
