import React, { useEffect, useState, useRef, Suspense } from "react";
import { auth, db } from "./firebase";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, signOut as fbSignOut,
} from "firebase/auth";
import { doc, setDoc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc } from "firebase/firestore";

import ImporterAI from "./components/ImporterAI";
import ErrorBoundary from "./components/ErrorBoundary";
import Settings from "./components/Settings";
const CoachChat = React.lazy(() => import("./components/CoachChat"));

import { aiSuggestNext, aiCoachNote, aiDescribe, aiWarmupPlan, aiRest } from "./utils/ai";

// helpers
function useLocalState(key, initial){
  const [val,setVal]=useState(()=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):initial}catch{return initial}});
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(val))}catch{}},[key,val]); return [val,setVal];
}
const uid = () => (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
const todayISO = () => new Date().toISOString().slice(0,10);
const vibrate = (ms=12)=>{try{if(navigator.vibrate)navigator.vibrate(ms)}catch{}};
function clampNum(n,min,max,fallback=""){const x=Number(n);if(!Number.isFinite(x))return fallback;return Math.min(max,Math.max(min,x));}

// TEMPLATES (with optional superset indices you can edit later)
const TEMPLATES = [
  { id:"ul-rr", name:"Upper / Lower / Rest (repeat)", days:[
    { id:uid(), name:"Upper", exercises:[
      { name:"Bench Press", sets:4, low:5, high:8, superset:null },
      { name:"Row (Machine)", sets:3, low:8, high:12, superset:null },
      { name:"Overhead Press", sets:3, low:6, high:10, superset:null },
      { name:"Lat Pulldown", sets:3, low:10, high:12, superset:null },
      { name:"Lateral Raise", sets:3, low:12, high:20, superset:null },
    ]},
    { id:uid(), name:"Lower", exercises:[
      { name:"Back Squat", sets:4, low:5, high:8, superset:null },
      { name:"Romanian Deadlift", sets:3, low:6, high:10, superset:null },
      { name:"Leg Press", sets:3, low:10, high:15, superset:null },
      { name:"Leg Curl", sets:3, low:10, high:15, superset:null },
      { name:"Calf Raise", sets:3, low:12, high:20, superset:null },
    ]},
    { id:uid(), name:"Rest / Active Recovery", exercises:[] }
  ]},
  { id:"ppl-6d", name:"PPL (6 days)", days:[
    { id:uid(), name:"Push A", exercises:[
      { name:"Barbell Bench Press", sets:4, low:5, high:8, superset:null },
      { name:"Incline DB Press", sets:3, low:8, high:12, superset:null },
      { name:"Overhead Press (Smith)", sets:3, low:6, high:10, superset:null },
      { name:"Lateral Raise", sets:3, low:12, high:20, superset:null },
    ]},
    { id:uid(), name:"Pull A", exercises:[
      { name:"Weighted Pull-up", sets:4, low:5, high:8, superset:null },
      { name:"Barbell Row", sets:3, low:6, high:10, superset:null },
      { name:"Lat Pulldown", sets:3, low:10, high:12, superset:null },
      { name:"Face Pull", sets:3, low:12, high:20, superset:null },
    ]},
    { id:uid(), name:"Legs A", exercises:[
      { name:"Back Squat", sets:4, low:5, high:8, superset:null },
      { name:"Romanian Deadlift", sets:3, low:6, high:10, superset:null },
      { name:"Leg Press", sets:3, low:10, high:15, superset:null },
      { name:"Leg Curl", sets:3, low:10, high:15, superset:null },
    ]},
    { id:uid(), name:"Push B", exercises:[
      { name:"Incline Bench Press", sets:4, low:6, high:10, superset:null },
      { name:"Seated DB Shoulder Press", sets:3, low:8, high:12, superset:null },
      { name:"Cable Lateral Raise", sets:3, low:12, high:20, superset:null },
    ]},
    { id:uid(), name:"Pull B", exercises:[
      { name:"Deadlift (RPE 7)", sets:3, low:3, high:5, superset:null },
      { name:"Chest-Supported Row", sets:3, low:8, high:12, superset:null },
      { name:"EZ Bar Curl", sets:3, low:8, high:12, superset:null },
    ]},
    { id:uid(), name:"Legs B", exercises:[
      { name:"Front Squat", sets:4, low:5, high:8, superset:null },
      { name:"Hip Thrust", sets:3, low:8, high:12, superset:null },
      { name:"Leg Extension", sets:3, low:12, high:15, superset:null },
    ]},
  ]},
  { id:"arnold-6d", name:"Arnold (C/B • S/A • Legs)", days:[
    { id:uid(), name:"Chest + Back", exercises:[
      { name:"Incline Bench Press", sets:4, low:6, high:10, superset:null },
      { name:"Pull-up / Pulldown", sets:4, low:6, high:10, superset:null },
      { name:"DB Fly", sets:3, low:10, high:15, superset:null },
      { name:"Barbell Row", sets:3, low:6, high:10, superset:null },
    ]},
    { id:uid(), name:"Shoulders + Arms", exercises:[
      { name:"Overhead Press", sets:4, low:6, high:10, superset:null },
      { name:"Lateral Raise", sets:4, low:12, high:20, superset:null },
      { name:"EZ Curl", sets:3, low:8, high:12, superset:null },
      { name:"Cable Pushdown", sets:3, low:10, high:15, superset:null },
    ]},
    { id:uid(), name:"Legs", exercises:[
      { name:"Squat", sets:4, low:5, high:8, superset:null },
      { name:"Leg Press", sets:3, low:10, high:15, superset:null },
      { name:"Leg Curl", sets:3, low:10, high:15, superset:null },
      { name:"Standing Calf", sets:4, low:12, high:20, superset:null },
    ]},
  ]},
  { id:"fb-3d", name:"Full Body (3 days)", days:[
    { id:uid(), name:"Full 1", exercises:[
      { name:"Squat", sets:3, low:5, high:8, superset:null },
      { name:"Bench Press", sets:3, low:6, high:10, superset:null },
      { name:"Pull-up", sets:3, low:6, high:10, superset:null },
    ]},
    { id:uid(), name:"Full 2", exercises:[
      { name:"Deadlift", sets:2, low:3, high:5, superset:null },
      { name:"Incline DB Press", sets:3, low:8, high:12, superset:null },
      { name:"Row (Machine)", sets:3, low:8, high:12, superset:null },
    ]},
    { id:uid(), name:"Full 3", exercises:[
      { name:"Front Squat", sets:3, low:5, high:8, superset:null },
      { name:"Overhead Press", sets:3, low:6, high:10, superset:null },
      { name:"Lat Pulldown", sets:3, low:10, high:12, superset:null },
    ]},
  ]},
];

// Login
function LoginScreen(){
  const [email,setEmail]=useState(""); const [pass,setPass]=useState("");
  const [mode,setMode]=useState("signin"); const [error,setError]=useState("");
  async function doSignIn(){
    setError(""); try{ const cred=await signInWithEmailAndPassword(auth,email,pass);
      if(!cred.user.emailVerified){ await fbSignOut(auth); setMode("verifySent"); setError("Verify your email, then sign in."); }
    }catch(e){ setError(e.message||"Could not sign in."); }
  }
  async function doSignUp(){
    setError(""); try{ const cred=await createUserWithEmailAndPassword(auth,email,pass);
      await sendEmailVerification(cred.user); setMode("verifySent");
    }catch(e){ setError(e.message||"Could not sign up."); }
  }
  return (
    <div className="min-h-screen grid place-items-center bg-login anime-overlay relative safe-px safe-pt safe-pb">
      <div className="coach-sticker" aria-hidden />
      <div className="w-[96%] max-w-md glass-strong p-5">
        <h1 className="text-3xl font-extrabold text-center">SetForge</h1>
        <p className="text-center text-neutral-400">Sign in to get started</p>
        <div className="mt-4 grid gap-2">
          <input className="input" style={{fontSize:16}} placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} type="email"/>
          <input className="input" style={{fontSize:16}} placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} type="password"/>
          {mode==="signin" && <button className="btn-primary" onClick={doSignIn}>Sign in</button>}
          {mode==="signup" && <button className="btn-primary" onClick={doSignUp}>Create account</button>}
          <div className="text-xs text-neutral-400 text-center">Email verification required. We use Firebase Auth.</div>
        </div>
        <div className="mt-3 text-center">
          {mode==="signin"
            ? <button className="btn" onClick={()=>setMode("signup")}>No account? Sign up</button>
            : <button className="btn" onClick={()=>setMode("signin")}>Have an account? Sign in</button>}
        </div>
        {!!error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        {mode==="verifySent" && <div className="mt-3 text-sm text-emerald-400">Verification email sent. Verify, then sign in again.</div>}
      </div>
    </div>
  );
}

// Small async button (double-tap guard + haptic)
function AsyncButton({label,onClick,className}) {
  const [busy,setBusy]=useState(false);
  return (
    <button className={"btn "+(className||"")} disabled={busy} aria-busy={busy}
      onClick={async()=>{ if(busy) return; setBusy(true); try{ await onClick?.(); vibrate(10);}catch(e){alert(`${label} failed.`)} finally{setBusy(false)}}}>
      {busy?"…":label}
    </button>
  );
}

export default function App(){
  const [authReady,setAuthReady]=useState(false); const [user,setUser]=useState(null);
  const [tab,setTab]=useLocalState("sf.tab","log");
  const [units,setUnits]=useLocalState("sf.units","lb");
  const [split,setSplit]=useLocalState("sf.split",null);     // {version,name,days[]}
  const [sessions,setSessions]=useLocalState("sf.sessions",[]); // local mirror
  const [work,setWork]=useLocalState("sf.work",null);        // in-progress workout
  const [showImporter,setShowImporter]=useState(false);
  const [showTemplates,setShowTemplates]=useState(false);

  useEffect(()=>onAuthStateChanged(auth,(u)=>{setUser(u||null);setAuthReady(true)}),[]);
  useEffect(()=>{ const apply=()=>document.body.classList.toggle("compact", window.innerWidth<=430); apply(); window.addEventListener("resize",apply); return()=>window.removeEventListener("resize",apply); },[]);
  async function signOut(){ try{await fbSignOut(auth)}catch{} window.location.replace(window.location.origin+window.location.pathname); }

  // Firestore sync
  useEffect(()=>{ if(!user) return;
    const splitRef=doc(db,"users",user.uid,"data","split");
    getDoc(splitRef).then(snap=>{ const s=snap.data()?.value; if(s && Array.isArray(s.days)) setSplit(s); }).catch(()=>{});
    const q=query(collection(db,"users",user.uid,"sessions"),orderBy("date","desc"),limit(500));
    const unsub=onSnapshot(q,(snap)=>{ const list=[]; snap.forEach(d=>list.push(d.data())); setSessions(list); });
    return ()=>unsub();
  },[user]);

  // Save split with debounce
  const splitSaveTimer=useRef(null);
  useEffect(()=>{ if(!user || !split || !Array.isArray(split.days)) return;
    clearTimeout(splitSaveTimer.current);
    splitSaveTimer.current=setTimeout(async()=>{
      try{ await setDoc(doc(db,"users",user.uid,"data","split"),{ value:{...split,version:1}, updatedAt:Date.now(), uid:user.uid }); }catch{}
    },400);
    return ()=>clearTimeout(splitSaveTimer.current);
  },[split,user]);

  // Offline queue for sessions
  const QUEUE_KEY="sf.pendingSessions";
  function enqueueSession(s){ try{ const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]"); q.push(s); localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50))); }catch{} }
  async function flushQueue(){ if(!user) return; let q=[]; try{q=JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]")}catch{} if(!q.length) return;
    const left=[]; for(const s of q){ try{ await addDoc(collection(db,"users",user.uid,"sessions"),{...s,uid:user.uid}); }catch{ left.push(s); } }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(left));
  }
  useEffect(()=>{ const onl=()=>flushQueue(); window.addEventListener("online",onl); if(user) setTimeout(flushQueue,800); return()=>window.removeEventListener("online",onl); },[user]);

  // Logging ---------------------------------
  async function startWorkoutFor(dayIdx){
    if(!split) return; const day=split.days[dayIdx]; if(!day) return;
    const entries=(day.exercises||[]).map(ex=>{
      const sets=Array.from({length:Number(ex.sets||3)},()=>({weight:"",reps:"",rir:"",fail:false,isDrop:false}));
      return { name:ex.name||"Exercise", low:ex.low??8, high:ex.high??12, sets, decisionNote:"", restText:"…", warmupText:"" };
    });
    const w={ id:uid(), date: todayISO(), dayName: day.name, entries, version:1 };
    setWork(w);

    // fetch rest guidance inline
    setTimeout(async()=>{
      const next={...w}; for(let i=0;i<next.entries.length;i++){
        try{ next.entries[i].restText = await aiRest(next.entries[i].name) || "—"; }catch{ next.entries[i].restText="—"; }
      }
      setWork(next);
    },0);
  }

  function saveWorkout(){
    if(!work) return;
    const cleaned={...work};
    // clamp inputs
    cleaned.entries = (cleaned.entries||[]).map(e=>{
      e.sets=(e.sets||[]).map(s=>({
        weight: s.weight===""? "": clampNum(s.weight,0,10000,""),
        reps:   s.reps===""?   "": clampNum(s.reps,1,50,""),
        rir:    s.fail ? 0 : (s.rir===""? "": clampNum(s.rir,0,5,"")),
        fail: !!s.fail, isDrop: !!s.isDrop
      }));
      return e;
    });
    // push to local immediately
    setSessions([cleaned, ...sessions].slice(0,500));
    setWork(null);
    vibrate(18);
    // try cloud
    (async()=>{
      try{ await addDoc(collection(db,"users",user.uid,"sessions"),{...cleaned, uid:user.uid}); }
      catch{ enqueueSession(cleaned); }
    })();
    alert("Session saved.");
  }
  function discardWorkout(){ if(confirm("Discard current session?")) setWork(null); }

  function applyTemplate(t){
    if(split && !confirm("Overwrite current split?")) return;
    const days=t.days.map(d=>({ id:uid(), name:d.name, exercises:d.exercises.map(x=>({...x})) }));
    setSplit({ version:1, name:t.name, days }); setShowTemplates(false); setTab("log");
  }
  function onImportConfirm(payload){
    if(split && !confirm("Overwrite current split?")) return;
    setSplit({ version:1, ...(payload||{}) }); setShowImporter(false); setTab("log");
  }

  // UI --------------------------------------
  if(!authReady) return <div className="min-h-screen grid place-items-center text-neutral-400">Loading…</div>;
  if(!user) return <LoginScreen/>;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] safe-px safe-pt safe-pb">
      <header className="flex items-center gap-2 justify-between py-3">
        <div className="text-2xl font-extrabold">SetForge</div>
        <nav className="flex gap-2">
          {["log","split","sessions","coach","settings"].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={"px-3 py-2 rounded-xl border "+(tab===t?"bg-neutral-800 border-neutral-700":"bg-neutral-900 border-neutral-800")}>
              {t[0].toUpperCase()+t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="pill">
            <button onClick={()=>setUnits("lb")} className={"px-2 py-1 rounded "+(units==="lb"?"bg-neutral-700":"")}>lb</button>
            <button onClick={()=>setUnits("kg")} className={"px-2 py-1 rounded "+(units==="kg"?"bg-neutral-700":"")}>kg</button>
          </div>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="mt-2">
        {tab==="log" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Log</h2>

            {!split ? (
              <div className="text-neutral-400">Import a split or choose a template to start logging.</div>
            ) : !work ? (
              <div className="grid items-start gap-3 max-w-2xl">
                <div className="pill">Choose day to log</div>
                <div className="grid gap-2">
                  {split.days.map((d,i)=>(
                    <button key={d.id} className="btn" onClick={()=>{ startWorkoutFor(i); }}>
                      Start — {d.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 max-w-3xl">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{work.dayName} — {work.date}</h3>
                </div>

                <div className="grid gap-3">
                  {work.entries.map((e,ei)=>(
                    <div key={ei} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">
                          {e.name} <span className="text-neutral-400 text-sm">({e.low}–{e.high} reps)</span>
                        </div>
                        <div className="text-xs text-neutral-400">Rest: <span className="text-neutral-200">{e.restText||"—"}</span></div>
                      </div>

                      {!!e.warmupText && <div className="mt-1 text-sm text-neutral-300 whitespace-pre-wrap">Warm-up: {e.warmupText}</div>}
                      {!!e.decisionNote && <div className="mt-1 text-xs text-neutral-400">Note: {e.decisionNote}</div>}

                      <div className="mt-2 grid gap-2">
                        {e.sets.map((s,si)=>(
                          <div key={si} className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-neutral-400 w-10">Set {si+1}</span>
                            <input className="input w-24" inputMode="decimal" placeholder={`wt (${units})`} value={s.weight}
                              onChange={ev=>{const n={...work}; n.entries[ei].sets[si].weight=ev.target.value; setWork(n);}}
                              onBlur={ev=>{const n={...work}; const v=ev.target.value===""?"":clampNum(ev.target.value,0,10000,""); n.entries[ei].sets[si].weight=v; setWork(n);}} />
                            <input className="input w-20" inputMode="numeric" placeholder="reps" value={s.reps}
                              onChange={ev=>{const n={...work}; n.entries[ei].sets[si].reps=ev.target.value; setWork(n);}}
                              onBlur={ev=>{const n={...work}; const v=ev.target.value===""?"":clampNum(ev.target.value,1,50,""); n.entries[ei].sets[si].reps=v; setWork(n);}} />
                            <input className="input w-20" inputMode="numeric" placeholder="RIR" value={s.fail?0:s.rir}
                              disabled={s.fail}
                              onChange={ev=>{const n={...work}; n.entries[ei].sets[si].rir=ev.target.value; setWork(n);}}
                              onBlur={ev=>{const n={...work}; const v=ev.target.value===""?"":clampNum(ev.target.value,0,5,""); n.entries[ei].sets[si].rir=v; setWork(n);}} />
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={s.fail}
                                onChange={ev=>{const n={...work}; n.entries[ei].sets[si].fail=ev.target.checked; if(ev.target.checked){n.entries[ei].sets[si].rir=0;} setWork(n);}} />
                              to failure
                            </label>
                            {s.isDrop && <span className="text-[10px] px-2 py-1 rounded bg-neutral-800 border border-neutral-700">drop</span>}
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <AsyncButton label="Suggest"
                          onClick={async()=>{
                            const hist = sessions.filter(x=>x.entries?.some(e2=>e2.name===e.name)).slice(0,3).map(s=>({date:s.date,entries:s.entries}));
                            const flat=[]; hist.forEach(s=>s.entries.forEach(r=>{ if(r.name===e.name){ r.sets.forEach(x=>flat.push({weight:x.weight,reps:x.reps,fail:x.fail})) }}));
                            const failureFlags = flat.map(x=>!!x.fail);
                            const next = await aiSuggestNext({
                              name: e.name,
                              history: flat,
                              targetLow: e.low, targetHigh: e.high,
                              units, bodyweight:false, failureFlags
                            });
                            if(next){
                              const n={...work}; n.entries[ei].decisionNote = next.note || "";
                              if(n.entries[ei].sets?.length){ n.entries[ei].sets[0].weight = next.weight ?? n.entries[ei].sets[0].weight; n.entries[ei].sets[0].reps = next.reps ?? n.entries[ei].sets[0].reps; }
                              setWork(n);
                            } else { alert("No suggestion available."); }
                          }} />
                        <AsyncButton label="Describe"
                          onClick={async()=>{
                            const text = await aiDescribe({ name:e.name });
                            if(text){
                              const n={...work}; n.entries[ei].decisionNote = text;
                              setWork(n);
                            } else alert("No description available.");
                          }} />
                        <AsyncButton label="Warm-up"
                          onClick={async()=>{
                            const top= (e.sets?.[0]?.weight && Number(e.sets[0].weight)) || null;
                            const text = await aiWarmupPlan(e.name, units, top);
                            const n={...work}; n.entries[ei].warmupText = text || "—"; setWork(n);
                          }} />
                        <button className="btn" onClick={()=>{
                          const n={...work}; n.entries[ei].sets.push({weight:"",reps:"",rir:"",fail:false,isDrop:true}); setWork(n);
                        }}>Add Drop</button>
                        <button className="btn" onClick={()=>{
                          const n={...work}; for(let j=n.entries[ei].sets.length-1;j>=0;j--){ if(n.entries[ei].sets[j].isDrop){ n.entries[ei].sets.splice(j,1); break; } }
                          setWork(n);
                        }}>Remove Drop</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sticky-bar flex gap-2 justify-end">
                  <button className="btn" onClick={discardWorkout}>Discard</button>
                  <button className="btn-primary" onClick={saveWorkout}>Save session</button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab==="split" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Split</h2>
            <div className="flex gap-2 flex-wrap">
              <button className="btn" onClick={()=>setShowImporter(true)}>+ Import (AI)</button>
              <button className="btn" onClick={()=>setShowTemplates(true)}>Templates</button>
              {split && <button className="btn" onClick={()=>{ if(confirm("Clear your split?")) setSplit(null); }}>Clear split</button>}
            </div>

            {!split ? (
              <div className="text-neutral-400">No split yet</div>
            ) : (
              <div className="grid gap-3">
                <div className="text-neutral-400">Active split: <span className="text-white">{split.name||"My Split"}</span></div>
                <div className="grid gap-2">
                  {split.days.map(d=>(
                    <div key={d.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold">{d.name}</div>
                      <ul className="mt-1 text-sm text-neutral-300 list-disc pl-5">
                        {(d.exercises||[]).map((x,xi)=>(
                          <li key={xi}>{x.name} — {x.sets} × {x.low}–{x.high}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showImporter && (
              <div className="fixed inset-0 bg-black/60 grid place-items-center p-2 z-50">
                <div className="w-full max-w-5xl bg-neutral-950 border border-neutral-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Import split (AI)</h3>
                    <button className="btn" onClick={()=>setShowImporter(false)}>Close</button>
                  </div>
                  <div className="mt-3">
                    <ImporterAI onConfirm={onImportConfirm} onCancel={()=>setShowImporter(false)}/>
                  </div>
                </div>
              </div>
            )}

            {showTemplates && (
              <div className="fixed inset-0 bg-black/60 grid place-items-center p-2 z-50">
                <div className="w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Templates</h3>
                    <button className="btn" onClick={()=>setShowTemplates(false)}>Close</button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {TEMPLATES.map(t=>(
                      <div key={t.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold">{t.name}</div>
                            <div className="text-xs text-neutral-400">{t.days.length} days • {t.days.reduce((a,d)=>a+d.exercises.length,0)} exercises</div>
                          </div>
                          <button className="btn-primary" onClick={()=>applyTemplate(t)}>Use this</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {tab==="sessions" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Sessions</h2>
            {!sessions.length ? (
              <div className="text-neutral-400">No sessions yet.</div>
            ) : (
              <div className="grid gap-3">
                {sessions.map(s=>(
                  <div key={s.id||`${s.date}-${s.dayName}-${Math.random()}`} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                    <div className="font-semibold">{s.dayName} — {s.date}</div>
                    <div className="mt-2 grid gap-1 text-sm">
                      {(s.entries||[]).map((e,i)=>(
                        <div key={i} className="text-neutral-300">
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-neutral-400">
                            {(e.sets||[]).map((x,xi)=>(
                              <span key={xi} className="mr-2">[{(x.weight??"?")}{units} × {(x.reps??"?")}{x.fail?" F":""}{x.isDrop?" D":""}]</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab==="coach" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Coach</h2>
            <Suspense fallback={<div className="text-neutral-400">Loading coach…</div>}>
              <CoachChat units={units}/>
            </Suspense>
          </section>
        )}

        {tab==="settings" && (
          <Settings
            user={user} split={split} sessions={sessions} units={units}
            onClearLocal={()=>{ setSplit(null); setSessions([]); setWork(null); localStorage.clear(); }}
          />
        )}
      </main>

      <footer className="mt-8 text-center text-xs text-neutral-500">Works offline • Advice-only AI when online</footer>
    </div>
  );
}
