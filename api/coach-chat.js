export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });

  try {
    const { messages = [], appState = {} } = await readJSON(req);

    const system = `You are SetForge Coach: an evidence-based hypertrophy coach.
- Be concise and specific (max ~120 words).
- You may suggest steps inside the app (like "Go to Split → Import" or "Open Log tab"), but do NOT hallucinate features.
- If asked to change the app state, reply with a JSON action like {"action":"NAVIGATE","to":"log"} or {"action":"ADD_EXERCISE","name":"Incline DB Press"}, then add a one-line explanation.`;

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        ...messages,
        { role: "user", content: `Current appState:\n${JSON.stringify(appState)}` }
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

    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content?.trim() || "";
    res.status(200).json({ ok:true, text });
  } catch (e) {
    res.status(200).json({ ok:false, text:"" });
  }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
