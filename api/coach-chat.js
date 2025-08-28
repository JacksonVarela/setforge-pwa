// /api/coach-chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { messages = [], units = "lb", day = "" } = JSON.parse(
      Buffer.concat(chunks).toString("utf8") || "{}"
    );

    const system = `You are Akai “Ronin”, an evidence-based hypertrophy coach and in-app guide.
Be concise, friendly, practical (<=120 words). Use ${units}. Day context: ${day || "unknown"}.
App knowledge (explain steps when asked):
- Tabs: Log, Split, Sessions, Coach. Units toggle lb/kg, Sign out.
- Split: Use Templates or Import (AI). Templates: UL/Rest, PPL, Arnold, Full Body. Importer detects days, exercises, rep ranges, and supersets.
- Log: Tap Start on a day. Each exercise shows target reps, inline Rest guidance, and buttons: Describe, Suggest, Warm-up. 
- Sets: enter weight, reps, RIR (0-5), and “to failure” if applicable. “Drop+” adds a drop set; can be removed. “Superset…” links two exercises.
- Suggest: uses your past sessions + RIR/failure to decide Increase/Keep/Decrease with a reason; note is saved on the exercise.
- Warm-up: gives % ramp based on your first target set (or generic if unknown).
- Sessions: saved history for analytics and future suggestions.
- Data: saved locally and synced to your account (Firestore).
Coaching: prioritize proximity to failure (0–3 RIR), progressive overload, technique cues, and fatigue management.`.trim();

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        ...messages.map(m => ({ role: m.role, content: String(m.content ?? m.text ?? "") })),
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
