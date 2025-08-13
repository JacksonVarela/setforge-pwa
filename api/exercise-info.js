// api/exercise-info.js
// Returns JSON: { summary, cues: string[], attachments: string[], image }
// Uses OPENAI_API_KEY. Falls back to local heuristics if the API fails.

const DEFAULT_ATTACH = [
  "V-handle", "Straight bar", "EZ-bar", "Rope",
  "Single D-handle", "Neutral-grip bar", "Ankle cuff", "Dip belt/chain"
];

function defaultAttachments(equip = "") {
  const e = String(equip || "").toLowerCase();
  if (e.includes("cable")) return ["Rope", "V-handle", "Straight bar", "EZ-bar", "Single D-handle", "Lat bar", "Neutral-grip bar", "Ankle cuff"];
  if (e.includes("bodyweight")) return ["Dip belt/chain", "Ab straps", "Pull-up assist band"];
  if (e.includes("barbell")) return ["Collars", "Raised blocks", "Safety arms"];
  if (e.includes("dumbbell")) return ["Straps", "Fat grips"];
  if (e.includes("smith")) return ["Safety stops", "Blocks"];
  return DEFAULT_ATTACH;
}

function fallbackByCat(category = "iso_small", name = "", equip = "") {
  const cuesByCat = {
    upper_comp: [
      "Brace; ribcage down, neutral neck.",
      "2–3s eccentric; full ROM under control.",
      "Elbows track naturally; wrist stacked.",
      "Drive without shrugging; keep scapulae stable."
    ],
    lower_comp: [
      "Brace 360°; neutral spine.",
      "Knees track over toes; mid-foot pressure.",
      "2–3s eccentric; controlled depth.",
      "Explode up; don’t bounce."
    ],
    iso_small: [
      "Chase tension; 2–3s eccentric.",
      "Lock torso; move only at target joint.",
      "Full stretch; hard squeeze on top.",
      "Stop ~0–1 RIR on first sets."
    ]
  };
  const cat = cuesByCat[category] ? category : "iso_small";
  return {
    summary: `Technique cues for ${name} (${equip || "unknown equip"}, ${cat}). Use controlled eccentrics and consistent setup for safe, effective hypertrophy.`,
    cues: cuesByCat[cat],
    attachments: defaultAttachments(equip),
    image: ""
  };
}

function normalize(payload, exercise, equip, category) {
  const fb = fallbackByCat(category, exercise, equip);
  const out = typeof payload === "object" && payload ? payload : {};
  const summary = (typeof out.summary === "string" && out.summary.trim()) || fb.summary;
  const cues = Array.isArray(out.cues) && out.cues.length
    ? out.cues.slice(0, 6).map(x => String(x)).filter(Boolean)
    : fb.cues;
  const attachments = Array.isArray(out.attachments) && out.attachments.length
    ? out.attachments.slice(0, 8).map(x => String(x)).filter(Boolean)
    : defaultAttachments(equip);
  const image = typeof out.image === "string" ? out.image : "";
  return { summary, cues, attachments, image };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { exercise = "", equip = "", category = "" } = req.body || {};
    // Quick guard: if no exercise name, just fallback.
    if (!exercise) {
      return res.status(200).json(fallbackByCat(category, exercise, equip));
    }

    const system = `
You are an evidence-based hypertrophy coach. Respond with STRICT JSON ONLY.
Schema:
{
  "summary": string,      // <= 60 words, plain text
  "cues": string[],       // 3-6 concise bullet points, plain text
  "attachments": string[],// relevant handle/attachment options; empty if N/A
  "image": string         // optional https image URL; "" if none
}
Tone: precise, actionable, safe. Emphasize technique and control. No emojis. No markdown.
If equipment is "bodyweight", prefer bodyweight-specific advice. If "cable", add realistic handle options.
    `.trim();

    const user = {
      exercise,
      equipment: equip || "unknown",
      category: category || "iso_small"
    };

    // Call OpenAI (chat completions) – same style as your coach route
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) }
        ]
      })
    });

    // If API fails, fallback
    if (!r.ok) {
      return res
        .status(200)
        .json(fallbackByCat(category, exercise, equip));
    }

    const j = await r.json();
    let content = j?.choices?.[0]?.message?.content || "";
    let parsed = null;

    // Try to parse JSON content
    try { parsed = JSON.parse(content); } catch {}

    const result = normalize(parsed, exercise, equip, category);
    return res.status(200).json(result);

  } catch (e) {
    return res.status(200).json(fallbackByCat(
      (req.body && req.body.category) || "iso_small",
      (req.body && req.body.exercise) || "",
      (req.body && req.body.equip) || ""
    ));
  }
}
