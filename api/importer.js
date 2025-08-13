// /api/importer.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const { raw = "" } = await readJSON(req);
    const system = `You are a lifting split parser. Return STRICT JSON the app can use. 
Goal: detect days/headings and exercises with sets/reps and useful fields. 
Rules:
- Split text into an array "days": [{ name, items: [ { type: "heading" | "exercise", name, sets, low, high, equip, group, isCompound, attachments } ] }]
- For exercises: infer equip (barbell|dumbbell|machine|cable|smith|bodyweight), group (upper|lower|push|pull|legs|core|neck|forearms), and isCompound (boolean).
- "attachments" is an array of strings like ["V-handle","rope","EZ-bar"] when applicable.
- If you’re unsure, set sensible defaults: equip:"machine", group:"upper", isCompound:false.
- Do NOT include markdown, code fences or commentary. JSON ONLY.`;

    const user = `Split text:\n${raw}\n\nReturn JSON only.`;

    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
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
    const content = j?.choices?.[0]?.message?.content || "{}";
    // try parse JSON even if the model wrapped it oddly
    const json = safeParseJSON(content);
    if (!json || !Array.isArray(json.days)) throw new Error("Bad JSON");
    return res.status(200).json({ ok: true, days: json.days });
  } catch (e) {
    return res.status(200).json({ ok: false, days: [] });
  }
}

function safeParseJSON(s) {
  try {
    const trimmed = String(s).trim()
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "");
    return JSON.parse(trimmed);
  } catch { return null; }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
