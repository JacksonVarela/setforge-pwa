// /api/rest.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { name = "" } = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const n = String(name).toLowerCase();

    // Simple, robust classifier (no AI needed for reliability)
    const isHeavyCompound =
      /(squat|deadlift|rdl|bench|press|row(?!.*cable)|pull[- ]?up|dip|hip thrust|clean|snatch)/.test(n);
    const isLower =
      /(squat|deadlift|rdl|leg|hip|calf|glute|hamstring|quad)/.test(n);

    let text;
    if (isHeavyCompound && isLower) {
      text = "Rest ~2.5–4 minutes between sets (heavy lower-body compound). Push close to 1–2 RIR.";
    } else if (isHeavyCompound) {
      text = "Rest ~2–3 minutes between sets (heavy compound). Aim for 1–2 RIR on final set.";
    } else {
      text = "Rest ~60–90 seconds between sets (isolation/moderate). Shorten to ~45–60s for pump sets.";
    }

    return res.status(200).json({ ok: true, text });
  } catch {
    return res.status(200).json({ ok:false, text: "" });
  }
}
