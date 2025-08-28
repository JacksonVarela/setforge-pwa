// /api/warmup.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { name = "", units = "lb", target = null } =
      JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    const title = `Warm-up for ${name || "this lift"}`;
    const U = units || "lb";

    // If a target working weight is available, build % ramp based on it
    if (typeof target === "number" && isFinite(target) && target > 0) {
      const t = target;
      // Mild, joint-friendly ramp (skip empty bar if t is very light)
      const steps = [
        { p: 0.40, reps: 8 },
        { p: 0.60, reps: 5 },
        { p: 0.75, reps: 3 },
        { p: 0.85, reps: 1 }
      ];
      const lines = steps.map(s => {
        const w = roundToPlate(s.p * t, U);
        return `• ~${Math.round(s.p * 100)}% × ${s.reps}  → ~${w}${U}`;
      });
      const text = `${title}\n${lines.join("\n")}\nThen first work set at ~1–2 RIR.`;
      return res.status(200).json({ ok:true, text });
    }

    // Generic fallback (works even with zero history)
    const generic = `${title}
• Easy ramp: light × 10–15, then ~45% × 8, ~60% × 5, ~75–80% × 2–3
• Stop warm-ups once you feel ready; first work set should start near 1–2 RIR.`;
    return res.status(200).json({ ok:true, text: generic });
  } catch {
    return res.status(200).json({ ok:false, text: "" });
  }
}

function roundToPlate(x, units) {
  const inc = units === "kg" ? 2.5 : 5; // simple plate math
  return Math.max(0, Math.round(x / inc) * inc);
}
