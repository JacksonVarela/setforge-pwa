// --- App.jsx imports (replace your current import block with this) ---
import React, { useEffect, useMemo, useState } from "react";

// Importing this module guarantees the default Firebase app exists
import app, { auth, initFirebaseApp } from "./firebase";

import {
  getAuth,                 // still available if you want it
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut as fbSignOut,
} from "firebase/auth";

import ImporterAI from "./components/ImporterAI";
import CoachChat from "./components/CoachChat";

// Make extra sure the default app is created (no-op if already created)
initFirebaseApp();
// Optional: if you prefer a local const
// const auth = getAuth(); // you can use this instead of imported `auth`
// --- end imports ---


// Small wrappers to our API routes (utils/ai.js also has these; duplicating here is safe)
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const ai = {
  describe: (name, equip, cat) => postJSON("/api/describe", { name, equip, cat }),
  suggest: (payload) => postJSON("/api/suggest", payload),
  coach: (payload) => postJSON("/api/coach", payload),
};

function useLocalState(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }, [key, val]);
  return [val, setVal];
}

// simple id
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const DEFAULT_SPLIT = {
  id: uid(),
  name: "My Split",
  days: [
    { id: uid(), name: "DAY 1", exercises: [] },
  ],
};

export default function App() {
  // init firebase + auth
  useEffect(() => {
    initFirebaseApp();
  }, []);
  const auth = useMemo(() => getAuth(), []);

  const [user, setUser] = useState(null);
  const [emailPending, setEmailPending] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);

  const [view, setView] = useLocalState("sf.view", "log"); // log | split | sessions | coach
  const [units, setUnits] = useLocalState("sf.units", "lb");
  const [split, setSplit] = useLocalState("sf.split", DEFAULT_SPLIT);
  const [activeDayIdx, setActiveDayIdx] = useLocalState("sf.dayIdx", 0);
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0,10));
  const [sessions, setSessions] = useLocalState("sf.sessions", []); // array of {id,date,dayName,entries:[{ex,setNo,weight,reps,failed,bw,tags:[]}]}
  const [showImporter, setShowImporter] = useState(false);

  // -------------- AUTH UI --------------
  if (!user || !user.emailVerified) {
    return <AuthScreen
      auth={auth}
      emailVerified={!!user?.emailVerified}
      onVerifiedRefresh={() => window.location.reload()}
      pending={emailPending}
      setPending={setEmailPending}
    />;
  }

  // clamp day idx
  const day = split.days[activeDayIdx] || split.days[0];

  // -------------- NAV + SHELL --------------
  return (
    <div className="min-h-screen flex flex-col">
      <Header
        units={units}
        setUnits={setUnits}
        onSignOut={() => fbSignOut(auth)}
        view={view}
        setView={setView}
      />

      {/* Views */}
      <main className="flex-1 container max-w-5xl mx-auto p-3 sm:p-6">
        {view === "log" && (
          <LogView
            split={split}
            setSplit={setSplit}
            dayIdx={activeDayIdx}
            setDayIdx={setActiveDayIdx}
            dateStr={dateStr}
            setDateStr={setDateStr}
            units={units}
            sessions={sessions}
            setSessions={setSessions}
            onDescribe={(ex, idx) => fetchDescribeForExercise(split, setSplit, dayIdx, idx)}
          />
        )}

        {view === "split" && (
          <SplitView
            split={split}
            setSplit={setSplit}
            onOpenImporter={() => setShowImporter(true)}
            onDescribe={(dayIdx, exIdx) => fetchDescribeForExercise(split, setSplit, dayIdx, exIdx)}
          />
        )}

        {view === "sessions" && (
          <SessionsView sessions={sessions} />
        )}

        {view === "coach" && (
          <CoachView />
        )}
      </main>

      {/* Floating coach sticker on most screens */}
      <div className="coach-sticker" />

      {/* Importer modal */}
      {showImporter && (
        <Modal onClose={() => setShowImporter(false)}>
          <ImporterAI
            onCancel={() => setShowImporter(false)}
            onConfirm={(newSplit) => {
              setSplit(newSplit);
              setActiveDayIdx(0);
              setShowImporter(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/* ======================
   HELPERS / SMALL PARTS
   ====================== */

function Header({ units, setUnits, onSignOut, view, setView }) {
  return (
    <header className="border-b border-neutral-800">
      <div className="container max-w-5xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-2">
        <div className="text-xl font-bold">SetForge</div>
        <nav className="ml-4 flex items-center gap-1">
          <Tab label="Log" active={view==="log"} onClick={()=>setView("log")} />
          <Tab label="Split" active={view==="split"} onClick={()=>setView("split")} />
          <Tab label="Past Sessions" active={view==="sessions"} onClick={()=>setView("sessions")} />
          <Tab label="Coach" active={view==="coach"} onClick={()=>setView("coach")} />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <UnitPicker units={units} setUnits={setUnits} />
          <button className="btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-lg text-sm border ${active ? "bg-white text-black" : "bg-transparent"} border-neutral-700`}
    >
      {label}
    </button>
  );
}
function UnitPicker({ units, setUnits }) {
  return (
    <select className="input w-28" value={units} onChange={(e)=>setUnits(e.target.value)}>
      <option value="lb">lb</option>
      <option value="kg">kg</option>
    </select>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-neutral-950 border border-neutral-800 p-4">
        <div className="absolute right-3 top-3">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* -----------------------
   AUTH SCREEN (login only)
   ----------------------- */
function AuthScreen({ auth, emailVerified, onVerifiedRefresh, pending, setPending }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  async function doSignup() {
    setMsg("");
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(user);
      setPending(true);
      setMsg("Verification email sent. Please check your inbox, then reload after verifying.");
    } catch (e) {
      setMsg(e.message || "Sign up failed");
    }
  }
  async function doSignin() {
    setMsg("");
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, pass);
      if (!user.emailVerified) {
        setMsg("Please verify your email to continue.");
      }
    } catch (e) {
      setMsg(e.message || "Sign in failed");
    }
  }

  return (
    <div className="fullscreen bg-login anime-overlay flex items-center justify-center safe-px">
      <div className="glass-strong w-full max-w-md p-6">
        <div className="text-center">
          <img
            src="/images/chat-coach.webp"
            alt="Coach"
            className="w-24 h-24 mx-auto rounded-full object-cover mb-2 border border-neutral-700"
          />
          <h1 className="text-2xl font-bold">Welcome to SetForge</h1>
          <p className="text-neutral-400 text-sm">Evidence-based hypertrophy tracker. Offline-first.</p>
        </div>

        <div className="mt-4 grid gap-2">
          <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" />
          <input className="input" type="password" value={pass} onChange={(e)=>setPass(e.target.value)} placeholder="Password" />
        </div>

        <div className="mt-3 flex items-center gap-2">
          {mode === "signin" ? (
            <>
              <button className="btn-primary" onClick={doSignin}>Sign in</button>
              <button className="btn" onClick={()=>setMode("signup")}>Create account</button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={doSignup}>Create account</button>
              <button className="btn" onClick={()=>setMode("signin")}>Back to sign in</button>
            </>
          )}
        </div>

        {pending && (
          <div className="mt-3 text-xs text-neutral-400">
            After verifying, refresh this page to continue.
            <div className="mt-1">
              <button className="btn" onClick={onVerifiedRefresh}>I verified — refresh</button>
            </div>
          </div>
        )}

        {msg && <p className="mt-3 text-sm text-red-400">{msg}</p>}
      </div>
    </div>
  );
}

/* -----------------------
   SPLIT VIEW (builder)
   ----------------------- */
function SplitView({ split, setSplit, onOpenImporter, onDescribe }) {
  function addDay() {
    const next = structuredClone(split);
    next.days.push({ id: uid(), name: `DAY ${next.days.length + 1}`, exercises: [] });
    setSplit(next);
  }
  function addExercise(di) {
    const next = structuredClone(split);
    next.days[di].exercises.push({
      id: uid(),
      name: "",
      sets: 3, low: 8, high: 12,
      equip: "machine",
      cat: "iso_small", // isolation (small)
      group: "upper",
      desc: "",
      attachments: [], // e.g., ["rope", "bench"]
      tags: [],
    });
    setSplit(next);
  }

  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={onOpenImporter}>Import / Paste (AI)</button>
        <button className="btn" onClick={addDay}>Add day</button>
      </div>

      {split.days.map((d, di) => (
        <div key={d.id} className="rounded-xl border border-neutral-800 p-3">
          <div className="flex items-center gap-2">
            <input
              className="input"
              value={d.name}
              onChange={(e)=>{
                const next = structuredClone(split);
                next.days[di].name = e.target.value;
                setSplit(next);
              }}
            />
            <button className="btn" onClick={()=>{
              const next = structuredClone(split);
              next.days.splice(di,1);
              setSplit(next);
            }}>Remove day</button>
          </div>

          <div className="mt-3 grid gap-3">
            {d.exercises.map((ex, xi) => (
              <div key={ex.id} className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DragButtons
                    onUp={()=>{
                      if (xi===0) return;
                      const next = structuredClone(split);
                      const arr = next.days[di].exercises;
                      [arr[xi-1], arr[xi]] = [arr[xi], arr[xi-1]];
                      setSplit(next);
                    }}
                    onDown={()=>{
                      const next = structuredClone(split);
                      const arr = next.days[di].exercises;
                      if (xi >= arr.length-1) return;
                      [arr[xi+1], arr[xi]] = [arr[xi], arr[xi+1]];
                      setSplit(next);
                    }}
                  />
                  <input className="input flex-1" value={ex.name} placeholder="Exercise name"
                    onChange={(e)=>{
                      const next = structuredClone(split);
                      next.days[di].exercises[xi].name = e.target.value;
                      setSplit(next);
                    }} />
                  <NumInput label="sets" v={ex.sets} onC={(v)=>{
                    const next = structuredClone(split); next.days[di].exercises[xi].sets = v; setSplit(next);
                  }}/>
                  <NumInput label="low" v={ex.low} onC={(v)=>{
                    const next = structuredClone(split); next.days[di].exercises[xi].low = v; setSplit(next);
                  }}/>
                  <NumInput label="high" v={ex.high} onC={(v)=>{
                    const next = structuredClone(split); next.days[di].exercises[xi].high = v; setSplit(next);
                  }}/>
                  <SelectInput label="equip" v={ex.equip} onC={(v)=>{
                    const next = structuredClone(split); next.days[di].exercises[xi].equip = v; setSplit(next);
                  }} opts={["barbell","dumbbell","machine","cable","smith","bodyweight"]}/>
                  <SelectInput label="type" v={ex.cat} onC={(v)=>{
                    const next = structuredClone(split); next.days[di].exercises[xi].cat = v; setSplit(next);
                  }} opts={[
                    ["upper_comp","upper — compound"],
                    ["lower_comp","lower — compound"],
                    ["iso_small","isolation — small"],
                    ["iso_large","isolation — large"],
                  ]}/>
                  <SelectInput label="group" v={ex.group} onC={(v)=>{
                    const next = structuredClone(split); next.days[di].exercises[xi].group = v; setSplit(next);
                  }} opts={["upper","lower","push","pull","legs","core","neck","forearms"]}/>
                  <button className="btn" onClick={()=>onDescribe(di, xi)}>Desc</button>
                  <button className="btn" onClick={()=>{
                    const name = prompt("Attachment name (e.g. rope, bench, EZ-bar):");
                    if (!name) return;
                    const next = structuredClone(split);
                    const arr = next.days[di].exercises[xi].attachments || [];
                    if (!arr.includes(name)) arr.push(name);
                    next.days[di].exercises[xi].attachments = arr;
                    setSplit(next);
                  }}>+ Attachment</button>
                  <button className="btn" onClick={()=>{
                    const next = structuredClone(split);
                    next.days[di].exercises.splice(xi,1);
                    setSplit(next);
                  }}>Remove</button>
                </div>

                {ex.desc && (
                  <div className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap border border-neutral-800 rounded-lg p-2">
                    {ex.desc}
                  </div>
                )}

                {ex.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ex.attachments.map((a, i)=>(
                      <span key={i} className="pill">
                        {a}
                        <button className="ml-1 text-neutral-400" onClick={()=>{
                          const next = structuredClone(split);
                          next.days[di].exercises[xi].attachments =
                            (ex.attachments || []).filter((x)=>x!==a);
                          setSplit(next);
                        }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button className="btn" onClick={()=>addExercise(di)}>Add exercise</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function NumInput({ label, v, onC }) {
  return (
    <div className="flex items-center gap-1">
      <input className="input w-20 text-center" value={v} onChange={(e)=>onC(Number(e.target.value||0))} />
      <span className="text-xs text-neutral-400 -ml-1">{label}</span>
    </div>
  );
}
function SelectInput({ label, v, onC, opts = [] }) {
  return (
    <div className="flex items-center gap-1">
      <select className="input w-auto" value={v} onChange={(e)=>onC(e.target.value)}>
        {opts.map((o,i)=> Array.isArray(o)
          ? <option key={i} value={o[0]}>{o[1]}</option>
          : <option key={i}>{o}</option>
        )}
      </select>
      <span className="text-xs text-neutral-400 -ml-1">{label}</span>
    </div>
  );
}
function DragButtons({ onUp, onDown }) {
  return (
    <div className="flex items-center">
      <button className="btn" onClick={onUp}>↑</button>
      <button className="btn ml-1" onClick={onDown}>↓</button>
    </div>
  );
}

/* -----------------------
   LOG VIEW
   ----------------------- */
function LogView({
  split, setSplit,
  dayIdx, setDayIdx,
  dateStr, setDateStr,
  units,
  sessions, setSessions,
  onDescribe
}) {
  const day = split.days[dayIdx] || split.days[0];

  const [skipSet, setSkipSet] = useState({}); // exId => skipped bool
  const [skipHistory, setSkipHistory] = useState([]); // for undo

  // per-exercise log rows state (local only until Save)
  const [rows, setRows] = useState(() => initializeRows(day));

  useEffect(() => {
    // re-init when day changes
    setRows(initializeRows(day));
    setSkipSet({});
  }, [dayIdx, split.id]); // eslint-disable-line

  function initializeRows(day) {
    const obj = {};
    (day?.exercises || []).forEach(ex => {
      const sets = Math.max(1, Number(ex.sets || 3));
      obj[ex.id] = Array.from({ length: sets }).map((_,i) => ({
        setNo: i+1,
        weight: ex.equip === "bodyweight" ? "" : "",
        reps: "",
        failed: false,
        bw: ex.equip === "bodyweight",
        tags: [],
      }));
    });
    return obj;
  }

  function addSet(ex) {
    setRows(prev => {
      const next = structuredClone(prev);
      next[ex.id] = next[ex.id] || [];
      next[ex.id].push({
        setNo: (next[ex.id].length || 0) + 1,
        weight: ex.equip === "bodyweight" ? "" : "",
        reps: "",
        failed: false,
        bw: ex.equip === "bodyweight",
        tags: [],
      });
      return next;
    });
  }

  function saveSession() {
    const entries = [];
    (day?.exercises || []).forEach(ex => {
      if (skipSet[ex.id]) return;
      (rows[ex.id] || []).forEach(s => {
        if (!s.reps && !s.weight && !s.failed) return; // ignore empty rows
        entries.push({
          ex: ex.name,
          exId: ex.id,
          equip: ex.equip,
          cat: ex.cat,
          setNo: s.setNo,
          weight: s.bw ? "BW" : Number(s.weight || 0),
          reps: Number(s.reps || 0),
          failed: !!s.failed,
          bw: !!s.bw,
          tags: s.tags || [],
        });
      });
    });

    const payload = {
      id: uid(),
      date: dateStr,
      dayName: day?.name || `DAY ${dayIdx+1}`,
      entries,
      units,
    };
    setSessions([payload, ...sessions]);
    alert("Session saved.");
  }

  async function suggestForExercise(ex) {
    // Aggregate last 3 sessions of this exercise
    const recent = sessions
      .filter(s => s.entries?.some(e => e.exId === ex.id))
      .slice(0, 3)
      .map(s => ({
        date: s.date,
        sets: s.entries.filter(e => e.exId === ex.id).map(e => ({
          weight: e.weight, reps: e.reps, failed: e.failed, bw: e.bw
        }))
      }));

    // Current session rows for this exercise
    const current = (rows[ex.id] || []).map(s => ({
      weight: s.bw ? "BW" : Number(s.weight || 0),
      reps: Number(s.reps || 0),
      failed: !!s.failed, bw: !!s.bw
    }));

    try {
      const { ok, suggestions } = await ai.suggest({
        ex: {
          name: ex.name,
          equip: ex.equip,
          cat: ex.cat,
          low: ex.low,
          high: ex.high
        },
        units,
        recent,
        current
      });

      if (ok && Array.isArray(suggestions)) {
        setRows(prev => {
          const next = structuredClone(prev);
          next[ex.id] = (next[ex.id] || []).map((setRow, i) => {
            const sug = suggestions[i];
            if (!sug) return setRow;
            return {
              ...setRow,
              weight: setRow.bw ? "" : (sug.weight ?? setRow.weight),
              reps: sug.reps ?? setRow.reps
            };
          });
          return next;
        });
      } else {
        // fallback simple heuristic
        fallbackSuggest(ex);
      }
    } catch {
      fallbackSuggest(ex);
    }

    function fallbackSuggest(ex) {
      setRows(prev => {
        const arr = prev[ex.id] || [];
        // naive % change based on last set failure + reps vs range
        const last = arr[arr.length-1] || {};
        const hi = Number(ex.high || 12);
        const lo = Number(ex.low || 8);
        const w = Number(last.weight || 0);
        const r = Number(last.reps || 0);
        const fail = !!last.failed;

        let delta = 0;
        if (last.bw) delta = 0;
        else {
          if (fail && r < lo) delta = -0.05;         // failed below range → down 5%
          else if (!fail && r >= hi) delta = +0.05;  // hit top without fail → up 5%
          else delta = 0;
        }

        const next = structuredClone(prev);
        next[ex.id] = arr.map(s => ({
          ...s,
          weight: s.bw ? "" : Math.round((Number(s.weight || w) * (1 + delta)) * 2) / 2
        }));
        return next;
      });
    }
  }

  function skipExercise(ex) {
    setSkipHistory(h => [{ id: ex.id, prev: !!skipSet[ex.id] }, ...h]);
    setSkipSet(prev => ({ ...prev, [ex.id]: true }));
  }
  function undoSkip() {
    const [last, ...rest] = skipHistory;
    if (!last) return;
    setSkipSet(prev => ({ ...prev, [last.id]: last.prev }));
    setSkipHistory(rest);
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input" value={dayIdx} onChange={(e)=>setDayIdx(Number(e.target.value))}>
          {split.days.map((d, i)=>(
            <option key={d.id} value={i}>{d.name || `DAY ${i+1}`}</option>
          ))}
        </select>

        <input className="input w-44" type="date" value={dateStr} onChange={(e)=>setDateStr(e.target.value)} />
        <button className="btn-primary" onClick={saveSession}>Save session</button>
        <button className="btn" onClick={undoSkip} disabled={!skipHistory.length}>Undo skip</button>
      </div>

      {(day?.exercises || []).map((ex, i) => (
        <div key={ex.id} className="rounded-xl border border-neutral-800 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">{ex.name || "(unnamed exercise)"}</div>
            <div className="pill">{ex.sets}×{ex.low}–{ex.high}</div>
            <div className="pill">{ex.equip}</div>
            <div className="pill">{ex.cat}</div>
            <button className="btn" onClick={()=>onDescribe(ex, i)}>Desc</button>
            <button className="btn" onClick={()=>suggestForExercise(ex)}>Suggest</button>
            <button className="btn" onClick={()=>skipExercise(ex)}>Skip today</button>
          </div>

          {!skipSet[ex.id] && (
            <>
              <div className="mt-2 grid gap-2">
                {(rows[ex.id] || []).map((s, si) => (
                  <div key={si} className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-neutral-400 w-10">Set {s.setNo}</label>

                    {/* BW toggle */}
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={s.bw} onChange={(e)=>{
                        setRows(prev=>{
                          const next = structuredClone(prev);
                          next[ex.id][si].bw = e.target.checked;
                          if (e.target.checked) next[ex.id][si].weight = "";
                          return next;
                        });
                      }}/>
                      BW
                    </label>

                    {/* weight / reps */}
                    <input
                      className="input w-24"
                      placeholder={units}
                      disabled={s.bw}
                      value={s.weight}
                      onChange={(e)=>{
                        const v = e.target.value.replace(/[^\d.]/g,'');
                        setRows(prev=>{
                          const next = structuredClone(prev);
                          next[ex.id][si].weight = v;
                          return next;
                        });
                      }}
                    />
                    <input
                      className="input w-24"
                      placeholder="reps"
                      value={s.reps}
                      onChange={(e)=>{
                        const v = e.target.value.replace(/[^\d]/g,'');
                        setRows(prev=>{
                          const next = structuredClone(prev);
                          next[ex.id][si].reps = v;
                          return next;
                        });
                      }}
                    />

                    {/* failure */}
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={s.failed} onChange={(e)=>{
                        setRows(prev=>{
                          const next = structuredClone(prev);
                          next[ex.id][si].failed = e.target.checked;
                          return next;
                        });
                      }}/>
                      failed at
                    </label>

                    {/* tags editor (inline) */}
                    <TagEditor
                      value={s.tags || []}
                      onChange={(tags)=>{
                        setRows(prev=>{
                          const next = structuredClone(prev);
                          next[ex.id][si].tags = tags;
                          return next;
                        });
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-2">
                <button className="btn" onClick={()=>addSet(ex)}>Add set</button>
              </div>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

function TagEditor({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  function addTag() {
    const t = input.trim();
    if (!t) return;
    if (!value.includes(t)) onChange([...(value||[]), t]);
    setInput("");
  }

  return (
    <div className="relative">
      <button className="btn" onClick={()=>setOpen(!open)}>Tags</button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 rounded-xl border border-neutral-800 bg-neutral-950 p-2">
          <div className="flex flex-wrap gap-1">
            {(value||[]).map((t,i)=>(
              <span key={i} className="pill">
                {t}
                <button className="ml-1 text-neutral-400" onClick={()=>onChange((value||[]).filter(x=>x!==t))}>×</button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input flex-1" placeholder="Add tag…" value={input} onChange={(e)=>setInput(e.target.value)} />
            <button className="btn" onClick={addTag}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -----------------------
   PAST SESSIONS VIEW
   ----------------------- */
function SessionsView({ sessions }) {
  if (!sessions.length) return <p className="text-neutral-400">No sessions yet.</p>;
  return (
    <section className="grid gap-3">
      {sessions.map(s => (
        <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
          <div className="flex items-center gap-2">
            <div className="font-semibold">{s.dayName}</div>
            <div className="pill">{s.date}</div>
          </div>
          <div className="mt-2 grid gap-1 text-sm">
            {s.entries.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-neutral-300">{e.ex}</span>
                <span className="pill">Set {e.setNo}</span>
                <span className="pill">{e.bw ? "BW" : `${e.weight} ${e.weight==="BW"?"":""}`}</span>
                <span className="pill">{e.reps} reps</span>
                {e.failed && <span className="pill">failed</span>}
                {e.tags?.length > 0 && (
                  <span className="text-neutral-400">tags: {e.tags.join(", ")}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* -----------------------
   COACH VIEW (chat tab)
   ----------------------- */
function CoachView() {
  return (
    <section className="relative">
      <div className="absolute right-2 -top-12 w-16 h-16 rounded-full border border-neutral-800"
           style={{ backgroundImage:"url('/images/chat-coach.webp')", backgroundSize:"cover", backgroundPosition:"center" }}/>
      <CoachChat />
    </section>
  );
}

/* -----------------------
   API: Describe helper
   ----------------------- */
async function fetchDescribeForExercise(split, setSplit, dayIdx, exIdx) {
  const ex = split.days[dayIdx]?.exercises?.[exIdx];
  if (!ex?.name) return;
  try {
    const { ok, text } = await ai.describe(ex.name, ex.equip, ex.cat);
    const next = structuredClone(split);
    next.days[dayIdx].exercises[exIdx].desc = ok ? text : (text || "");
    setSplit(next);
  } catch {
    // ignore
  }
}
