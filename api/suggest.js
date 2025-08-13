export default async function handler(req, res) {
  try {
    const { exName, meta, history, units } = req.body || {};
    // Basic deterministic fallback (works offline)
    const deltaBase = meta.cat === "lower_comp" ? 0.035 : meta.cat === "upper_comp" ? 0.0225 : 0.015;
    const last = history?.[0];
    let next = null, rationale = "fallback";

    if (last) {
      const top = [...(last.sets || [])].sort((a,b)=> (+b.w||0)-(+a.w||0) || (+b.r||0)-(+a.r||0))[0];
      if (top) {
        const failedRate = (last.sets || []).filter(s => s.failed).length / (last.sets?.length || 1);
        let mult = 1;
        if (failedRate > 0.5) mult = 0.5;               // many fails → smaller change / maybe down
        else if (failedRate === 0) mult = 1.25;         // smooth run → bigger change (your request)
        const raw = Math.max(top.w, 0) * deltaBase * mult;
        const step =
          units === "kg" ? (meta.equip === "barbell" ? 2.5 : meta.equip === "dumbbell" ? 1.25 : 1)
                         : (meta.equip === "barbell" ? 5   : meta.equip === "dumbbell" ? 2.5  : 1);
        const round = (x) => Math.round(x / step) * step;

        if (top.r >= meta.high) next = round(top.w + raw);
        else if (top.r < meta.low) next = round(Math.max(0, top.w - raw));
        else next = round(top.w);
      }
    }

    // If we have OPENAI_API_KEY, let AI refine the number using more history context.
    if (process.env.OPENAI_API_KEY && history?.length) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Return JSON {\"next\": number, \"why\": string}. Consider failure flags, reps vs target, trend. Use the given 'fallback' if reasonable." },
            { role: "user", content: JSON.stringify({ exName, meta, units, history, fallback: next }) }
          ]
        })
      });
      const j = await r.json();
      const parsed = (() => { try { return JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch { return {}; }})();
      if (typeof parsed.next === "number") { next = parsed.next; rationale = "ai"; }
    }

    res.status(200).json({ next, rationale });
  } catch (e) {
    res.status(200).json({ next: null, rationale: "error" });
  }
}
