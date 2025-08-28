// /api/rest.js
const LIMIT = { windowMs: 60_000, max: 20 };
const bucket = new Map();
function tooMany(ip){
  const now=Date.now(), key=`${ip}:rest`;
  const arr=(bucket.get(key)||[]).filter(t=>now-t<LIMIT.windowMs);
  if(arr.length>=LIMIT.max) return true;
  arr.push(now); bucket.set(key,arr); return false;
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"POST only"});
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket?.remoteAddress || "0";
  if(tooMany(ip)) return res.status(429).json({ok:false,text:"Please slow down."});
  try{
    const a=[]; for await(const c of req) a.push(c);
    const { name="" } = JSON.parse(Buffer.concat(a).toString("utf8")||"{}");

    const body={ model:"gpt-4o-mini", temperature:0.2, messages:[
      { role:"system", content:
`Return ONE short line with a rest guideline for hypertrophy based on exercise name:
- Big compounds: 2–3 min
- Moderate: 90–120s
- Isolation: 45–75s
Infer by common terms: (squat, deadlift, press, row)=compound; (raise, curl, extension, fly)=isolation.` },
      { role:"user", content:`Exercise: ${name}` }
    ]};

    const r=await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST", headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    const j=await r.json();
    res.status(200).json({ok:true,text:j?.choices?.[0]?.message?.content||""});
  }catch{
    res.status(200).json({ok:false,text:""});
  }
}
