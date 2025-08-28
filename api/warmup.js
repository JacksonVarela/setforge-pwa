// /api/warmup.js
const LIMIT = { windowMs: 60_000, max: 12 };
const bucket = new Map();
function tooMany(ip){
  const now=Date.now(), key=`${ip}:warmup`;
  const arr=(bucket.get(key)||[]).filter(t=>now-t<LIMIT.windowMs);
  if(arr.length>=LIMIT.max) return true;
  arr.push(now); bucket.set(key,arr); return false;
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"POST only"});
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket?.remoteAddress || "0";
  if(tooMany(ip)) return res.status(429).json({ok:false,text:"Please slow down."});
  try{
    const a=[]; for await (const c of req) a.push(c);
    const { name="", units="lb", target=null } = JSON.parse(Buffer.concat(a).toString("utf8")||"{}");

    const system=`You output a brief warm-up ramp for hypertrophy in ${units}.
If a top set target is provided, taper to that over 3–5 mini-sets.
Be concise, 3–5 lines max.`;
    const prompt = target
      ? `Exercise: ${name}\nTop set target: ${target}${units}\nGive the ramp + 1 cue.`
      : `Exercise: ${name}\nNo target. Provide a generic ramp based on RPE + 1 cue.`;

    const body={ model:"gpt-4o-mini", temperature:0.3,
      messages:[ {role:"system",content:system}, {role:"user",content:prompt} ] };

    const r=await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    if(!r.ok){ const txt=await r.text(); return res.status(200).json({ok:false,text:`OpenAI error: ${r.status} ${txt.slice(0,180)}`}); }
    const j=await r.json();
    res.status(200).json({ok:true,text:j?.choices?.[0]?.message?.content||""});
  }catch{
    res.status(200).json({ok:false,text:""});
  }
}
