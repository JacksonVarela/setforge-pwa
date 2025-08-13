export default async function handler(req, res) {
  try {
    const { text } = req.body || {};
    // Fallback quick parser first (handles bullets/headings)
    const lines = String(text || "").replace(/\r/g,"").split(/\n+/);
    const days = [];
    let cur = null;
    const isHeading = (s) => /^(push|pull|legs|upper|lower|rest|day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(s.trim());
    const exLine = /^(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;

    for (const raw of lines) {
      const s = raw.replace(/^[•\-\*]\s*/, "").trim();
      if (!s) continue;
      if (isHeading(s)) { cur = { name: s.toUpperCase(), exercises: [] }; days.push(cur); continue; }
      const m = s.match(exLine);
      if (m) {
        const [_, name, sets, low, high] = m;
        if (!cur) { cur = { name: "DAY 1", exercises: [] }; days.push(cur); }
        cur.exercises.push({ name: name.trim(), sets: +sets, low: +low, high: +(high || low) });
      }
    }
    // If we got something, return it. Otherwise try AI.
    if (days.length) return res.status(200).json({ days });

    if (!process.env.OPENAI_API_KEY) return res.status(200).json({ days: [] });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: "Parse gym split text into JSON {days:[{name,exercises:[{name,sets,low,high}]}]} . Recognize headings vs exercises even without numbers; bullets like •/-/* are exercises." },
          { role: "user", content: text || "" }
        ]
      })
    });
    const j = await r.json();
    const parsed = (() => { try { return JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch { return {}; } )();
    res.status(200).json({ days: parsed.days || [] });
  } catch {
    res.status(200).json({ days: [] });
  }
}
