export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { name = "" } = await readJSON(req);
    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "For a lift name, output JSON with keys: equip, group, isCompound, attachments[]. Keep it short. Equip ∈ {barbell,dumbbell,machine,cable,smith,bodyweight}. group e.g. upper, lower, push, pull, legs, core, neck, forearms." },
        { role: "user", content: `Name: ${name}\nReturn ONLY JSON.` }
      ]
    };
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content || "{}";
    let info = {};
    try { info = JSON.parse(raw); } catch {}
    res.status(200).json({ ok:true, ...info });
  } catch {
    res.status(200).json({ ok:false });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
