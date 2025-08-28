import React, { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as fbSignOut,
} from "firebase/auth";

import { subscribeUserState, saveSplit, saveSessions, saveWorkDraft, clearWorkDraft } from "./db";
import ImporterAI from "./components/ImporterAI";
import CoachChat from "./components/CoachChat";
import SpinnerButton from "./components/SpinnerButton";
import Timer from "./components/Timer";
import { aiDescribe, aiSuggestNext, aiRestSuggest, aiWarmupPlan, aiCoachNote } from "./utils/ai";

// ---------- small localStorage helper ----------
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

function uid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }
function todayISO() { return new Date().toISOString().slice(0,10); }

// ---------- templates ----------
const TEMPLATES = [
  {
    id: "ulr-4d",
    name: "Upper / Lower (Rest) • 4d",
    days: [
      { id:"u1", name:"Upper A", exercises:[
        { name:"Bench Press", sets:4, low:5, high:8, equip:"barbell", group:"push", cat:"compound", ss:"" },
        { name:"Chest-Supported Row", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound", ss:"" },
        { name:"Overhead Press", sets:3, low:6, high:10, equip:"barbell", group:"push", cat:"compound", ss:"" },
        { name:"Lat Pulldown", sets:3, low:10, high:12, equip:"machine", group:"pull", cat:"compound", ss:"" },
        { name:"Lateral Raise", sets:3, low:12, high:20, equip:"dumbbell", group:"push", cat:"isolation", ss:"" },
      ]},
      { id:"l1", name:"Lower A", exercises:[
        { name:"Back Squat", sets:4, low:5, high:8, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Romanian Deadlift", sets:3, low:6, high:10, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Leg Press", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"compound", ss:"" },
        { name:"Calf Raise", sets:3, low:12, high:20, equip:"machine", group:"legs", cat:"isolation", ss:"" },
      ]},
      { id:"u2", name:"Upper B", exercises:[
        { name:"Incline DB Press", sets:4, low:8, high:12, equip:"dumbbell", group:"push", cat:"compound", ss:"" },
        { name:"Chest Supported Row", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound", ss:"" },
        { name:"Seated OHP (Smith)", sets:3, low:8, high:12, equip:"smith", group:"push", cat:"compound", ss:"" },
        { name:"Pulldown (Neutral)", sets:3, low:10, high:12, equip:"machine", group:"pull", cat:"compound", ss:"" },
        { name:"Cable Curl", sets:3, low:10, high:15, equip:"cable", group:"pull", cat:"isolation", ss:"" },
      ]},
      { id:"l2", name:"Lower B", exercises:[
        { name:"Front Squat", sets:3, low:5, high:8, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Hip Thrust", sets:3, low:8, high:12, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Leg Extension", sets:3, low:12, high:15, equip:"machine", group:"legs", cat:"isolation", ss:"" },
        { name:"Seated Calf Raise", sets:3, low:12, high:20, equip:"machine", group:"legs", cat:"isolation", ss:"" },
      ]},
    ]
  },
  {
    id:"ppl-6d", name:"PPL • 6d", days:[
      { id:"pA", name:"Push A", exercises:[
        { name:"Bench Press", sets:4, low:5, high:8, equip:"barbell", group:"push", cat:"compound", ss:"" },
        { name:"Incline DB Press", sets:3, low:8, high:12, equip:"dumbbell", group:"push", cat:"compound", ss:"" },
        { name:"Lateral Raise", sets:3, low:12, high:20, equip:"dumbbell", group:"push", cat:"isolation", ss:"" },
      ]},
      { id:"plA", name:"Pull A", exercises:[
        { name:"Weighted Pull-up", sets:4, low:5, high:8, equip:"bodyweight", group:"pull", cat:"compound", ss:"" },
        { name:"Chest-Supported Row", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound", ss:"" },
        { name:"Cable Curl", sets:3, low:10, high:15, equip:"cable", group:"pull", cat:"isolation", ss:"" },
      ]},
      { id:"lA", name:"Legs A", exercises:[
        { name:"Back Squat", sets:4, low:5, high:8, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Romanian Deadlift", sets:3, low:6, high:10, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Calf Raise", sets:3, low:12, high:20, equip:"machine", group:"legs", cat:"isolation", ss:"" },
      ]},
      { id:"pB", name:"Push B", exercises:[
        { name:"Incline Bench Press", sets:4, low:6, high:10, equip:"barbell", group:"push", cat:"compound", ss:"" },
        { name:"Dips", sets:3, low:6, high:10, equip:"bodyweight", group:"push", cat:"compound", ss:"" },
        { name:"Cable Lateral Raise", sets:3, low:12, high:20, equip:"cable", group:"push", cat:"isolation", ss:"" },
      ]},
      { id:"plB", name:"Pull B", exercises:[
        { name:"Barbell Row", sets:3, low:6, high:10, equip:"barbell", group:"pull", cat:"compound", ss:"" },
        { name:"Lat Pulldown", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound", ss:"" },
        { name:"Face Pull", sets:3, low:12, high:20, equip:"cable", group:"pull", cat:"isolation", ss:"" },
      ]},
      { id:"lB", name:"Legs B", exercises:[
        { name:"Front Squat", sets:3, low:6, high:10, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Leg Curl", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"isolation", ss:"" },
        { name:"Seated Calf Raise", sets:3, low:12, high:20, equip:"machine", group:"legs", cat:"isolation", ss:"" },
      ]},
    ]
  },
  {
    id:"arnold-6d",
    name:"Arnold Split • 6d",
    days:[
      { id:"a1", name:"Chest + Back", exercises:[
        { name:"Incline Bench Press", sets:4, low:6, high:10, equip:"barbell", group:"push", cat:"compound", ss:"" },
        { name:"Barbell Row", sets:4, low:6, high:10, equip:"barbell", group:"pull", cat:"compound", ss:"" },
        { name:"DB Fly", sets:3, low:10, high:15, equip:"dumbbell", group:"push", cat:"isolation", ss:"" },
      ]},
      { id:"a2", name:"Shoulders + Arms", exercises:[
        { name:"Overhead Press", sets:4, low:6, high:10, equip:"barbell", group:"push", cat:"compound", ss:"" },
        { name:"Lateral Raise", sets:4, low:12, high:20, equip:"dumbbell", group:"push", cat:"isolation", ss:"" },
        { name:"EZ Curl", sets:3, low:8, high:12, equip:"barbell", group:"pull", cat:"isolation", ss:"" },
      ]},
      { id:"a3", name:"Legs", exercises:[
        { name:"Back Squat", sets:4, low:5, high:8, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Leg Press", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"compound", ss:"" },
        { name:"Standing Calf", sets:4, low:12, high:20, equip:"machine", group:"legs", cat:"isolation", ss:"" },
      ]},
    ]
  },
  {
    id:"fb-3d",
    name:"Full Body • 3d",
    days:[
      { id:"f1", name:"Full 1", exercises:[
        { name:"Squat", sets:3, low:5, high:8, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Bench Press", sets:3, low:6, high:10, equip:"barbell", group:"push", cat:"compound", ss:"" },
        { name:"Pull-up", sets:3, low:6, high:10, equip:"bodyweight", group:"pull", cat:"compound", ss:"" },
      ]},
      { id:"f2", name:"Full 2", exercises:[
        { name:"Deadlift", sets:2, low:3, high:5, equip:"barbell", group:"pull", cat:"compound", ss:"" },
        { name:"Incline DB Press", sets:3, low:8, high:12, equip:"dumbbell", group:"push", cat:"compound", ss:"" },
        { name:"Row (Machine)", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound", ss:"" },
      ]},
      { id:"f3", name:"Full 3", exercises:[
        { name:"Front Squat", sets:3, low:5, high:8, equip:"barbell", group:"legs", cat:"compound", ss:"" },
        { name:"Overhead Press", sets:3, low:6, high:10, equip:"barbell", group:"push", cat:"compound", ss:"" },
        { name:"Lat Pulldown", sets:3, low:10, high:12, equip:"machine", group:"pull", cat:"compound", ss:"" },
      ]},
    ]
  }
];

// ---------- login screen ----------
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState("signin"); // signin | signup | verifySent
  const [error, setError] = useState("");

  async function doSignIn() {
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (!cred.user.emailVerified) {
        await fbSignOut(auth);
        setMode("verifySent");
        setError("Check your inbox and verify your email before signing in.");
      }
    } catch (e) {
      setError(e.message || "Could not sign in.");
    }
  }
  async function doSignUp() {
    setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user);
      setMode("verifySent");
    } catch (e) {
      setError(e.message || "Could not sign up.");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-login anime-overlay relative safe-px safe-pt safe-pb">
      <div className="coach-sticker" aria-hidden />
      <div className="w-[96%] max-w-md glass-strong p-5">
        <h1 className="text-3xl font-extrabold text-center">SetForge</h1>
        <p className="text-center text-neutral-400">Sign in to get started</p>
        <div className="mt-4 grid gap-2">
          <input className="input" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} type="email" />
          <input className="input" placeholder="Password" value={pass} onChange={(e)=>setPass(e.target.value)} type="password" />
          {mode === "signin" && (<button className="btn-primary" onClick={doSignIn}>Sign in</button>)}
          {mode === "signup" && (<button className="btn-primary" onClick={doSignUp}>Create account</button>)}
          <div className="text-xs text-neutral-400 text-center">Email verification required. Firebase Auth.</div>
        </div>
        <div className="mt-3 text-center">
          {mode === "signin" ? (
            <button className="btn" onClick={() => setMode("signup")}>No account? Sign up</button>
          ) : (
            <button className="btn" onClick={() => setMode("signin")}>Have an account? Sign in</button>
          )}
        </div>
        {!!error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        {mode === "verifySent" && (
          <div className="mt-3 text-sm text-emerald-400">Verification email sent. Verify, then sign in again.</div>
        )}
      </div>
    </div>
  );
}

// ---------- simple modal ----------
function Modal({ open, onClose, children, title = "Note" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3">
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-700 p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="mt-3 text-sm">{children}</div>
      </div>
    </div>
  );
}

// ---------- main app ----------
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  const [tab, setTab] = useLocalState("sf.tab", "log");
  const [units, setUnits] = useLocalState("sf.units", "lb");
  const [split, setSplit] = useLocalState("sf.split", null);
  const [sessions, setSessions] = useLocalState("sf.sessions", []);
  const [work, setWork] = useLocalState("sf.work", null);

  const [showImporter, setShowImporter] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // compact mode toggle
  const [compact, setCompact] = useLocalState("sf.compact", true);

  // resume banner / draft from cloud
  const [resumeDraft, setResumeDraft] = useState(null);

  // AI session note modal
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  // local UI state
  const [busySave, setBusySave] = useState(false);

  // auth & firestore subscription
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeUserState(user.uid, ({ split: s, sessions: ss, workDraft }) => {
      if (s) setSplit(s);
      if (Array.isArray(ss) && ss.length) setSessions(ss);
      if (workDraft && !work) setResumeDraft(workDraft);
    });
    return unsub;
  }, [user]); // eslint-disable-line

  // debounced cloud sync for split/sessions
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => { saveSplit(user.uid, split || null).catch(()=>{}); }, 600);
    return () => clearTimeout(t);
  }, [user, split]);
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => { saveSessions(user.uid, sessions || [] ).catch(()=>{}); }, 600);
    return () => clearTimeout(t);
  }, [user, sessions]);

  // AUTO-SAVE WORK DRAFT (every 10s)
  const lastDraftRef = useRef("");
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      if (!work) return;
      const payload = { ...work, units };
      const ser = JSON.stringify(payload);
      if (ser !== lastDraftRef.current) {
        lastDraftRef.current = ser;
        saveWorkDraft(user.uid, payload).catch(()=>{});
      }
    }, 10000);
    return () => clearInterval(id);
  }, [user, work, units]);

  function applyResume() {
    if (!resumeDraft) return;
    setWork(resumeDraft);
    setResumeDraft(null);
  }
  async function discardResume() {
    setResumeDraft(null);
    if (user) await clearWorkDraft(user.uid).catch(()=>{});
  }

  async function signOut() {
    try { await fbSignOut(auth); } catch {}
    window.location.replace(window.location.origin + window.location.pathname);
  }

  // ----- logging helpers -----
  function startWorkoutFor(dayIdx) {
    if (!split) return;
    const day = split.days[dayIdx];
    const entries = [];
    day.exercises.forEach((ex) => {
      const sets = Array.from({ length: ex.sets || 3 }, () => ({ weight: "", reps: "", fail: false, rir:null, tempo:"" }));
      entries.push({ name: ex.name, low: ex.low || 8, high: ex.high || 12, sets, ss: ex.ss || "", equip: ex.equip || "", group: ex.group || "", cat: ex.cat || "compound" });
    });
    setWork({ id: uid(), date: todayISO(), dayName: day.name, entries });
  }

  async function saveWorkout() {
    if (!work) return;
    setBusySave(true);
    try {
      const newSessions = [{ ...work }, ...sessions].slice(0, 200);
      setSessions(newSessions);
      setWork(null);
      if (user) await clearWorkDraft(user.uid).catch(()=>{});
      try {
        const recent = newSessions.slice(1, 6);
        const advice = await aiCoachNote(newSessions[0], recent, units, work?.dayName || "");
        if (advice) { setNoteText(advice); setNoteOpen(true); }
      } catch {}
      alert("Session saved.");
    } finally {
      setBusySave(false);
    }
  }

  function discardWorkout() {
    if (confirm("Discard current session?")) {
      setWork(null);
      if (user) clearWorkDraft(user.uid).catch(()=>{});
    }
  }

  function applyTemplate(t) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    const days = t.days.map((d) => ({
      id: uid(),
      name: d.name,
      exercises: d.exercises.map((x) => ({ ...x })),
    }));
    const next = { name: t.name, days };
    setSplit(next);
    setShowTemplates(false);
    setTab("log");
  }

  function onImportConfirm(payload) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    setSplit(payload);
    setShowImporter(false);
    setTab("log");
  }

  // Gather history for an exercise
  function getHistory(name) {
    const hist = [];
    for (const s of sessions) {
      for (const e of s.entries) {
        if (e.name === name) {
          hist.push({
            date: s.date,
            sets: e.sets.map(x => ({ weight: x.weight, reps: x.reps, fail: !!x.fail, rir: x.rir ?? null })),
            target: { low: e.low, high: e.high }
          });
        }
      }
      if (hist.length >= 6) break;
    }
    return hist;
  }

  // Render groups with superset pairing (ss same id)
  function renderEntriesGrouped() {
    const list = work.entries;
    const blocks = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const b = list[i+1];
      if (a.ss && b && b.ss && a.ss === b.ss) {
        blocks.push({ type: "ss", aIndex: i, bIndex: i+1 });
        i++;
      } else {
        blocks.push({ type: "solo", aIndex: i });
      }
    }
    return blocks;
  }

  // Attach AI note to the most recent session
  function attachNoteToLast() {
    if (!noteText) return;
    const copy = [...sessions];
    if (!copy.length) return;
    copy[0] = { ...copy[0], note: noteText };
    setSessions(copy);
    setNoteOpen(false);
  }

  // Export data
  function exportJSON() {
    const data = JSON.stringify({ split, sessions }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "setforge-export.json"; a.click();
    URL.revokeObjectURL(url);
  }

  // Compact mode class
  useEffect(() => {
    document.documentElement.classList.toggle("compact", !!compact);
  }, [compact]);

  if (!authReady) return <div className="min-h-screen grid place-items-center text-neutral-400">Loading…</div>;
  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] safe-px safe-pt safe-pb">
      {resumeDraft && !work && tab === "log" && (
        <div className="banner">
          <div>
            Resume in-progress session — <strong>{resumeDraft.dayName}</strong> ({resumeDraft.date})
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={applyResume}>Resume</button>
            <button className="btn" onClick={discardResume}>Discard</button>
          </div>
        </div>
      )}

      {/* top bar */}
      <header className="flex items-center gap-2 sm:gap-3 justify-between py-2 sm:py-3 sticky top-0 z-30 bg-[var(--bg)]">
        <div className="text-xl sm:text-2xl font-extrabold">SetForge</div>

        <nav className="flex gap-1 sm:gap-2">
          {["log", "split", "sessions", "coach"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "px-3 sm:px-4 py-2 rounded-xl border " +
                (tab === t ? "bg-neutral-800 border-neutral-700" : "bg-neutral-900 border-neutral-800")
              }
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="pill">
            <button onClick={() => setUnits("lb")} className={"px-2 py-1 rounded " + (units === "lb" ? "bg-neutral-700" : "")}>lb</button>
            <button onClick={() => setUnits("kg")} className={"px-2 py-1 rounded " + (units === "kg" ? "bg-neutral-700" : "")}>kg</button>
          </div>
          <label className="pill cursor-pointer">
            <input type="checkbox" className="mr-1" checked={!!compact} onChange={(e)=>setCompact(e.target.checked)} />
            compact
          </label>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="mt-2">
        {tab === "log" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Log</h2>

            {!split ? (
              <div className="text-neutral-400">Import a split first, then you can log your session here.</div>
            ) : !work ? (
              <div className="grid items-start gap-3 max-w-2xl">
                <div className="pill">Choose day to log</div>
                <div className="grid gap-2">
                  {split.days.map((d, i) => (
                    <button key={d.id} className="btn" onClick={() => { setWork(null); startWorkoutFor(i); }}>
                      Start — {d.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 max-w-3xl">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{work.dayName} — {work.date}</h3>
                  </div>

                  {/* grouped render */}
                  <div className="grid gap-3">
                    {renderEntriesGrouped().map((blk, k) => {
                      const renderSetRow = (entryIndex, labelPrefix="") => (s, si) => (
                        <div key={si} className="flex items-center gap-2">
                          <span className="text-xs text-neutral-400 w-10">{labelPrefix}{si + 1}</span>
                          <input
                            className="input w-24"
                            placeholder={`wt (${units})`}
                            value={s.weight}
                            onChange={(ev) => {
                              const next = structuredClone(work);
                              next.entries[entryIndex].sets[si].weight = ev.target.value;
                              setWork(next);
                            }}
                          />
                          <input
                            className="input w-20"
                            placeholder="reps"
                            value={s.reps}
                            onChange={(ev) => {
                              const next = structuredClone(work);
                              next.entries[entryIndex].sets[si].reps = ev.target.value;
                              setWork(next);
                            }}
                          />
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={s.fail}
                              onChange={(ev) => {
                                const next = structuredClone(work);
                                next.entries[entryIndex].sets[si].fail = ev.target.checked;
                                setWork(next);
                              }}
                            />
                            F
                          </label>

                          {/* Optional extras collapsed by default */}
                          <details className="ml-2">
                            <summary className="text-xs text-neutral-400 cursor-pointer">more</summary>
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                className="input w-16"
                                placeholder="RIR"
                                value={s.rir ?? ""}
                                onChange={(ev) => {
                                  const next = structuredClone(work);
                                  const v = ev.target.value.trim();
                                  next.entries[entryIndex].sets[si].rir = v === "" ? null : Number(v);
                                  setWork(next);
                                }}
                              />
                              <input
                                className="input w-20"
                                placeholder="tempo"
                                value={s.tempo ?? ""}
                                onChange={(ev) => {
                                  const next = structuredClone(work);
                                  next.entries[entryIndex].sets[si].tempo = ev.target.value;
                                  setWork(next);
                                }}
                              />
                            </div>
                          </details>
                        </div>
                      );

                      if (blk.type === "solo") {
                        const e = work.entries[blk.aIndex];
                        const [suggestBusy, setSuggestBusy] = useState(false);
                        const [restBusy, setRestBusy] = useState(false);
                        const [descBusy, setDescBusy] = useState(false);
                        const [suggestLine, setSuggestLine] = useState("");
                        const [suggestWhy, setSuggestWhy] = useState("");
                        const [restSec, setRestSec] = useState(null);
                        const [warmups, setWarmups] = useState([]);
                        const [descText, setDescText] = useState("");

                        // tiny inline component to call AI (hooks per block)
                        function Controls() {
                          async function doSuggest() {
                            setSuggestBusy(true);
                            try {
                              const hist = getHistory(e.name);
                              const rirHistory = hist.flatMap(h => h.sets.map(s => s.rir).filter(v => v !== null));
                              const failureFlags = hist.flatMap(h => h.sets.map(s => !!s.fail));
                              const next = await aiSuggestNext({
                                name: e.name,
                                history: hist,
                                targetLow: e.low,
                                targetHigh: e.high,
                                units,
                                bodyweight: (e.equip === "bodyweight"),
                                rirHistory,
                                failureFlags
                              });
                              const arrow = next.decision === "up" ? "↑" : next.decision === "down" ? "↓" : "→";
                              const line = `${arrow} ${next.weight ?? "—"}${next.weight==null?"":units}`;
                              setSuggestLine(line);
                              setSuggestWhy(next.note || "");
                            } finally { setSuggestBusy(false); }
                          }
                          async function doRest() {
                            setRestBusy(true);
                            try {
                              const lastSet = e.sets[e.sets.length-1] || {};
                              const hist = getHistory(e.name);
                              const sec = await aiRestSuggest({ name: e.name, lastSet, intensity:{ targetLow:e.low, targetHigh:e.high }, history: hist });
                              setRestSec(sec);
                            } finally { setRestBusy(false); }
                          }
                          async function doWarmup() {
                            const working = Number(
                              [...e.sets].reverse().find(s => s.weight)?.weight || 0
                            ) || 0;
                            const hist = getHistory(e.name);
                            const tops = hist.map(h => Math.max(...h.sets.map(s => Number(s.weight||0))));
                            try {
                              const plan = await aiWarmupPlan({ name: e.name, workingWeight: working, units, recentTops: tops });
                              setWarmups(plan || []);
                            } catch {}
                          }
                          async function doDescribe() {
                            setDescBusy(true);
                            try {
                              const text = await aiDescribe({ name: e.name, equip: e.equip || "machine", cat: e.cat?.includes("compound")?"compound":"iso_small" });
                              setDescText(text || "");
                            } finally { setDescBusy(false); }
                          }

                          return (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <SpinnerButton className="btn" loading={suggestBusy} onClick={doSuggest}>Suggest</SpinnerButton>
                              <SpinnerButton className="btn" loading={restBusy} onClick={doRest}>Rest</SpinnerButton>
                              <button className="btn" onClick={doWarmup}>Warm-ups</button>
                              <SpinnerButton className="btn" loading={descBusy} onClick={doDescribe}>Describe</SpinnerButton>
                              {!!suggestLine && (
                                <>
                                  <span className="pill">{suggestLine}</span>
                                  {suggestWhy ? <details><summary className="text-xs text-neutral-400 cursor-pointer">why?</summary><div className="text-xs text-neutral-300 mt-1">{suggestWhy}</div></details> : null}
                                </>
                              )}
                              {restSec ? <span className="pill">~{restSec}s</span> : null}
                            </div>
                          );
                        }

                        return (
                          <div key={k} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                            <div className="font-semibold">
                              {e.name} <span className="text-neutral-400 text-sm">({e.low}–{e.high} reps)</span>
                              {e.ss && <span className="ml-2 text-xs pill">Superset</span>}
                            </div>
                            <div className="mt-2 grid gap-2">
                              {e.sets.map(renderSetRow(blk.aIndex))}
                            </div>
                            <Controls />
                            { /* Warmups list */ }
                            {/* render warmups if present */}
                            {/* (kept inline to keep code compact) */}
                          </div>
                        );
                      } else {
                        // Superset block
                        const a = work.entries[blk.aIndex];
                        const b = work.entries[blk.bIndex];
                        const maxSets = Math.max(a.sets.length, b.sets.length);

                        return (
                          <div key={k} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                            <div className="font-semibold flex items-center gap-3">
                              <span>{a.name}</span>
                              <span className="text-xs pill">Superset</span>
                              <span className="opacity-60">×</span>
                              <span>{b.name}</span>
                            </div>
                            <div className="mt-2 grid gap-2">
                              {Array.from({ length: maxSets }).map((_, si) => (
                                <div key={si} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {renderSetRow(blk.aIndex, "A")(a.sets[si] || { weight:"", reps:"", fail:false, rir:null, tempo:"" }, si)}
                                  {renderSetRow(blk.bIndex, "B")(b.sets[si] || { weight:"", reps:"", fail:false, rir:null, tempo:"" }, si)}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>

                {/* sticky bottom action bar for mobile */}
                <div className="bottombar">
                  <div className="flex items-center gap-2">
                    <SpinnerButton className="btn-primary" loading={busySave} onClick={saveWorkout}>Save</SpinnerButton>
                    <button className="btn" onClick={discardWorkout}>Discard</button>
                  </div>
                  <Timer initial={90} />
                </div>
              </>
            )}
          </section>
        )}

        {tab === "split" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Split</h2>

            <div className="flex gap-2 flex-wrap">
              <button className="btn" onClick={() => setShowImporter(true)}>+ Import (AI)</button>
              <button className="btn" onClick={() => setShowTemplates(true)}>Templates</button>
              {split && (
                <button className="btn" onClick={() => { if (confirm("Clear your split?")) setSplit(null); }}>
                  Clear split
                </button>
              )}
            </div>

            {!split ? (
              <div className="text-neutral-400">No split yet</div>
            ) : (
              <div className="grid gap-3">
                <div className="text-neutral-400">Active split: <span className="text-white">{split.name || "My Split"}</span></div>
                <div className="grid gap-2">
                  {split.days.map((d, di) => (
                    <div key={d.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold flex items-center gap-2">
                        <input
                          className="input w-full sm:w-auto"
                          value={d.name}
                          onChange={(e) => {
                            const next = structuredClone(split);
                            next.days[di].name = e.target.value;
                            setSplit(next);
                          }}
                        />
                      </div>
                      <ul className="mt-2 grid gap-2">
                        {d.exercises.map((x, xi) => (
                          <li key={xi} className="rounded-lg bg-neutral-950 border border-neutral-800 p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input className="input flex-1" value={x.name} onChange={(e)=>{
                                const next = structuredClone(split);
                                next.days[di].exercises[xi].name = e.target.value; setSplit(next);
                              }} />
                              <input className="input w-16" value={x.sets} onChange={(e)=>{
                                const next = structuredClone(split);
                                next.days[di].exercises[xi].sets = Number(e.target.value||3); setSplit(next);
                              }} />
                              <input className="input w-16" value={x.low} onChange={(e)=>{
                                const next = structuredClone(split);
                                next.days[di].exercises[xi].low = Number(e.target.value||8); setSplit(next);
                              }} />
                              <input className="input w-16" value={x.high} onChange={(e)=>{
                                const next = structuredClone(split);
                                next.days[di].exercises[xi].high = Number(e.target.value||12); setSplit(next);
                              }} />
                              {xi > 0 && (
                                <label className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={!!x.ss}
                                    onChange={(e) => {
                                      const next = structuredClone(split);
                                      const prev = next.days[di].exercises[xi-1];
                                      if (e.target.checked) {
                                        const id = prev.ss || uid();
                                        prev.ss = id;
                                        next.days[di].exercises[xi].ss = id;
                                      } else {
                                        next.days[di].exercises[xi].ss = "";
                                      }
                                      setSplit(next);
                                    }}
                                  />
                                  Link to previous (superset)
                                </label>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Importer modal */}
            {showImporter && (
              <div className="fixed inset-0 bg-black/60 grid place-items-center p-2 z-50">
                <div className="w-full max-w-5xl bg-neutral-950 border border-neutral-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Import split (AI)</h3>
                    <button className="btn" onClick={() => setShowImporter(false)}>Close</button>
                  </div>
                  <div className="mt-3">
                    <ImporterAI onConfirm={onImportConfirm} onCancel={() => setShowImporter(false)} />
                  </div>
                </div>
              </div>
            )}

            {/* Templates modal */}
            {showTemplates && (
              <div className="fixed inset-0 bg-black/60 grid place-items-center p-2 z-50">
                <div className="w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Templates</h3>
                    <button className="btn" onClick={() => setShowTemplates(false)}>Close</button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {TEMPLATES.map((t) => (
                      <div key={t.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold">{t.name}</div>
                            <div className="text-xs text-neutral-400">
                              {t.days.length} days • {t.days.reduce((a, d) => a + d.exercises.length, 0)} exercises
                            </div>
                          </div>
                          <button className="btn-primary" onClick={() => applyTemplate(t)}>Use this</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "sessions" && (
          <section className="grid gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Sessions</h2>
              <button className="btn" onClick={exportJSON}>Export JSON</button>
            </div>
            {!sessions.length ? (
              <div className="text-neutral-400">No sessions yet.</div>
            ) : (
              <div className="grid gap-3">
                {sessions.map((s, idx) => (
                  <div key={s.id || idx} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                    <div className="font-semibold">{s.dayName} — {s.date}</div>
                    {s.note ? <div className="mt-2 text-sm text-neutral-300 italic">“{s.note}”</div> : null}
                    <div className="mt-2 grid gap-1 text-sm">
                      {s.entries.map((e, i) => (
                        <div key={i} className="text-neutral-300">
                          <div className="font-medium">{e.name} {e.ss ? <span className="pill ml-2">Superset</span> : null}</div>
                          <div className="text-xs text-neutral-400">
                            {e.sets.map((x, xi) => (
                              <span key={xi} className="mr-2">
                                [{x.weight || "?"}{units} × {x.reps || "?"}{x.fail ? " F" : ""}{x.rir!=null?` r${x.rir}`:""}]
                              </span>
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

        {tab === "coach" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Coach</h2>
            <CoachChat units={units} />
          </section>
        )}
      </main>

      <footer className="mt-20 text-center text-xs text-neutral-500 pb-[90px] sm:pb-0">
        Offline-ready • Data syncs when online
      </footer>

      {/* AI Note modal */}
      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Coach note">
        <div className="whitespace-pre-wrap">{noteText || "No note."}</div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={() => setNoteOpen(false)}>Dismiss</button>
          <button className="btn-primary" onClick={attachNoteToLast}>Attach to latest session</button>
        </div>
      </Modal>
    </div>
  );
}
