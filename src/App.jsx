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

// --- tiny utils ---
function useLocalState(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}
const todayKey = () => new Date().toISOString().slice(0,10);
const uid = () => crypto.randomUUID();

// ---- split/session shapes ----
// split: {id,name,days:[{id,name,exercises:[{name,sets,low,high,equip,cat,group,attachments:[]}] }]}
const emptySplit = null;

// ---- API helpers (serverless routes you already have) ----
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return r.json();
}

// =========================
// App
// =========================
export default function App() {
  // firebase auth
  const app = useMemo(() => initFirebaseApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);
  const [user, setUser] = useState(null);
  const [emailErr, setEmailErr] = useState("");

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [auth]);

  // ui state
  const [tab, setTab] = useLocalState("sf.tab", "log");   // "log" | "split" | "sessions" | "coach"
  const [units, setUnits] = useLocalState("sf.units", "lb");

  // data
  const [split, setSplit] = useLocalState("sf.split", emptySplit);
  const [sessions, setSessions] = useLocalState("sf.sessions", []); // array of {id,date,dayName,items:[{name,sets:[{w,r,fail}]}]}

  // split helpers
  function clearSplit() { setSplit(null); }

  // ======= Logging UI (simple) =======
  const [activeDayIdx, setActiveDayIdx] = useLocalState("sf.dayIdx", 0);
  const [work, setWork] = useLocalState("sf.work", null);
  useEffect(() => {
    if (!split) { setWork(null); return; }
    const day = split.days[activeDayIdx] || split.days[0];
    if (!day) { setWork(null); return; }
    // seed empty work if not present
    if (!work || work?.dayId !== day.id) {
      setWork({
        id: uid(),
        dayId: day.id,
        dayName: day.name,
        items: day.exercises.map(ex => ({
          name: ex.name,
          target: `${ex.sets} x ${ex.low}-${ex.high}`,
          sets: [] // {w,r,fail}
        }))
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, activeDayIdx]);

  function addSet(i) {
    const next = structuredClone(work);
    next.items[i].sets.push({ w: "", r: "", fail: false });
    setWork(next);
  }
  function updateSet(i, j, patch) {
    const next = structuredClone(work);
    Object.assign(next.items[i].sets[j], patch);
    setWork(next);
  }
  function removeSet(i, j) {
    const next = structuredClone(work);
    next.items[i].sets.splice(j,1);
    setWork(next);
  }
  function finishSession() {
    if (!work) return;
    const entry = { id: uid(), date: todayKey(), dayName: work.dayName, items: work.items };
    const next = [entry, ...sessions].slice(0, 60);
    setSessions(next);
    setWork(null);
    alert("Session saved.");
  }

  // ======= Auth screens =======
  if (!user) return <AuthScreen
    onLogin={async (email, pass) => {
      setEmailErr("");
      try {
        await signInWithEmailAndPassword(auth, email, pass);
      } catch (e) {
        setEmailErr(e?.message || "Could not sign in");
      }
    }}
    onSignup={async (email, pass) => {
      setEmailErr("");
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(cred.user);
        alert("Verification email sent. Please verify, then sign in.");
      } catch (e) {
        setEmailErr(e?.message || "Could not sign up");
      }
    }}
    units={units}
    setUnits={setUnits}
  />;

  // ======= App nav + pages =======
  return (
    <div className="page safe-px safe-pt safe-pb">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-bold">SetForge</div>
          <div className="text-xs text-neutral-400">Offline lift tracker</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input w-20"
            value={units}
            onChange={(e)=>setUnits(e.target.value)}
          >
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
          <button className="btn" onClick={()=>fbSignOut(auth)}>Sign out</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-3">
        <Tab label="Log" active={tab==="log"} onClick={()=>setTab("log")} />
        <Tab label="Split" active={tab==="split"} onClick={()=>setTab("split")} />
        <Tab label="Sessions" active={tab==="sessions"} onClick={()=>setTab("sessions")} />
        <Tab label="Coach" active={tab==="coach"} onClick={()=>setTab("coach")} />
      </div>

      {/* Pages */}
      <div className="mt-4">
        {tab === "log" && (
          <section className="grid gap-4">
            {!split && (
              <div className="text-neutral-400">Import or build a split first, then log your sessions here.</div>
            )}
            {split && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-400">Day</span>
                  <select
                    className="input w-auto"
                    value={String(activeDayIdx)}
                    onChange={(e)=>setActiveDayIdx(Number(e.target.value))}
                  >
                    {split.days.map((d, i)=>(
                      <option key={d.id} value={i}>{d.name}</option>
                    ))}
                  </select>
                  <button className="btn" onClick={finishSession}>Finish & Save</button>
                </div>

                {!work ? (
                  <div className="text-neutral-400">Preparing workout…</div>
                ) : (
                  <div className="grid gap-3">
                    {work.items.map((it, i)=>(
                      <div key={i} className="rounded-xl border border-neutral-800 p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{it.name}</div>
                          <div className="pill">{it.target}</div>
                        </div>
                        <div className="mt-2 grid gap-2">
                          {it.sets.map((s, j)=>(
                            <div key={j} className="flex flex-wrap items-center gap-2">
                              <input
                                className="input w-28"
                                placeholder={`weight (${units})`}
                                value={s.w}
                                onChange={(e)=>updateSet(i,j,{w:e.target.value})}
                              />
                              <input
                                className="input w-24"
                                placeholder="reps"
                                value={s.r}
                                onChange={(e)=>updateSet(i,j,{r:e.target.value})}
                              />
                              <label className="text-sm flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={!!s.fail}
                                  onChange={(e)=>updateSet(i,j,{fail:e.target.checked})}
                                />
                                to failure
                              </label>
                              <button className="btn" onClick={()=>removeSet(i,j)}>Remove</button>
                            </div>
                          ))}
                          <button className="btn" onClick={()=>addSet(i)}>+ Add set</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === "split" && (
          <SplitPage
            split={split}
            setSplit={setSplit}
            clearSplit={clearSplit}
          />
        )}

        {tab === "sessions" && (
          <section className="grid gap-3">
            <h3 className="font-semibold">Sessions</h3>
            {!sessions.length && <div className="text-neutral-400">No sessions yet.</div>}
            {!!sessions.length && sessions.map(s=>(
              <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
                <div className="text-sm text-neutral-400">{s.date} • {s.dayName}</div>
                <ul className="mt-2 text-sm">
                  {s.items.map((it, i)=>(
                    <li key={i} className="mb-1">
                      <span className="font-medium">{it.name}</span>{" "}
                      {it.sets.map((x, idx)=>(
                        <span key={idx} className="text-neutral-400">
                          {idx ? ", " : ""}{x.w}{units}×{x.r}{x.fail ? " (F)" : ""}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {tab === "coach" && (
          <CoachChat
            units={units}
            /* Tiny avatar fix (use the small sticker) */
            avatarSrc="/images/chat-coach.webp"
          />
        )}
      </div>
    </div>
  );
}

// =========================
// Auth screen
// =========================
function AuthScreen({ onLogin, onSignup, units, setUnits }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState("login"); // login | signup

  return (
    <div className="page page-login bg-login anime-overlay flex items-center justify-center">
      <div className="coach-sticker" />
      <div className="glass-strong w-full max-w-md mx-auto p-5">
        <h1 className="text-2xl font-extrabold text-center">SetForge</h1>
        <p className="text-sm text-neutral-400 text-center">Sign {mode === "login" ? "in" : "up"} to get started</p>

        <div className="mt-4 grid gap-2">
          <input className="input" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="input" placeholder="Password" type="password" value={pass} onChange={(e)=>setPass(e.target.value)} />
          <div className="flex items-center justify-between">
            <select className="input w-24" value={units} onChange={(e)=>setUnits(e.target.value)}>
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
            {mode === "login" ? (
              <button className="btn-primary px-4 py-2 rounded-xl" onClick={()=>onLogin(email, pass)}>Sign in</button>
            ) : (
              <button className="btn-primary px-4 py-2 rounded-xl" onClick={()=>onSignup(email, pass)}>Create account</button>
            )}
          </div>
          <div className="text-xs text-neutral-400 text-center">
            Email verification required. We use Firebase Auth free tier.
          </div>
          <button className="btn mt-1" onClick={()=>setMode(mode==="login"?"signup":"login")}>
            {mode==="login" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================
// Split page (Import + Templates inside)
// =========================
function SplitPage({ split, setSplit, clearSplit }) {
  const [showImporter, setShowImporter] = useState(false);
  const [confirmUse, setConfirmUse] = useState(null); // pending template

  const templates = useMemo(()=>([
    makeTpl("Push / Pull / Legs (6d)", [
      ["Push A","Incline DB Press","Seated OHP","Cable Fly","Lateral Raise","Rope Pushdown"],
      ["Pull A","Weighted Pull-up","Chest-supported Row","Rear Delt Fly","EZ Curl","Hammer Curl"],
      ["Legs A","Back Squat","Romanian Deadlift","Leg Press","Leg Curl","Standing Calf Raise"],
      ["Push B","Flat Bench Press","Arnold Press","Dips","Lateral Raise","Skullcrusher"],
      ["Pull B","Barbell Row","Lat Pulldown","Face Pull","Incline DB Curl","Reverse Curl"],
      ["Legs B","Front Squat","Hip Thrust","Leg Extension","Leg Curl","Seated Calf Raise"],
    ]),
    makeTpl("Upper / Lower (4d)", [
      ["Upper 1","Bench Press","Row","OHP","Pulldown","Curl","Pushdown"],
      ["Lower 1","Squat","RDL","Leg Press","Leg Curl","Calf Raise","Abs"],
      ["Upper 2","Incline Press","Chest Row","Lateral Raise","Pull-up","Curl","Pushdown"],
      ["Lower 2","Front Squat","Hip Thrust","Leg Extension","Leg Curl","Calf Raise","Abs"],
    ]),
    makeTpl("Full body (3d)", [
      ["Day 1","Front Squat","Bench Press","Pull-up","Curl","Calf Raise"],
      ["Day 2","Deadlift (light)","OHP","Row","Pushdown","Abs"],
      ["Day 3","Hack Squat","Incline DB Press","Pulldown","Lateral Raise","Curl"],
    ]),
    makeTpl("Arnold (Chest/Back, Shoulders/Arms, Legs) 6d", [
      ["Chest & Back A","Bench Press","Row","Incline DB Press","Lat Pulldown","Fly"],
      ["Shoulders & Arms A","OHP","Lateral Raise","Skullcrusher","EZ Curl","Face Pull"],
      ["Legs A","Squat","RDL","Leg Press","Leg Curl","Calf Raise"],
      ["Chest & Back B","Weighted Dip","Chest Row","Incline Press","Pull-up","Rear Delt Fly"],
      ["Shoulders & Arms B","Seated OHP","Lateral Raise","Pushdown","DB Curl","Face Pull"],
      ["Legs B","Front Squat","Hip Thrust","Leg Extension","Leg Curl","Calf Raise"],
    ]),
  ]), []);

  function useTemplate(t) {
    // Confirm if already have split
    if (split) { setConfirmUse(t); return; }
    setSplit(t);
  }

  return (
    <section className="grid gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Your splits</h3>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={()=>setShowImporter(true)}>+ Import split (AI)</button>
          <button className="btn" onClick={()=>setSplit(buildEmpty())}>Build manually</button>
          {!!split && <button className="btn-ghost" onClick={clearSplit}>Remove current</button>}
        </div>
      </div>

      {!split && <div className="text-neutral-400">No splits yet</div>}

      {!!split && (
        <div className="rounded-xl border border-neutral-800 p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{split.name}</div>
          </div>
          <ol className="mt-2 grid gap-2">
            {split.days.map((d)=>(
              <li key={d.id} className="rounded-lg border border-neutral-800 p-2">
                <div className="font-medium">{d.name}</div>
                <div className="text-sm text-neutral-400">
                  {d.exercises.map(x=>x.name).join(" • ")}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Templates */}
      <div className="grid gap-3">
        <h3 className="font-semibold">Templates</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map(t=>(
            <div key={t.id} className="rounded-xl border border-neutral-800 p-3">
              <div className="font-medium">{t.name}</div>
              <div className="mt-1 text-sm text-neutral-400">{t.days.length} days</div>
              <button className="btn mt-2" onClick={()=>useTemplate(t)}>Use this</button>
            </div>
          ))}
        </div>
      </div>

      {/* Importer modal */}
      {showImporter && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="glass-strong w-full max-w-4xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Import split</div>
              <button className="btn" onClick={()=>setShowImporter(false)}>Close</button>
            </div>
            <div className="mt-3">
              <ImporterAI
                onCancel={()=>setShowImporter(false)}
                onConfirm={(s)=>{
                  setSplit({ id: uid(), ...s });
                  setShowImporter(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirm overwrite */}
      {!!confirmUse && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="glass-strong w-full max-w-md p-4">
            <div className="font-semibold">Replace current split?</div>
            <p className="text-sm text-neutral-400 mt-2">
              You already have a split selected. Replace it with “{confirmUse.name}”?
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn" onClick={()=>setConfirmUse(null)}>Cancel</button>
              <button className="btn-primary" onClick={()=>{
                setSplit(confirmUse);
                setConfirmUse(null);
              }}>Replace</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// helpers to build templates
function makeTpl(name, spec) {
  return {
    id: uid(),
    name,
    days: spec.map(([dayName, ...exs]) => ({
      id: uid(),
      name: dayName,
      exercises: exs.map(n => ({
        name: n, sets: 3, low: 8, high: 12, equip: "machine",
        cat: "isolation", group: "upper", attachments: []
      }))
    }))
  };
}
function buildEmpty() {
  return {
    id: uid(),
    name: "Custom split",
    days: [
      { id: uid(), name: "Day 1", exercises: [] }
    ]
  };
}

// =========================
// Tiny UI bits
// =========================
function Tab({ label, active, onClick }) {
  return (
    <button
      className={`px-4 py-2 rounded-xl text-sm border ${active ? "bg-white text-black" : "bg-[#171717] border-neutral-800"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
