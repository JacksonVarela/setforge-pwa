import React, { useEffect, useMemo, useState } from "react";
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

// ---------- templates (science-forward defaults) ----------
const TEMPLATES = [
  {
    id: "ppl-6d",
    name: "Push / Pull / Legs (6 days)",
    days: [
      {
        id: "d1",
        name: "Push A",
        exercises: [
          { name: "Barbell Bench Press", sets: 4, low: 5, high: 8, equip: "barbell", group: "push", cat: "compound" },
          { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
          { name: "Cable Fly", sets: 3, low: 12, high: 15, equip: "cable", group: "push", cat: "isolation" },
          { name: "Overhead Press (Smith)", sets: 3, low: 6, high: 10, equip: "smith", group: "push", cat: "compound" },
          { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
          { name: "Triceps Rope Pushdown", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
        ],
      },
      {
        id: "d2",
        name: "Pull A",
        exercises: [
          { name: "Weighted Pull-up", sets: 4, low: 5, high: 8, equip: "bodyweight", group: "pull", cat: "compound" },
          { name: "Barbell Row", sets: 3, low: 6, high: 10, equip: "barbell", group: "pull", cat: "compound" },
          { name: "Lat Pulldown", sets: 3, low: 10, high: 12, equip: "machine", group: "pull", cat: "compound" },
          { name: "Cable Row", sets: 3, low: 10, high: 12, equip: "cable", group: "pull", cat: "compound" },
          { name: "Face Pull", sets: 3, low: 12, high: 20, equip: "cable", group: "pull", cat: "isolation" },
          { name: "DB Curl", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "pull", cat: "isolation" },
        ],
      },
      {
        id: "d3",
        name: "Legs A",
        exercises: [
          { name: "Back Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
          { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
          { name: "Standing Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
        ],
      },
      { id: "d4", name: "Push B", exercises: [
        { name: "Incline Bench Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Seated DB Shoulder Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
        { name: "Machine Chest Press", sets: 3, low: 10, high: 12, equip: "machine", group: "push", cat: "compound" },
        { name: "Cable Lateral Raise", sets: 3, low: 12, high: 20, equip: "cable", group: "push", cat: "isolation" },
        { name: "Overhead Rope Extension", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
      ]},
      { id: "d5", name: "Pull B", exercises: [
        { name: "Deadlift (RPE 7)", sets: 3, low: 3, high: 5, equip: "barbell", group: "pull", cat: "compound" },
        { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Single-arm Pulldown", sets: 3, low: 10, high: 15, equip: "cable", group: "pull", cat: "compound" },
        { name: "Reverse Pec Deck", sets: 3, low: 12, high: 20, equip: "machine", group: "pull", cat: "isolation" },
        { name: "EZ Bar Curl", sets: 3, low: 8, high: 12, equip: "barbell", group: "pull", cat: "isolation" },
      ]},
      { id: "d6", name: "Legs B", exercises: [
        { name: "Front Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Hip Thrust", sets: 3, low: 8, high: 12, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Leg Extension", sets: 3, low: 12, high: 15, equip: "machine", group: "legs", cat: "isolation" },
        { name: "Seated Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
        { name: "Hanging Leg Raise", sets: 3, low: 10, high: 15, equip: "bodyweight", group: "core", cat: "isolation" },
      ]},
    ],
  },
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
      {/* coach sticker, bottom-right, login only */}
      <div className="coach-sticker" aria-hidden />

      <div className="w-[96%] max-w-md glass-strong p-5">
        <h1 className="text-3xl font-extrabold text-center">SetForge</h1>
        <p className="text-center text-neutral-400">Sign in to get started</p>

        <div className="mt-4 grid gap-2">
          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
          <input
            className="input"
            placeholder="Password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
          />
          {mode === "signin" && (
            <button className="btn-primary" onClick={doSignIn}>Sign in</button>
          )}
          {mode === "signup" && (
            <button className="btn-primary" onClick={doSignUp}>Create account</button>
          )}
          <div className="text-xs text-neutral-400 text-center">
            Email verification required. We use Firebase Auth free tier.
          </div>
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
          <div className="mt-3 text-sm text-emerald-400">
            Verification email sent. Verify, then sign in again.
          </div>
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
  const [sessions, setSessions] = useLocalState("sf.sessions", []); // [{id,date,dayName,entries:[]}]

  // import modals
  const [showImporter, setShowImporter] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // logger scratch state
  const [logDayIndex, setLogDayIndex] = useLocalState("sf.logDayIndex", 0);
  const [work, setWork] = useLocalState("sf.work", null); // the current in-progress workout session

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
    // hard reload to clear any UI residue
    window.location.replace(window.location.origin + window.location.pathname);
  }

  // ----- logging helpers -----
  function startWorkoutFor(dayIdx) {
    if (!split) return;
    const day = split.days[dayIdx];
    const entries = [];
    day.exercises.forEach((ex) => {
      const sets = Array.from({ length: ex.sets || 3 }, () => ({
        weight: "",
        reps: "",
        fail: false,
      }));
      entries.push({ name: ex.name, low: ex.low || 8, high: ex.high || 12, sets });
    });
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

  // ----- split helpers -----
  function applyTemplate(t) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    // give fresh ids
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
    // { name, days[] } shape from ImporterAI
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    setSplit(payload);
    setShowImporter(false);
    setTab("log");
  }

  // --------------------------------------------------
  // RENDER BRANCHES
  // --------------------------------------------------

  if (!authReady) {
    return <div className="min-h-screen grid place-items-center text-neutral-400">Loading…</div>;
  }

  if (!user) {
    return <LoginScreen />;
  }

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
            <button
              onClick={() => setUnits("lb")}
              className={"px-2 py-1 rounded " + (units === "lb" ? "bg-neutral-700" : "")}
            >
              lb
            </button>
            <button
              onClick={() => setUnits("kg")}
              className={"px-2 py-1 rounded " + (units === "kg" ? "bg-neutral-700" : "")}
            >
              kg
            </button>
          </div>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="mt-2">
        {tab === "log" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Log</h2>

            {!split ? (
              <div className="text-neutral-400">
                Import a split first, then you can log your session here.
              </div>
            ) : !work ? (
              <div className="grid items-start gap-3 max-w-2xl">
                <div className="pill">Choose day to log</div>
                <div className="grid gap-2">
                  {split.days.map((d, i) => (
                    <button
                      key={d.id}
                      className="btn"
                      onClick={() => {
                        setLogDayIndex(i);
                        startWorkoutFor(i);
                      }}
                    >
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
                  {work.entries.map((e, ei) => (
                    <div key={ei} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold">{e.name} <span className="text-neutral-400 text-sm">({e.low}–{e.high} reps)</span></div>
                      <div className="mt-2 grid gap-2">
                        {e.sets.map((s, si) => (
                          <div key={si} className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400 w-10">Set {si + 1}</span>
                            <input
                              className="input w-24"
                              placeholder={`wt (${units})`}
                              value={s.weight}
                              onChange={(ev) => {
                                const next = structuredClone(work);
                                next.entries[ei].sets[si].weight = ev.target.value;
                                setWork(next);
                              }}
                            />
                            <input
                              className="input w-20"
                              placeholder="reps"
                              value={s.reps}
                              onChange={(ev) => {
                                const next = structuredClone(work);
                                next.entries[ei].sets[si].reps = ev.target.value;
                                setWork(next);
                              }}
                            />
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={s.fail}
                                onChange={(ev) => {
                                  const next = structuredClone(work);
                                  next.entries[ei].sets[si].fail = ev.target.checked;
                                  setWork(next);
                                }}
                              />
                              to failure
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "split" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Split</h2>

            <div className="flex gap-2">
              <button className="btn" onClick={() => setShowImporter(true)}>+ Import (AI)</button>
              <button className="btn" onClick={() => setShowTemplates(true)}>Templates</button>
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
                    {/* Tip: to extend ImporterAI to accept file uploads, add a file input there and read as text. */}
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
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-neutral-400">
                            {e.sets.map((x, xi) => (
                              <span key={xi} className="mr-2">
                                [{x.weight || "?"}{units} × {x.reps || "?"}{x.fail ? " F" : ""}]
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
            {/* CoachChat uses your /api/coach-chat route; it already shows thought bubbles */}
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
