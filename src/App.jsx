// src/App.jsx
import React, { useEffect, useState } from "react";
import { auth } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as fbSignOut,
} from "firebase/auth";

import ImporterAI from "./components/ImporterAI";
import CoachChat from "./components/CoachChat";

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

// ---------- templates (expanded) ----------
const TEMPLATES = [
  {
    id: "ul-4d",
    name: "Upper / Lower (4 days)",
    days: [
      { id: "u1", name: "Upper 1", exercises: [
        { name: "Bench Press", sets: 4, low: 5, high: 8, equip: "barbell", group: "push", cat: "compound" },
        { name: "Row (Machine)", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Overhead Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Lat Pulldown", sets: 3, low: 10, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
        { name: "Cable Curl", sets: 3, low: 10, high: 15, equip: "cable", group: "pull", cat: "isolation" },
      ]},
      { id: "l1", name: "Lower 1", exercises: [
        { name: "Back Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
        { name: "Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
      ]},
      { id: "u2", name: "Upper 2", exercises: [
        { name: "Incline DB Press", sets: 4, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
        { name: "Chest Supported Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Seated OHP (Smith)", sets: 3, low: 8, high: 12, equip: "smith", group: "push", cat: "compound" },
        { name: "Pulldown (neutral)", sets: 3, low: 10, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Face Pull", sets: 3, low: 12, high: 20, equip: "cable", group: "pull", cat: "isolation" },
        { name: "Triceps Pushdown", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
      ]},
      { id: "l2", name: "Lower 2", exercises: [
        { name: "Front Squat", sets: 3, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Hip Thrust", sets: 3, low: 8, high: 12, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Leg Extension", sets: 3, low: 12, high: 15, equip: "machine", group: "legs", cat: "isolation" },
        { name: "Seated Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
        { name: "Cable Crunch", sets: 3, low: 10, high: 15, equip: "cable", group: "core", cat: "isolation" },
      ]},
    ],
  },
  {
    id: "ppl-6d",
    name: "PPL (6 days, high-volume)",
    days: [
      { id: "p1", name: "Push A", exercises: [
        { name: "Bench Press", sets: 3, low: 5, high: 8, equip: "barbell", group: "push", cat: "compound" },
        { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
        { name: "Overhead Press (Smith)", sets: 2, low: 6, high: 10, equip: "smith", group: "push", cat: "compound" },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
      ]},
      { id: "p2", name: "Pull A", exercises: [
        { name: "Weighted Pull-ups", sets: 3, low: 5, high: 8, equip: "bodyweight", group: "pull", cat: "compound" },
        { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Cable Row", sets: 2, low: 10, high: 12, equip: "cable", group: "pull", cat: "compound" },
        { name: "Cable Curl", sets: 2, low: 10, high: 15, equip: "cable", group: "pull", cat: "isolation" },
      ]},
      { id: "p3", name: "Legs A", exercises: [
        { name: "Back Squat", sets: 3, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Leg Press", sets: 2, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
        { name: "Calf Raise", sets: 2, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
      ]},
      { id: "p4", name: "Push B", exercises: [
        { name: "Incline Barbell Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Dips (Weighted if strong)", sets: 3, low: 6, high: 10, equip: "bodyweight", group: "push", cat: "compound" },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
      ]},
      { id: "p5", name: "Pull B", exercises: [
        { name: "Barbell Row", sets: 3, low: 6, high: 10, equip: "barbell", group: "pull", cat: "compound" },
        { name: "Lat Pulldown", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Face Pull", sets: 2, low: 12, high: 20, equip: "cable", group: "pull", cat: "isolation" },
      ]},
      { id: "p6", name: "Legs B", exercises: [
        { name: "Front Squat or Hack", sets: 3, low: 6, high: 10, equip: "machine", group: "legs", cat: "compound" },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
        { name: "Calf Raise", sets: 2, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
      ]},
    ],
  },
  {
    id: "fb-3d",
    name: "Full Body (3 days)",
    days: [
      { id: "f1", name: "Full 1", exercises: [
        { name: "Squat", sets: 3, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Bench Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Pull-up", sets: 3, low: 6, high: 10, equip: "bodyweight", group: "pull", cat: "compound" },
        { name: "Hip Thrust", sets: 3, low: 8, high: 12, equip: "barbell", group: "legs", cat: "compound" },
      ]},
      { id: "f2", name: "Full 2", exercises: [
        { name: "Deadlift", sets: 2, low: 3, high: 5, equip: "barbell", group: "pull", cat: "compound" },
        { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
        { name: "Row (Machine)", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
      ]},
      { id: "f3", name: "Full 3", exercises: [
        { name: "Front Squat", sets: 3, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Overhead Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Lat Pulldown", sets: 3, low: 10, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Curl + Pushdown (superset)", sets: 3, low: 10, high: 15, equip: "cable", group: "arms", cat: "isolation" },
      ]},
    ],
  },
  {
    id: "arnold-6d",
    name: "Arnold (Chest/Back • Shoulders/Arms • Legs, repeat)",
    days: [
        { id: "a1", name: "Chest + Back", exercises: [
          { name: "Incline Bench Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Pull-up / Pulldown", sets: 4, low: 6, high: 10, equip: "machine", group: "pull", cat: "compound" },
          { name: "DB Fly", sets: 3, low: 10, high: 15, equip: "dumbbell", group: "push", cat: "isolation" },
          { name: "Barbell Row", sets: 3, low: 6, high: 10, equip: "barbell", group: "pull", cat: "compound" },
        ]},
        { id: "a2", name: "Shoulders + Arms", exercises: [
          { name: "Overhead Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Lateral Raise", sets: 4, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
          { name: "EZ Curl", sets: 3, low: 8, high: 12, equip: "barbell", group: "pull", cat: "isolation" },
          { name: "Cable Pushdown", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
        ]},
        { id: "a3", name: "Legs", exercises: [
          { name: "Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
          { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
          { name: "Standing Calf", sets: 4, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
        ]},
    ],
  },
];

// ---------- small helpers ----------
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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
          {mode === "signin" ? (
            <button className="btn-primary" onClick={doSignIn}>Sign in</button>
          ) : (
            <button className="btn-primary" onClick={doSignUp}>Create account</button>
          )}
          <div className="text-xs text-neutral-400 text-center">Email verification required. We use Firebase Auth free tier.</div>
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

// ---------- main app ----------
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  // app state
  const [tab, setTab] = useLocalState("sf.tab", "log"); // "log" | "split" | "sessions" | "coach"
  const [units, setUnits] = useLocalState("sf.units", "lb"); // lb | kg
  const [split, setSplit] = useLocalState("sf.split", null); // {name, days[]}
  const [sessions, setSessions] = useLocalState("sf.sessions", []); // saved sessions
  const [work, setWork] = useLocalState("sf.work", null); // current in-progress workout session
  const [showImporter, setShowImporter] = useState(false);

  // ----- auth wiring -----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  async function signOut() {
    try { await fbSignOut(auth); } catch {}
    window.location.replace(window.location.origin + window.location.pathname);
  }

  // Build history for an exercise name from saved sessions (last ~18 sets)
  const buildHistory = (name) => {
    const hist = [];
    for (const s of sessions) {
      for (const e of s.entries || []) {
        if (e.name === name) {
          for (const set of e.sets || []) {
            const w = Number(set.weight);
            const r = Number(set.reps);
            if (!Number.isFinite(w) || !Number.isFinite(r)) continue;
            hist.push({ date: s.date, weight: w, reps: r, fail: !!set.fail });
          }
        }
      }
    }
    return hist.slice(-18).reverse();
  };

  // ----- logging helpers -----
  function startWorkoutFor(dayIdx) {
    if (!split) return;
    const day = split.days[dayIdx];
    const entries = day.exercises.map((ex) => ({
      name: ex.name,
      low: ex.low || 8,
      high: ex.high || 12,
      supersetWith: null,
      desc: "", descBusy: false,
      suggestBusy: false, suggestOut: null, suggestErr: "",
      warmupBusy: false, warmupOut: null, warmupErr: "",
      restBusy: false, restSec: null, restErr: "",
      sets: Array.from({ length: ex.sets || 3 }, () => ({
        weight: "",
        reps: "",
        rir: "",
        fail: false,
        drops: [],
      })),
    }));
    setWork({ id: uid(), date: todayISO(), dayName: day.name, entries });
  }

  function saveWorkout() {
    if (!work) return;
    setSessions([{ ...work }, ...sessions].slice(0, 100));
    setWork(null);
    alert("Session saved.");
  }

  function discardWorkout() {
    if (confirm("Discard current session?")) setWork(null);
  }

  function toggleSuperset(ei) {
    if (!work) return;
    const next = structuredClone(work);
    if (ei <= 0) return;
    const a = next.entries[ei];
    const b = next.entries[ei - 1];
    const linked = a.supersetWith === b.name && b.supersetWith === a.name;
    a.supersetWith = linked ? null : b.name;
    b.supersetWith = linked ? null : a.name;
    setWork(next);
  }

  function addDropSet(ei, si) {
    const next = structuredClone(work);
    next.entries[ei].sets[si].drops.push({ weight: "", reps: "", rir: "", fail: false });
    setWork(next);
  }
  function removeDropSet(ei, si, di) {
    const next = structuredClone(work);
    next.entries[ei].sets[si].drops.splice(di, 1);
    setWork(next);
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
    setTab("log");
  }

  function onImportConfirm(payload) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    setSplit(payload);
    setShowImporter(false);
    setTab("log");
  }

  if (!authReady) return <div className="min-h-screen grid place-items-center text-neutral-400">Loading…</div>;
  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] safe-px safe-pt safe-pb">
      {/* top bar */}
      <header className="flex items-center gap-3 justify-between py-3">
        <div className="text-2xl font-extrabold">SetForge</div>

        <nav className="flex gap-2">
          {["log", "split", "sessions", "coach"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "px-4 py-2 rounded-xl border " +
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
                    <button key={d.id} className="btn" onClick={() => startWorkoutFor(i)}>
                      Start — {d.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 max-w-3xl">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{work.dayName} — {work.date}</h3>
                  <div className="flex gap-2">
                    <button className="btn" onClick={discardWorkout}>Discard</button>
                    <button className="btn-primary" onClick={saveWorkout}>Save session</button>
                  </div>
                </div>

                <div className="grid gap-3">
                  {work.entries.map((e, ei) => {
                    const isSuperset = e.supersetWith != null;
                    const history = buildHistory(e.name); // ✅ fixed: no hooks in loops

                    return (
                      <div key={ei} className={"rounded-xl border p-3 bg-neutral-900 " + (isSuperset ? "border-red-600/50" : "border-neutral-800")}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">
                              {e.name}{" "}
                              <span className="text-neutral-400 text-sm">({e.low}–{e.high} reps)</span>
                              {isSuperset && (
                                <span className="ml-2 text-xs text-red-400 border border-red-700 px-2 py-0.5 rounded-full">
                                  Superset with {e.supersetWith}
                                </span>
                              )}
                            </div>

                            {/* Rest hint line */}
                            <div className="text-xs text-neutral-400 mt-1">
                              Rest: {e.restBusy ? "calculating…" : (e.restSec ? `${Math.round(e.restSec)}s` : "—")}
                              <button
                                title="Recalculate rest"
                                className="ml-2 underline decoration-dotted"
                                onClick={async () => {
                                  const next = structuredClone(work);
                                  next.entries[ei].restBusy = true; next.entries[ei].restErr = "";
                                  setWork(next);
                                  try {
                                    const last = e.sets.slice().reverse().find(s => s.reps || s.rir || s.fail || s.weight);
                                    const payload = {
                                      name: e.name,
                                      reps: Number(last?.reps || e.low),
                                      rir: typeof last?.rir === "string" && last?.rir !== "" ? Number(last.rir) : (last?.fail ? 0 : 2),
                                      isCompound: /squat|deadlift|bench|press|row|pull/i.test(e.name),
                                    };
                                    const r = await fetch("/api/rest", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
                                    const j = await r.json();
                                    const out = Number(j?.seconds || 0);
                                    const n2 = structuredClone(next);
                                    n2.entries[ei].restSec = Number.isFinite(out) && out > 0 ? out : 90;
                                    n2.entries[ei].restBusy = false;
                                    setWork(n2);
                                  } catch {
                                    const n2 = structuredClone(next);
                                    n2.entries[ei].restBusy = false;
                                    n2.entries[ei].restErr = "rest calc failed";
                                    setWork(n2);
                                  }
                                }}
                              >
                                ↻
                              </button>
                              {e.restErr && <span className="ml-2 text-red-400">{e.restErr}</span>}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button className="btn" onClick={() => toggleSuperset(ei)}>
                              {isSuperset ? "Unlink superset" : "Superset with previous"}
                            </button>

                            {/* Describe (AI) */}
                            <button
                              className="btn"
                              onClick={async () => {
                                const next = structuredClone(work);
                                next.entries[ei].descBusy = true;
                                setWork(next);
                                try {
                                  const r = await fetch("/api/describe", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: e.name, equip: "", cat: "iso_small" })
                                  });
                                  const j = await r.json();
                                  const text = j?.text || "No description available.";
                                  const n2 = structuredClone(next);
                                  n2.entries[ei].desc = text;
                                  n2.entries[ei].descBusy = false;
                                  setWork(n2);
                                } catch {
                                  const n2 = structuredClone(next);
                                  n2.entries[ei].desc = "Could not fetch description.";
                                  n2.entries[ei].descBusy = false;
                                  setWork(n2);
                                }
                              }}
                            >
                              {e.descBusy ? "Describing…" : "Describe"}
                            </button>

                            {/* Suggest (AI) */}
                            <button
                              className="btn"
                              onClick={async () => {
                                const next = structuredClone(work);
                                next.entries[ei].suggestBusy = true; next.entries[ei].suggestErr = "";
                                setWork(next);
                                try {
                                  const failureFlags = (history || []).map(h => !!h.fail);
                                  const body = {
                                    name: e.name,
                                    history,
                                    targetLow: e.low,
                                    targetHigh: e.high,
                                    units,
                                    bodyweight: /pull-up|chin-up|dip|push-up|handstand/i.test(e.name),
                                    failureFlags
                                  };
                                  const r = await fetch("/api/suggest", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
                                  const j = await r.json();
                                  const out = j?.next || j || null;
                                  const n2 = structuredClone(next);
                                  n2.entries[ei].suggestOut = out;
                                  n2.entries[ei].suggestBusy = false;
                                  setWork(n2);
                                } catch {
                                  const n2 = structuredClone(next);
                                  n2.entries[ei].suggestBusy = false;
                                  n2.entries[ei].suggestErr = "suggest failed";
                                  setWork(n2);
                                }
                              }}
                            >
                              {e.suggestBusy ? "Suggesting…" : "Suggest"}
                            </button>

                            {/* Warm-up (AI) */}
                            <button
                              className="btn"
                              onClick={async () => {
                                const next = structuredClone(work);
                                next.entries[ei].warmupBusy = true; next.entries[ei].warmupErr = "";
                                setWork(next);
                                try {
                                  const target =
                                    Number(e.suggestOut?.weight) ||
                                    Number((history && history.find(h => Number.isFinite(h.weight)))?.weight) ||
                                    0;
                                  const r = await fetch("/api/warmup", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: e.name, units, target })
                                  });
                                  const j = await r.json();
                                  const n2 = structuredClone(next);
                                  n2.entries[ei].warmupOut = j || null;
                                  n2.entries[ei].warmupBusy = false;
                                  setWork(n2);
                                } catch {
                                  const n2 = structuredClone(next);
                                  n2.entries[ei].warmupBusy = false;
                                  n2.entries[ei].warmupErr = "warm-up failed";
                                  setWork(n2);
                                }
                              }}
                            >
                              {e.warmupBusy ? "Planning…" : "Warm-up"}
                            </button>
                          </div>
                        </div>

                        {e.desc && (
                          <div className="mt-2 text-sm text-neutral-300 rounded-lg border border-neutral-800 p-2 bg-neutral-950">
                            {e.desc}
                          </div>
                        )}

                        {e.suggestOut && (
                          <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-sm">
                            <div className="font-medium">Suggested next set</div>
                            <div className="text-neutral-300 mt-1">
                              {typeof e.suggestOut.weight === "number" ? `${e.suggestOut.weight}${units}` : "—"}{" "}
                              {typeof e.suggestOut.reps === "number" ? `× ${e.suggestOut.reps}` : ""}
                            </div>
                            {e.suggestOut.note && (
                              <div className="text-neutral-400 text-xs mt-1">{e.suggestOut.note}</div>
                            )}
                            <div className="mt-2 flex gap-2">
                              <button
                                className="btn"
                                onClick={() => {
                                  const next = structuredClone(work);
                                  const row = next.entries[ei].sets.find(s => !s.weight && !s.reps);
                                  if (row) {
                                    if (typeof e.suggestOut.weight === "number") row.weight = String(e.suggestOut.weight);
                                    if (typeof e.suggestOut.reps === "number") row.reps = String(e.suggestOut.reps);
                                  }
                                  setWork(next);
                                }}
                              >
                                Apply to next empty set
                              </button>
                              <button
                                className="btn"
                                onClick={() => {
                                  const next = structuredClone(work);
                                  next.entries[ei].suggestOut = null;
                                  setWork(next);
                                }}
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        )}
                        {e.suggestErr && <div className="mt-2 text-xs text-red-400">{e.suggestErr}</div>}

                        {e.warmupOut && (
                          <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-sm">
                            <div className="font-medium">Warm-up plan</div>
                            <ol className="list-decimal pl-5 mt-1 text-neutral-300">
                              {(e.warmupOut.steps || []).map((st, idx) => (
                                <li key={idx}>
                                  {st.percent ? `${Math.round(st.percent*100)}%` : ""}
                                  {st.weight ? ` • ${st.weight}${units}` : ""}
                                  {st.reps ? ` × ${st.reps}` : ""}
                                  {st.note ? ` — ${st.note}` : ""}
                                </li>
                              ))}
                            </ol>
                            {!e.warmupOut.steps?.length && (
                              <div className="text-neutral-400">No warm-up steps returned.</div>
                            )}
                          </div>
                        )}
                        {e.warmupErr && <div className="mt-2 text-xs text-red-400">{e.warmupErr}</div>}

                        {/* Sets */}
                        <div className="mt-2 grid gap-2">
                          {e.sets.map((s, si) => (
                            <div key={si} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-neutral-400 w-10 shrink-0">Set {si + 1}</span>

                                <input
                                  className="input w-[84px]"
                                  inputMode="decimal"
                                  placeholder={`wt (${units})`}
                                  value={s.weight}
                                  onChange={(ev) => {
                                    const next = structuredClone(work);
                                    next.entries[ei].sets[si].weight = ev.target.value;
                                    setWork(next);
                                  }}
                                />

                                <span className="text-neutral-500 select-none">×</span>

                                <input
                                  className="input w-[64px]"
                                  inputMode="numeric"
                                  placeholder="reps"
                                  value={s.reps}
                                  onChange={(ev) => {
                                    const next = structuredClone(work);
                                    next.entries[ei].sets[si].reps = ev.target.value;
                                    setWork(next);
                                  }}
                                />

                                <span className="text-neutral-500 select-none">×</span>

                                <input
                                  className="input w-[64px]"
                                  inputMode="numeric"
                                  placeholder="RIR"
                                  value={s.rir}
                                  onChange={(ev) => {
                                    const raw = ev.target.value.trim();
                                    const next = structuredClone(work);
                                    next.entries[ei].sets[si].rir = raw;
                                    if (raw === "0" || raw === 0) {
                                      next.entries[ei].sets[si].fail = true;
                                    } else if (next.entries[ei].sets[si].fail && raw !== "") {
                                      next.entries[ei].sets[si].fail = false;
                                    }
                                    setWork(next);
                                  }}
                                />

                                <label className="flex items-center gap-1 text-xs ml-1">
                                  <input
                                    type="checkbox"
                                    checked={!!s.fail}
                                    onChange={(ev) => {
                                      const next = structuredClone(work);
                                      next.entries[ei].sets[si].fail = ev.target.checked;
                                      if (ev.target.checked) {
                                        next.entries[ei].sets[si].rir = "0";
                                      } else if (next.entries[ei].sets[si].rir === "0") {
                                        next.entries[ei].sets[si].rir = "";
                                      }
                                      setWork(next);
                                    }}
                                  />
                                  failure
                                </label>

                                <button className="btn ml-auto" onClick={() => addDropSet(ei, si)}>+ Drop set</button>
                              </div>

                              {!!s.drops?.length && (
                                <div className="mt-2 grid gap-1">
                                  {s.drops.map((d, di) => (
                                    <div key={di} className="flex items-center gap-2">
                                      <span className="text-[11px] text-neutral-400 w-10 shrink-0">DS {di + 1}</span>

                                      <input
                                        className="input w-[84px]"
                                        inputMode="decimal"
                                        placeholder={`wt (${units})`}
                                        value={d.weight}
                                        onChange={(ev) => {
                                          const next = structuredClone(work);
                                          next.entries[ei].sets[si].drops[di].weight = ev.target.value;
                                          setWork(next);
                                        }}
                                      />
                                      <span className="text-neutral-500 select-none">×</span>
                                      <input
                                        className="input w-[64px]"
                                        inputMode="numeric"
                                        placeholder="reps"
                                        value={d.reps}
                                        onChange={(ev) => {
                                          const next = structuredClone(work);
                                          next.entries[ei].sets[si].drops[di].reps = ev.target.value;
                                          setWork(next);
                                        }}
                                      />
                                      <span className="text-neutral-500 select-none">×</span>
                                      <input
                                        className="input w-[64px]"
                                        inputMode="numeric"
                                        placeholder="RIR"
                                        value={d.rir}
                                        onChange={(ev) => {
                                          const raw = ev.target.value.trim();
                                          const next = structuredClone(work);
                                          next.entries[ei].sets[si].drops[di].rir = raw;
                                          if (raw === "0" || raw === 0) {
                                            next.entries[ei].sets[si].drops[di].fail = true;
                                          } else if (next.entries[ei].sets[si].drops[di].fail && raw !== "") {
                                            next.entries[ei].sets[si].drops[di].fail = false;
                                          }
                                          setWork(next);
                                        }}
                                      />
                                      <label className="flex items-center gap-1 text-[11px] ml-1">
                                        <input
                                          type="checkbox"
                                          checked={!!d.fail}
                                          onChange={(ev) => {
                                            const next = structuredClone(work);
                                            next.entries[ei].sets[si].drops[di].fail = ev.target.checked;
                                            if (ev.target.checked) {
                                              next.entries[ei].sets[si].drops[di].rir = "0";
                                            } else if (next.entries[ei].sets[si].drops[di].rir === "0") {
                                              next.entries[ei].sets[si].drops[di].rir = "";
                                            }
                                            setWork(next);
                                          }}
                                        />
                                        failure
                                      </label>
                                      <button className="btn" onClick={() => removeDropSet(ei, si, di)}>Remove</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "split" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Split</h2>

            <div className="flex gap-2 flex-wrap">
              <button className="btn" onClick={() => setShowImporter(true)}>+ Import (AI)</button>
              {TEMPLATES.map((t) => (
                <button key={t.id} className="btn" onClick={() => applyTemplate(t)}>
                  Use template — {t.name}
                </button>
              ))}
              {split && (
                <button
                  className="btn"
                  onClick={() => {
                    if (confirm("Clear your split?")) setSplit(null);
                  }}
                >
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
                  {split.days.map((d) => (
                    <div key={d.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold">{d.name}</div>
                      <ul className="mt-1 text-sm text-neutral-300 list-disc pl-5">
                        {d.exercises.map((x, xi) => (
                          <li key={xi}>
                            {x.name} — {x.sets} × {x.low}–{x.high}
                          </li>
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
                    <button className="btn" onClick={() => setShowImporter(false)}>Close</button>
                  </div>
                  <div className="mt-3">
                    <ImporterAI onConfirm={onImportConfirm} onCancel={() => setShowImporter(false)} />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "sessions" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Sessions</h2>
            {!sessions.length ? (
              <div className="text-neutral-400">No sessions yet.</div>
            ) : (
              <div className="grid gap-3">
                {sessions.map((s) => (
                  <div key={s.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                    <div className="font-semibold">{s.dayName} — {s.date}</div>
                    <div className="mt-2 grid gap-1 text-sm">
                      {s.entries.map((e, i) => (
                        <div key={i} className="text-neutral-300">
                          <div className="font-medium">{e.name}{e.supersetWith ? ` (superset with ${e.supersetWith})` : ""}</div>
                          <div className="text-xs text-neutral-400">
                            {e.sets.map((x, xi) => (
                              <span key={xi} className="mr-2 block">
                                Main: [{x.weight || "?"}{units} × {x.reps || "?"}{typeof x.rir === "string" && x.rir !== "" ? ` × RIR ${x.rir}` : ""}{x.fail ? " F" : ""}]
                                {x.drops?.map((d, di) => (
                                  <span key={di} className="ml-2">
                                    • DS {di+1}: [{d.weight || "?"}{units} × {d.reps || "?"}{typeof d.rir === "string" && d.rir !== "" ? ` × RIR ${d.rir}` : ""}{d.fail ? " F" : ""}]
                                  </span>
                                ))}
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

      <footer className="mt-8 text-center text-xs text-neutral-500">
        Works offline • Advice-only AI when online
      </footer>
    </div>
  );
}
