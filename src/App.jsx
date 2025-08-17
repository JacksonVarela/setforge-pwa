// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { initFirebaseApp } from "./firebase";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut as fbSignOut,
} from "firebase/auth";

import ImporterAI from "./components/ImporterAI";
import CoachChat from "./components/CoachChat";

// tiny fetch helper for local /api endpoints
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Templates: quick, science-based splits
const BUILT_IN_TEMPLATES = [
  {
    id: "ul-full",
    name: "Upper/Lower (4-day)",
    days: [
      { name: "Upper A", exercises: [
        { name:"Incline DB Press", sets:3, low:6, high:10, equip:"dumbbell", cat:"compound", group:"push" },
        { name:"Chest-Supported Row", sets:3, low:8, high:12, equip:"machine", cat:"compound", group:"pull" },
        { name:"Seated DB Shoulder Press", sets:3, low:6, high:10, equip:"dumbbell", cat:"compound", group:"push" },
        { name:"Lat Pulldown", sets:3, low:8, high:12, equip:"cable", cat:"compound", group:"pull" },
        { name:"Cable Lateral Raise", sets:3, low:12, high:20, equip:"cable", cat:"isolation", group:"push" },
        { name:"EZ-Bar Curl", sets:2, low:8, high:12, equip:"barbell", cat:"isolation", group:"pull" },
        { name:"Cable Triceps Pressdown", sets:2, low:10, high:15, equip:"cable", cat:"isolation", group:"push" },
      ]},
      { name: "Lower A", exercises: [
        { name:"Back Squat", sets:3, low:4, high:8, equip:"barbell", cat:"compound", group:"legs" },
        { name:"Romanian Deadlift", sets:3, low:6, high:10, equip:"barbell", cat:"compound", group:"legs" },
        { name:"Leg Press", sets:3, low:10, high:15, equip:"machine", cat:"compound", group:"legs" },
        { name:"Seated Leg Curl", sets:3, low:10, high:15, equip:"machine", cat:"isolation", group:"legs" },
        { name:"Standing Calf Raise", sets:3, low:8, high:12, equip:"machine", cat:"isolation", group:"legs" },
      ]},
      { name: "Upper B", exercises: [
        { name:"Flat Barbell Bench", sets:3, low:4, high:8, equip:"barbell", cat:"compound", group:"push" },
        { name:"1-Arm Cable Row", sets:3, low:8, high:12, equip:"cable", cat:"compound", group:"pull" },
        { name:"Machine Shoulder Press", sets:3, low:8, high:12, equip:"machine", cat:"compound", group:"push" },
        { name:"Neutral-Grip Pulldown", sets:3, low:8, high:12, equip:"cable", cat:"compound", group:"pull" },
        { name:"Reverse Pec-Deck", sets:3, low:12, high:20, equip:"machine", cat:"isolation", group:"pull" },
        { name:"Incline DB Curl", sets:2, low:8, high:12, equip:"dumbbell", cat:"isolation", group:"pull" },
        { name:"Overhead Cable Extension", sets:2, low:10, high:15, equip:"cable", cat:"isolation", group:"push" },
      ]},
      { name: "Lower B", exercises: [
        { name:"Front Squat", sets:3, low:4, high:8, equip:"barbell", cat:"compound", group:"legs" },
        { name:"Hip Thrust", sets:3, low:6, high:10, equip:"barbell", cat:"compound", group:"legs" },
        { name:"Leg Extension", sets:3, low:12, high:15, equip:"machine", cat:"isolation", group:"legs" },
        { name:"Lying Leg Curl", sets:3, low:10, high:15, equip:"machine", cat:"isolation", group:"legs" },
        { name:"Seated Calf Raise", sets:3, low:10, high:15, equip:"machine", cat:"isolation", group:"legs" },
      ]},
    ]
  },
  {
    id: "push-pull-legs",
    name: "PPL (6-day)",
    days: [
      { name:"Push A", exercises:[
        { name:"Incline DB Press", sets:3, low:6, high:10, equip:"dumbbell", cat:"compound", group:"push" },
        { name:"Machine Shoulder Press", sets:3, low:8, high:12, equip:"machine", cat:"compound", group:"push" },
        { name:"Cable Flye (high-to-low)", sets:3, low:12, high:20, equip:"cable", cat:"isolation", group:"push" },
        { name:"Lateral Raise", sets:3, low:12, high:20, equip:"dumbbell", cat:"isolation", group:"push" },
        { name:"Triceps Pressdown", sets:3, low:10, high:15, equip:"cable", cat:"isolation", group:"push" },
      ]},
      { name:"Pull A", exercises:[
        { name:"Weighted Pull-up", sets:3, low:4, high:8, equip:"bodyweight", cat:"compound", group:"pull" },
        { name:"Chest-Supported Row", sets:3, low:8, high:12, equip:"machine", cat:"compound", group:"pull" },
        { name:"Pullover Machine", sets:3, low:10, high:15, equip:"machine", cat:"isolation", group:"pull" },
        { name:"Reverse Pec-Deck", sets:3, low:12, high:20, equip:"machine", cat:"isolation", group:"pull" },
        { name:"Incline DB Curl", sets:3, low:8, high:12, equip:"dumbbell", cat:"isolation", group:"pull" },
      ]},
      { name:"Legs A", exercises:[
        { name:"Back Squat", sets:3, low:4, high:8, equip:"barbell", cat:"compound", group:"legs" },
        { name:"Romanian Deadlift", sets:3, low:6, high:10, equip:"barbell", cat:"compound", group:"legs" },
        { name:"Leg Press", sets:3, low:10, high:15, equip:"machine", cat:"compound", group:"legs" },
        { name:"Leg Curl (seated)", sets:3, low:10, high:15, equip:"machine", cat:"isolation", group:"legs" },
        { name:"Standing Calf Raise", sets:3, low:8, high:12, equip:"machine", cat:"isolation", group:"legs" },
      ]},
      // repeat B variants to make 6-day
      { name:"Push B", exercises:[
        { name:"Flat Barbell Bench", sets:3, low:4, high:8, equip:"barbell", cat:"compound", group:"push" },
        { name:"Seated DB Shoulder Press", sets:3, low:6, high:10, equip:"dumbbell", cat:"compound", group:"push" },
        { name:"Cable Flye (mid)", sets:3, low:12, high:20, equip:"cable", cat:"isolation", group:"push" },
        { name:"Cable Lateral Raise", sets:3, low:12, high:20, equip:"cable", cat:"isolation", group:"push" },
        { name:"Overhead Cable Extension", sets:3, low:10, high:15, equip:"cable", cat:"isolation", group:"push" },
      ]},
      { name:"Pull B", exercises:[
        { name:"Lat Pulldown (neutral)", sets:3, low:8, high:12, equip:"cable", cat:"compound", group:"pull" },
        { name:"1-Arm Cable Row", sets:3, low:8, high:12, equip:"cable", cat:"compound", group:"pull" },
        { name:"Pullover Machine", sets:3, low:10, high:15, equip:"machine", cat:"isolation", group:"pull" },
        { name:"Reverse Pec-Deck", sets:3, low:12, high:20, equip:"machine", cat:"isolation", group:"pull" },
        { name:"EZ-Bar Curl", sets:3, low:8, high:12, equip:"barbell", cat:"isolation", group:"pull" },
      ]},
      { name:"Legs B", exercises:[
        { name:"Front Squat", sets:3, low:4, high:8, equip:"barbell", cat:"compound", group:"legs" },
        { name:"Hip Thrust", sets:3, low:6, high:10, equip:"barbell", cat:"compound", group:"legs" },
        { name:"Leg Extension", sets:3, low:12, high:15, equip:"machine", cat:"isolation", group:"legs" },
        { name:"Lying Leg Curl", sets:3, low:10, high:15, equip:"machine", cat:"isolation", group:"legs" },
        { name:"Seated Calf Raise", sets:3, low:10, high:15, equip:"machine", cat:"isolation", group:"legs" },
      ]},
    ]
  }
];

function useLocalState(key, init) {
  const [v, setV] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? init; }
    catch { return init; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(v)); }, [key, v]);
  return [v, setV];
}

export default function App() {
  // Firebase auth init
  const app = useMemo(() => initFirebaseApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);

  const [user, setUser] = useState(null);
  const [verified, setVerified] = useState(false);

  const [tab, setTab] = useLocalState("sf.tab", "split");
  const [units, setUnits] = useLocalState("sf.units", "lb");
  const [split, setSplit] = useLocalState("sf.split", null);
  const [importing, setImporting] = useState(false);

  useEffect(() => onAuthStateChanged(auth, u => {
    setUser(u);
    setVerified(!!u?.emailVerified);
  }), [auth]);

  function signOut() { fbSignOut(auth); }

  // ------------- UI -------------
  if (!user || !verified) return <AuthScreen onAuthed={() => { /* noop */ }} />;

  return (
    <div className="min-h-screen safe-px safe-pt safe-pb">
      <header className="flex items-center justify-between mb-4">
        <h1 className="font-semibold">SetForge</h1>
        <div className="flex items-center gap-2">
          <button
            className={`pill cursor-pointer ${units==='lb' ? 'bg-white text-black border-white' : ''}`}
            onClick={()=>setUnits('lb')}
          >lb</button>
          <button
            className={`pill cursor-pointer ${units==='kg' ? 'bg-white text-black border-white' : ''}`}
            onClick={()=>setUnits('kg')}
          >kg</button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <nav className="flex gap-2 mb-4">
        {["log","split","templates","sessions","coach"].map(t => (
          <button key={t} className={`pill cursor-pointer ${tab===t ? 'bg-white text-black border-white' : ''}`} onClick={()=>setTab(t)}>
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </nav>

      {tab === "log" && (
        <section>
          <h2 className="font-semibold mb-2">Log</h2>
          {!split ? (
            <p className="text-neutral-400">Import a split first, then you can log your session here.</p>
          ) : (
            <p className="text-neutral-400">Logging UI coming up next.</p>
          )}
        </section>
      )}

      {tab === "split" && (
        <section>
          <h2 className="font-semibold mb-2">Split</h2>
          {!split && !importing && (
            <>
              <p className="text-neutral-400 mb-2">Import your program and we’ll structure the days & exercises for you.</p>
              <button className="btn" onClick={() => setImporting(true)}>+ Import split (AI)</button>
            </>
          )}
          {importing && (
            <ImporterAI
              onCancel={() => setImporting(false)}
              onConfirm={(s) => { setSplit(s); setImporting(false); }}
            />
          )}
          {split && !importing && (
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <div className="text-neutral-400">{split.name}</div>
                <button className="btn" onClick={() => setImporting(true)}>Re-import / Edit</button>
              </div>
              {split.days.map((d, i) => (
                <div key={i} className="rounded-xl border border-neutral-800 p-3">
                  <div className="font-medium mb-2">{d.name}</div>
                  <ul className="text-sm text-neutral-300 list-disc pl-5">
                    {d.exercises.map((e, j) => (
                      <li key={j}>{e.name} — {e.sets} × {e.low}–{e.high}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "templates" && (
        <section>
          <h2 className="font-semibold mb-2">Templates</h2>
          <p className="text-neutral-400 mb-3">Science-based starting points for hypertrophy. Customize after loading.</p>
          <div className="grid gap-3">
            {BUILT_IN_TEMPLATES.map(t => (
              <div key={t.id} className="rounded-xl border border-neutral-800 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{t.name}</div>
                  <button className="btn-primary" onClick={() => setSplit({ name: t.name, days: t.days })}>Use this</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "sessions" && (
        <section>
          <h2 className="font-semibold mb-2">Sessions</h2>
          <p className="text-neutral-400">History list will appear here.</p>
        </section>
      )}

      {tab === "coach" && (
        <CoachChat units={units} day={""} />
      )}
    </div>
  );
}

/* ------------------------------ Auth Screen ------------------------------ */

function AuthScreen() {
  const app = useMemo(() => initFirebaseApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState("signin"); // signin | signup | verify
  const [pending, setPending] = useState(false);

  async function submit(e) {
    e?.preventDefault?.();
    try {
      setPending(true);
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, pass);
      } else if (mode === "signup") {
        const { user } = await createUserWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(user);
        setMode("verify");
      }
    } catch (e) {
      alert(e.message || "Auth error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fullscreen anime-overlay bg-login flex items-center justify-center p-4">
      <form onSubmit={submit} className="glass-strong max-w-sm w-full p-4">
        <h1 className="font-semibold text-lg mb-2 text-center">SetForge</h1>
        {mode !== "verify" ? (
          <>
            <input className="input mb-2" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="input mb-2" type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} />
            <button className="btn-primary w-full" disabled={pending}>{pending ? "…" : (mode==="signin"?"Sign in":"Create account")}</button>
            <div className="text-xs text-neutral-400 mt-2 text-center">
              {mode==="signin" ? <>No account? <button type="button" className="underline" onClick={()=>setMode("signup")}>Sign up</button></> :
               <>Already have an account? <button type="button" className="underline" onClick={()=>setMode("signin")}>Sign in</button></>}
            </div>
          </>
        ) : (
          <div className="text-sm text-neutral-300 text-center">
            Check your email and verify your account. Then refresh this page.
          </div>
        )}
      </form>

      {/* login sticker bottom-right, never blocking */}
      <div className="coach-sticker coach-sticker--login" aria-hidden="true" />
    </div>
  );
}
