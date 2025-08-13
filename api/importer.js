export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  try {
    const { text = "" } = await readJSON(req);

    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
    const p = await fetch(`${base}/api/parse-split`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ text })
    }).then(r=>r.json());

    res.status(200).json({ ok:true, ...p });
  } catch {
    res.status(200).json({ ok:false, days:[] });
  }
}
async function readJSON(req){ const a=[]; for await(const c of req) a.push(c); return JSON.parse(Buffer.concat(a).toString("utf8")||"{}"); }
