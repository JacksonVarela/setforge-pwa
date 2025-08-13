// /api/suggest.js
const CONFIG = {
  isoPct: 0.015,
  upperPct: 0.0225,
  lowerPct: 0.035,
  isoMinLb: 2,
  upperMinLb: 2.5,
  lowerMinLb: 5,
  isoMinKg: 1,
  upperMinKg: 1.25,
  lowerMinKg: 2.5,
  dumbbellStepLb: 2.5,
  barbellStepLb: 5,
  machineStepLb: 1,
  bodyweightStepLb: 5,
};

function roundByEquip(weight, equip, units) {
  const step =
    units === "kg"
      ? equip === "machine"
        ? 1
        : equip === "dumbbell"
        ? 1.25
        : equip === "barbell"
        ? 2.5
        : 2.5
      : equip === "machine"
      ? CONFIG.machineStepLb
      : equip === "dumbbell"
      ? CONFIG.dumbbellStepLb
      : equip === "barbell"
      ? CONFIG.barbellStepLb
      : CONFIG.bodyweightStepLb;
  return Math.round(weight / step) * step;
}
function pctFor(cat) {
  return cat === "lower_comp" ? CONFIG.lowerPct : cat === "upper_comp" ? CONFIG.upperPct : CONFIG.isoPct;
}
function minFor(cat, units) {
  if (units === "kg")
    return cat === "lower_comp" ? CONFIG.lowerMinKg : cat === "upper_comp" ? CONFIG.upperMinKg : CONFIG.isoMinKg;
  return cat === "lower_comp" ? CONFIG.lowerMinLb : cat === "upper_comp" ? CONFIG.upperMinLb : CONFIG.isoMinLb;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const { meta, history = [], units = "lb" } = await readJSON(req);
    // meta: {name, cat, equip, low, high}
    // history: array of previous entries for this exercise (most recent first)
    if (!meta) return res.status(200).json({ ok: true, next: null });

    const last = history[0];
    let weight = 0;
    let reps = 0;
    let failed = false;
    if (last?.sets?.length) {
      // best set by load
      const best = [...last.sets].sort((a, b) => (+b.w || 0) - (+a.w || 0) || (+b.r || 0) - (+a.r || 0))[0];
      weight = +best.w || 0;
      reps = +best.r || 0;
      failed = !!best.failed;
    }

    const deltaRaw = Math.max((weight || 0) * pctFor(meta.cat), minFor(meta.cat, units));
    let next = weight;

    if (reps >= meta.high) {
      // hit/beat top of range
      next = weight + deltaRaw * (failed ? 0.75 : 1.25);
    } else if (reps < meta.low) {
      // below range
      next = weight - deltaRaw * (failed ? 1.25 : 0.75);
    } else {
      // inside range
      next = failed ? weight : weight + deltaRaw * 0.5;
    }

    // bodyweight override: keep 0 unless user actually loads weight
    if (meta.equip === "bodyweight" && weight === 0) next = 0;

    next = roundByEquip(Math.max(0, next), meta.equip, units);
    return res.status(200).json({ ok: true, next, basis: { weight, reps, failed } });
  } catch {
    return res.status(200).json({ ok: true, next: null });
  }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
