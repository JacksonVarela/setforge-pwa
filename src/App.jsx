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
import { aiSuggestNext, aiCoachNote } from "./utils/ai";

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
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

// ---------- templates (science-forward defaults) ----------
const TEMPLATES = [
  // ... keep your existing templates unchanged ...
  // I did not edit these
];

// ---------- small helpers ----------
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

// ---------- login screen ----------
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState("signin");
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
          <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          <input className="input" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} type="password" />
          {mode === "signin" && (<button className="btn-primary" onClick={doSignIn}>Sign in</button>)}
          {mode === "signup" && (<button className="btn-primary" onClick={doSignUp}>Create account</button>)}
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
        {mode === "verifySent" && <div className="mt-3 text-sm text-emerald-400">Verification email sent. Verify, then sign in again.</div>}
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

  const [showImporter, setShowImporter] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const [logDayIndex, setLogDayIndex] = useLocalState("sf.logDayIndex", 0);
  const [work, setWork] = useLocalState("sf.work", null);

  // coach note after save
  const [coachNote, setCoachNote] = useState("");
  const [showCoachNote, setShowCoachNote] = useState(false);

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

  // ----- logging helpers -----
  function startWorkoutFor(dayIdx) {
    if (!split) return;
    const day = split.days[dayIdx];
    const entries = [];
    day.exercises.forEach((ex) => {
      const sets = Array.from({ length: ex.sets || 3 }, () => ({ weight: "", reps: "", fail: false }));
      entries.push({
        name: ex.name,
        low: ex.low || 8,
        high: ex.high || 12,
        equip: ex.equip || "machine",
        sets,
        suggest: null,
        showWhy: false
      });
    });
    setWork({ id: uid(), date: todayISO(), dayName: day.name, entries });
  }

  async function saveWorkout() {
    if (!work) return;
    const sessionToSave = { ...work };
    setSessions([sessionToSave, ...sessions].slice(0, 100));
    setWork(null);

    // Pull a concise coach note and show it in a modal
    try {
      const recent = sessions.slice(0, 5);
      const note = await aiCoachNote(sessionToSave, recent, units, sessionToSave.dayName);
      if (note) {
        setCoachNote(note);
        setShowCoachNote(true);
      }
    } catch {
      // ignore
    }
  }

  function discardWorkout() {
    if (confirm("Discard current session?")) setWork(null);
  }

  // ----- split helpers -----
  function applyTemplate(t) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    const days = t.days.map((d) => ({
      id: uid(),
      name: d.name,
      exercises: d.exercises.map((x) => ({ ...x })),
    }));
    setSplit({ name: t.name, days });
    setShowTemplates(false);
    setTab("log");
  }
  function onImportConfirm(payload) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    setSplit(payload);
    setShowImporter(false);
    setTab("log");
  }

  // ----- suggest helper -----
  async function suggestFor(eIdx) {
    if (!work) return;
    const entry = work.entries[eIdx];
    try {
      // gather last three histories for this exact exercise name
      const hist = [];
      for (const s of sessions) {
        const match = (s.entries || []).find(en => en.name === entry.name);
        if (match) {
          hist.push({
            date: s.date,
            sets: (match.sets || []).map(x => ({
              weight: Number(x.weight) || 0,
              reps: Number(x.reps) || 0,
              fail: !!x.fail
            }))
          });
          if (hist.length >= 3) break;
        }
      }
      const failureFlags = hist.flatMap(h => h.sets.map(s => !!s.fail));

      const next = await aiSuggestNext({
        name: entry.name,
        history: hist,
        targetLow: Number(entry.low) || 8,
        targetHigh: Number(entry.high) || 12,
        units,
        bodyweight: (entry.equip || "").toLowerCase() === "bodyweight",
        failureFlags
      });

      const w = structuredClone(work);
      w.entries[eIdx].suggest = next;
      setWork(w);
    } catch {
      const w = structuredClone(work);
      w.entries[eIdx].suggest = { weight: null, reps: null, note: "No suggestion available." };
      setWork(w);
    }
  }

  function toggleWhy(eIdx) {
    const w = structuredClone(work);
    w.entries[eIdx].showWhy = !w.entries[eIdx].showWhy;
    setWork(w);
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
                    <button key={d.id} className="btn" onClick={() => { setLogDayIndex(i); startWorkoutFor(i); }}>
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
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">
                          {e.name} <span className="text-neutral-400 text-sm">({e.low}–{e.high} reps)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="btn" onClick={() => suggestFor(ei)}>Suggest</button>
                          {e.suggest && (
                            <>
                              <span className="text-xs text-neutral-300">
                                Next: {e.suggest.weight != null ? `${e.suggest.weight}${units}` : "bodyweight"} × {e.suggest.reps ?? "?"}
                              </span>
                              <button className="btn-ghost text-xs" onClick={() => toggleWhy(ei)}>Why</button>
                            </>
                          )}
                        </div>
                      </div>

                      {e.suggest && e.showWhy && (
                        <div className="mt-2 text-xs text-neutral-400">
                          {e.suggest.note || "No extra detail."}
                          <div className="mt-1">
                            <button
                              className="btn text-xs"
                              onClick={() => navigator.clipboard?.writeText(e.suggest.note || "")}
                            >
                              Copy note
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 grid gap-2">
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
                  {split.days.map((d) => (
                    <div key={d.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold">{d.name}</div>
                      <ul className="mt-1 text-sm text-neutral-300 list-disc pl-5">
                        {d.exercises.map((x, xi) => (
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
                              <span key={xi} className="mr-2">[{x.weight || "?"}{units} × {x.reps || "?"}{x.fail ? " F" : ""}]</span>
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

      <footer className="mt-8 text-center text-xs text-neutral-500">Works offline • Advice only AI when online</footer>

      {/* Coach note modal */}
      {showCoachNote && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center p-3 z-50">
          <div className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
            <div className="font-semibold">Coach note</div>
            <div className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap">{coachNote}</div>
            <div className="mt-3 flex gap-2 justify-end">
              <button className="btn" onClick={() => navigator.clipboard?.writeText(coachNote)}>Copy</button>
              <button className="btn-primary" onClick={() => setShowCoachNote(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
