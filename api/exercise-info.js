// /api/exercise-info.js
function guessEquip(name) {
  const n = name.toLowerCase();
  if (/\bsmith\b/.test(n)) return "smith";
  if (/(barbell|bb\b)/.test(n)) return "barbell";
  if (/(dumbbell|db\b)/.test(n)) return "dumbbell";
  if (/(cable|rope|pulldown|row\b)/.test(n)) return "cable";
  if (/(dip|hanging|push-up|chin|pull-up|neck|leg raise|back extension)/.test(n)) return "bodyweight";
  if (/(machine|pec deck|leg press|abduction|adduction|ham.*curl|leg extension|calf)/.test(n)) return "machine";
  return "machine";
}
function guessCat(name) {
  const n = name.toLowerCase();
  if (/(squat|deadlift|romanian|rdl|leg press|split squat|hack squat)/.test(n)) return "lower_comp";
  if (/(bench|press|row|pulldown|pull-up|dip|ohp|shoulder press)/.test(n)) return "upper_comp";
  return "iso_small";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const { name = "" } = await readJSON(req);
    const equip = guessEquip(name);
    const cat = guessCat(name);
    const canonical = name.replace(/\s+/g, " ").trim();
    res.status(200).json({ ok: true, name: canonical, equip, cat });
  } catch {
    res.status(200).json({ ok: false });
  }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
