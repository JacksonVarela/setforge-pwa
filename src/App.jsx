// src/App.jsx
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

// ---------- AI helpers that exist ----------
import { aiSuggestNext, aiCoachNote, aiDescribe, aiWarmupPlan, aiRest } from "./utils/ai";

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

// ---------- utility ----------
function uid() {
  return (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- templates (kept minimal here; you can expand) ----------
const TEMPLATES = [
  {
    id: "ul-rr",
    name: "Upper/Lower/Rest (repeat)",
    days: [
      { id: uid(), name: "Upper", exercises: [
        { name: "Bench Press", sets: 4, low: 5, high: 8, equip: "barbell", group: "push", cat: "compound" },
        { name: "Row (Machine)", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Overhead Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Lat Pulldown", sets: 3, low: 10, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
      ]},
      { id: uid(), name: "Lower", exercises: [
        { name: "Back Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
        { name: "Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
      ]},
      { id: uid(), name: "Rest / Active Recovery", exercises: [] }
    ]
  },
  {
    id: "ppl-6d",
    name: "PPL (6 days)",
    days: [
      { id: uid(), name: "Push A", exercises: [
        { name: "Barbell Bench Press", sets: 4, low: 5, high: 8, equip: "barbell", group: "push", cat: "compound" },
        { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
        { name: "Overhead Press (Smith)", sets: 3, low: 6, high: 10, equip: "smith", group: "push", cat: "compound" },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
      ]},
      { id: uid(), name: "Pull A", exercises: [
        { name: "Weighted Pull-up", sets: 4, low: 5, high: 8, equip: "bodyweight", group: "pull", cat: "compound" },
        { name: "Barbell Row", sets: 3, low: 6, high: 10, equip: "barbell", group: "pull", cat: "compound" },
        { name: "Lat Pulldown", sets: 3, low: 10, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "Face Pull", sets: 3, low: 12, high: 20, equip: "cable", group: "pull", cat: "isolation" },
      ]},
      { id: uid(), name: "Legs A", exercises: [
        { name: "Back Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
      ]},
      { id: uid(), name: "Push B", exercises: [
        { name: "Incline Bench Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Seated DB Shoulder Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
        { name: "Cable Lateral Raise", sets: 3, low: 12, high: 20, equip: "cable", group: "push", cat: "isolation" },
      ]},
      { id: uid(), name: "Pull B", exercises: [
        { name: "Deadlift (RPE 7)", sets: 3, low: 3, high: 5, equip: "barbell", group: "pull", cat: "compound" },
        { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        { name: "EZ Bar Curl", sets: 3, low: 8, high: 12, equip: "barbell", group: "pull", cat: "isolation" },
      ]},
      { id: uid(), name: "Legs B", exercises: [
        { name: "Front Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Hip Thrust", sets: 3, low: 8, high: 12, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Leg Extension", sets: 3, low: 12, high: 15, equip: "machine", group: "legs", cat: "isolation" },
      ]},
    ],
  },
  {
    id: "arnold-6d",
    name: "Arnold (C/B • S/A • Legs x2)",
    days: [
      { id: uid(), name: "Chest + Back", exercises: [
        { name: "Incline Bench Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Pull-up / Pulldown", sets: 4, low: 6, high: 10, equip: "machine", group: "pull", cat: "compound" },
        { name: "DB Fly", sets: 3, low: 10, high: 15, equip: "dumbbell", group: "push", cat: "isolation" },
        { name: "Barbell Row", sets: 3, low: 6, high: 10, equip: "barbell", group: "pull", cat: "compound" },
      ]},
      { id: uid(), name: "Shoulders + Arms", exercises: [
        { name: "Overhead Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Lateral Raise", sets: 4, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
        { name: "EZ Curl", sets: 3, low: 8, high: 12, equip: "barbell", group: "pull", cat: "isolation" },
        { name: "Cable Pushdown", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
      ]},
      { id: uid(), name: "Legs", exercises: [
        { name: "Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
        { name: "Standing Calf", sets: 4, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
      ]},
    ],
  },
  {
    id: "fb-3d",
    name: "Full Body (3 days)",
    days: [
      { id: uid(), name: "Full 1", exercises: [
        { name: "Squat", sets: 3, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Bench Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Pull-up", sets: 3, low: 6, high: 10, equip: "bodyweight", group: "pull", cat: "compound" },
      ]},
      { id: uid(), name: "Full 2", exercises: [
        { name: "Deadlift", sets: 2, low: 3, high: 5, equip: "barbell", group: "pull", cat: "compound" },
        { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
        { name: "Row (Machine)", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
      ]},
      { id: uid(), name: "Full 3", exercises: [
        { name: "Front Squat", sets: 3, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
        { name: "Overhead Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
        { name: "Lat Pulldown", sets: 3, low: 10, high: 12, equip: "machine", group: "pull", cat: "compound" },
      ]},
    ],
  },
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
          {mode === "signin" && <button className="btn-primary" onClick={doSignIn}>Sign in</button>}
          {mode === "signup" && <button className="btn-primary" onClick={doSignUp}>Create account</button>}
          <div className="text-xs text-neutral-400 text-center">Email verification required. We use Firebase Auth.</div>
        </div>

        <div className="mt-3 text-center">
          {mode === "signin" ? (
            <button className="btn" onClick={() => setMode("signup")}>No account? Sign up</button>
          ) : (
            <button className="btn" onClick={() => setMode("signin")}>Have an account? Sign in</button>
          )}
        </div>

        {!!error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        {mode === "verifySent" && <div className="mt-3 text-sm text-emerald-400">Verification email sent. Verify, then sign in again.</div>}
      </div>
    </div>
  );
}

// ---------- main app ----------
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  const [tab, setTab] = useLocalState("sf.tab", "log"); // "log" | "split" | "sessions" | "coach"
  const [units, setUnits] = useLocalState("sf.units", "lb"); // lb | kg

  // split and sessions
  const [split, setSplit] = useLocalState("sf.split", null); // {name, days[]}
  const [sessions, setSessions] = useLocalState("sf.sessions", []); // [{id,date,dayName,entries:[]}]
  const [work, setWork] = useLocalState("sf.work", null); // current in-progress session

  const [showImporter, setShowImporter] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // ---- Auth wiring ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // ---- mobile compact mode toggle (adds .compact to <body>) ----
  useEffect(() => {
    const apply = () => {
      const small = window.innerWidth <= 430;
      document.body.classList.toggle("compact", !!small);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  async function signOut() {
    try { await fbSignOut(auth); } catch {}
    window.location.replace(window.location.origin + window.location.pathname);
  }

  // ---- Defensive shape checks to avoid crashes on Log tab ----
  useEffect(() => {
    if (split && !Array.isArray(split?.days)) {
      console.warn("Invalid split shape, clearing.");
      setSplit(null);
    }
  }, [split, setSplit]);

  // ----- logging helpers -----
  function startWorkoutFor(dayIdx) {
    if (!split || !Array.isArray(split.days)) return;
    const day = split.days[dayIdx];
    if (!day) return;
    const entries = (day.exercises || []).map((ex) => {
      const sets = Array.from({ length: Number(ex.sets || 3) }, () => ({ weight: "", reps: "", fail: false }));
      return { name: ex.name || "Exercise", low: ex.low ?? 8, high: ex.high ?? 12, sets };
    });
    setWork({ id: uid(), date: todayISO(), dayName: day.name || `Day ${dayIdx+1}`, entries });
  }

  function saveWorkout() {
    if (!work || !Array.isArray(work?.entries)) return;
    setSessions([{ ...work }, ...sessions].slice(0, 200));
    setWork(null);
    alert("Session saved.");
  }

  function discardWorkout() {
    if (confirm("Discard current session?")) setWork(null);
  }

  // ---- split helpers ----
  function applyTemplate(t) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    const days = (t.days || []).map((d) => ({
      id: uid(),
      name: d.name || "DAY",
      exercises: (d.exercises || []).map((x) => ({ ...x })),
    }));
    setSplit({ name: t.name, days });
    setShowTemplates(false);
    setTab("log");
  }

  function onImportConfirm(payload) {
    if (!payload || !Array.isArray(payload?.days)) {
      alert("Import failed. Try a simpler paste or a different file.");
      return;
    }
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    setSplit({ name: payload.name || "Imported Split", days: payload.days });
    setShowImporter(false);
    setTab("log");
  }

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

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
        {/* LOG */}
        {tab === "log" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Log</h2>

            {!split || !Array.isArray(split.days) || split.days.length === 0 ? (
              <div className="text-neutral-400">
                Import a split first, then you can log your session here.
              </div>
            ) : !work ? (
              <div className="grid items-start gap-3 max-w-2xl">
                <div className="pill">Choose day to log</div>
                <div className="grid gap-2">
                  {split.days.map((d, i) => (
                    <button
                      key={d.id ?? i}
                      className="btn"
                      onClick={() => {
                        try {
                          startWorkoutFor(i);
                        } catch (e) {
                          console.error("startWorkoutFor error", e);
                          alert("Could not start session. Try another day or re-import your split.");
                        }
                      }}
                    >
                      Start — {d?.name ?? `Day ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 max-w-3xl">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{work?.dayName ?? "Session"} — {work?.date ?? todayISO()}</h3>
                  <div className="flex gap-2">
                    <button className="btn" onClick={discardWorkout}>Discard</button>
                    <button className="btn-primary" onClick={saveWorkout}>Save session</button>
                  </div>
                </div>

                <div className="grid gap-3">
                  {(work?.entries ?? []).map((e, ei) => (
                    <div key={ei} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold">
                        {e?.name ?? "Exercise"} <span className="text-neutral-400 text-sm">({e?.low ?? 8}–{e?.high ?? 12} reps)</span>
                      </div>

                      {/* Describe + Suggest + Warmup + Rest small actions */}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {/* Describe */}
                        <AsyncButton
                          label="Describe"
                          onClick={async () => {
                            const text = await aiDescribe({ name: e?.name || "" });
                            if (text) alert(text);
                          }}
                        />
                        {/* Suggest next */}
                        <AsyncButton
                          label="Suggest"
                          onClick={async () => {
                            const advice = await aiSuggestNext({ name: e?.name || "", units, history: [], targetLow: e?.low ?? 8, targetHigh: e?.high ?? 12 });
                            if (advice?.next?.note) alert(advice.next.note);
                          }}
                        />
                        {/* Warmup */}
                        <AsyncButton
                          label="Warm-up"
                          onClick={async () => {
                            const plan = await aiWarmupPlan({ name: e?.name || "", units });
                            if (plan?.text) alert(plan.text);
                          }}
                        />
                        {/* Rest */}
                        <AsyncButton
                          label="Rest"
                          onClick={async () => {
                            const r = await aiRest({ name: e?.name || "" });
                            if (r?.text) alert(r.text);
                          }}
                        />
                      </div>

                      <div className="mt-2 grid gap-2">
                        {(e?.sets ?? []).map((s, si) => (
                          <div key={si} className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400 w-10">Set {si + 1}</span>
                            <input
                              className="input w-24"
                              placeholder={`wt (${units})`}
                              value={s?.weight ?? ""}
                              onChange={(ev) => {
                                const next = structuredClone(work);
                                next.entries[ei].sets[si].weight = ev.target.value;
                                setWork(next);
                              }}
                            />
                            <input
                              className="input w-20"
                              placeholder="reps"
                              value={s?.reps ?? ""}
                              onChange={(ev) => {
                                const next = structuredClone(work);
                                next.entries[ei].sets[si].reps = ev.target.value;
                                setWork(next);
                              }}
                            />
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={!!s?.fail}
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

        {/* SPLIT */}
        {tab === "split" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Split</h2>

            <div className="flex gap-2">
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
                  {(split.days || []).map((d, di) => (
                    <div key={d.id ?? di} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold">{d?.name ?? `Day ${di+1}`}</div>
                      <ul className="mt-1 text-sm text-neutral-300 list-disc pl-5">
                        {(d.exercises || []).map((x, xi) => (
                          <li key={xi}>
                            {x?.name ?? "Exercise"} — {x?.sets ?? 3} × {x?.low ?? 8}–{x?.high ?? 12}
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
                              {(t.days || []).length} days • {(t.days || []).reduce((a, d) => a + (d.exercises?.length || 0), 0)} exercises
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

        {/* SESSIONS */}
        {tab === "sessions" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Sessions</h2>
            {!Array.isArray(sessions) || !sessions.length ? (
              <div className="text-neutral-400">No sessions yet.</div>
            ) : (
              <div className="grid gap-3">
                {(sessions || []).map((s, si) => (
                  <div key={s?.id ?? si} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                    <div className="font-semibold">{s?.dayName ?? "Session"} — {s?.date ?? ""}</div>
                    <div className="mt-2 grid gap-1 text-sm">
                      {(s?.entries || []).map((e, i) => (
                        <div key={i} className="text-neutral-300">
                          <div className="font-medium">{e?.name ?? "Exercise"}</div>
                          <div className="text-xs text-neutral-400">
                            {(e?.sets || []).map((x, xi) => (
                              <span key={xi} className="mr-2">
                                [{(x?.weight ?? "?")}{units} × {(x?.reps ?? "?")}{x?.fail ? " F" : ""}]
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

        {/* COACH */}
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

/** Small reusable async button with spinner */
function AsyncButton({ label, onClick }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try { await onClick?.(); }
        catch (e) { console.error(label, e); alert(`${label} failed.`); }
        finally { setBusy(false); }
      }}
    >
      {busy ? <span className="spinner" /> : label}
    </button>
  );
}
