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
import Analytics from "./components/Analytics";
import { aiSuggestNext, aiCoachNote, aiDescribe } from "./utils/ai";

// ---------- small localStorage helper ----------
function useLocalState(key, initial) {
  const [val, setVal] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

// ---------- helpers ----------
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

// ---------- login ----------
function LoginScreen() {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [mode, setMode] = useState("signin"); const [error, setError] = useState("");

  async function doSignIn() {
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (!cred.user.emailVerified) {
        await fbSignOut(auth); setMode("verifySent");
        setError("Check your inbox and verify your email before signing in.");
      }
    } catch (e) { setError(e.message || "Could not sign in."); }
  }
  async function doSignUp() {
    setError("");
    try { const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user); setMode("verifySent");
    } catch (e) { setError(e.message || "Could not sign up."); }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-login anime-overlay relative safe-px safe-pt safe-pb">
      <div className="coach-sticker" aria-hidden />
      <div className="w-[96%] max-w-md glass-strong p-5">
        <h1 className="text-3xl font-extrabold text-center">SetForge</h1>
        <p className="text-center text-neutral-400">Sign in to get started</p>
        <div className="mt-4 grid gap-2">
          <input className="input" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} type="email"/>
          <input className="input" placeholder="Password" value={pass} onChange={(e)=>setPass(e.target.value)} type="password"/>
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
        {mode === "verifySent" && <div className="mt-3 text-sm text-emerald-400">Verification email sent. Verify, then sign in again.</div>}
      </div>
    </div>
  );
}

// ---------- main ----------
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  const [tab, setTab] = useLocalState("sf.tab", "log");
  const [units, setUnits] = useLocalState("sf.units", "lb");
  const [split, setSplit] = useLocalState("sf.split", null);
  const [sessions, setSessions] = useLocalState("sf.sessions", []);
  const [notes, setNotes] = useLocalState("sf.notes", {});
  const [work, setWork] = useLocalState("sf.work", null);

  // coach note / describe modal
  const [coachNote, setCoachNote] = useState(""); const [showCoachNote, setShowCoachNote] = useState(false);
  const [descText, setDescText] = useState(""); const [descFor, setDescFor] = useState(""); const [showDesc, setShowDesc] = useState(false);
  const [descLoading, setDescLoading] = useState(""); // holds exercise name while describe runs

  // importer/templates modals
  const [showImporter, setShowImporter] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u || null); setAuthReady(true); }), []);
  async function signOut(){ try{ await fbSignOut(auth);}catch{} window.location.replace(window.location.origin + window.location.pathname); }

  // ---- logging ----
  function startWorkoutFor(dayIdx) {
    if (!split) return;
    const day = split.days[dayIdx];
    const entries = day.exercises.map(ex => ({
      name: ex.name, low: ex.low || 8, high: ex.high || 12, equip: ex.equip || "machine",
      sets: Array.from({ length: ex.sets || 3 }, () => ({ weight: "", reps: "", fail: false })),
      suggest: null, showWhy: false, _busySuggest: false
    }));
    setWork({ id: uid(), date: todayISO(), dayName: day.name, entries });
  }

  async function saveWorkout() {
    if (!work) return;
    const sessionToSave = { ...work };
    setSessions([sessionToSave, ...sessions].slice(0, 200));
    setWork(null);
    try {
      const recent = sessions.slice(0, 5);
      const note = await aiCoachNote(sessionToSave, recent, units, sessionToSave.dayName);
      if (note) { setCoachNote(note); setShowCoachNote(true); }
    } catch {}
  }

  function discardWorkout(){ if (confirm("Discard current session?")) setWork(null); }

  // ---- template / import ----
  function applyTemplate(t) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    const days = t.days.map(d => ({ id: uid(), name:d.name, exercises: d.exercises.map(x=>({...x})) }));
    setSplit({ name: t.name, days }); setShowTemplates(false); setTab("log");
  }
  function onImportConfirm(payload) { if (split && !confirm("You already have a split. Overwrite it?")) return; setSplit(payload); setShowImporter(false); setTab("log"); }

  // ---- suggest / describe ----
  async function suggestFor(eIdx) {
    if (!work) return;
    // set busy
    {
      const w = structuredClone(work);
      w.entries[eIdx]._busySuggest = true;
      setWork(w);
    }

    const entry = work.entries[eIdx];
    try {
      const hist = [];
      for (const s of sessions) {
        const match = (s.entries || []).find(en => en.name === entry.name);
        if (match) {
          hist.push({ date: s.date, sets: (match.sets || []).map(x => ({ weight: Number(x.weight)||0, reps: Number(x.reps)||0, fail: !!x.fail })) });
          if (hist.length >= 3) break;
        }
      }
      const failureFlags = hist.flatMap(h => h.sets.map(s => !!s.fail));
      const next = await aiSuggestNext({
        name: entry.name,
        history: hist,
        targetLow: Number(entry.low)||8,
        targetHigh: Number(entry.high)||12,
        units,
        bodyweight: (entry.equip||"").toLowerCase()==="bodyweight",
        failureFlags
      });
      const w = structuredClone(work);
      w.entries[eIdx].suggest = next;
      w.entries[eIdx]._busySuggest = false;
      setWork(w);
    } catch {
      const w = structuredClone(work);
      w.entries[eIdx].suggest = { weight: null, reps: null, note: "No suggestion available." };
      w.entries[eIdx]._busySuggest = false;
      setWork(w);
    }
  }

  async function describeExercise(name){
    try {
      setDescLoading(name);
      const t = await aiDescribe(name);
      setDescFor(name); setDescText(t || ""); setShowDesc(true);
    } catch {
      setDescFor(name); setDescText("No description available."); setShowDesc(true);
    } finally {
      setDescLoading("");
    }
  }
  function addDescToNote(){
    if (!descFor) return;
    const next = { ...notes, [descFor]: (notes[descFor] ? notes[descFor] + "\n\n" : "") + descText };
    setNotes(next); setShowDesc(false);
  }

  // ---- data backup ----
  function exportAll() {
    const payload = { version: 1, units, split, sessions, notes, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "setforge-backup.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function importAll(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const j = JSON.parse(String(e.target?.result||"{}"));
        if (j.units) setUnits(j.units);
        if (j.split) setSplit(j.split);
        if (Array.isArray(j.sessions)) setSessions(j.sessions);
        if (j.notes && typeof j.notes === "object") setNotes(j.notes);
        alert("Imported.");
      } catch { alert("Invalid file."); }
    };
    reader.readAsText(file);
  }

  if (!authReady) return <div className="min-h-screen grid place-items-center text-neutral-400">Loading…</div>;
  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] overflow-x-hidden safe-pt safe-pb">
      {/* top bar */}
      <header className="flex items-center gap-2 justify-between py-3 safe-px">
        <div className="text-xl font-extrabold">SetForge</div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {["log", "split", "sessions", "coach"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={"px-3 py-2 rounded-xl border " + (tab === t ? "bg-neutral-800 border-neutral-700" : "bg-neutral-900 border-neutral-800")}>
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

      {/* main container */}
      <main className="mt-2 safe-px mx-auto w-full max-w-screen-sm md:max-w-3xl">
        {tab === "log" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Log</h2>

            {!split ? (
              <div className="text-neutral-400">Import a split or choose a template first.</div>
            ) : !work ? (
              <div className="grid items-start gap-3">
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
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{work.dayName} — {work.date}</h3>
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => { if (confirm("Discard current session?")) setWork(null); }}>Discard</button>
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
                          <button className="btn" onClick={() => suggestFor(ei)} disabled={e._busySuggest}>
                            {e._busySuggest ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
                                Suggesting…
                              </span>
                            ) : "Suggest"}
                          </button>

                          <button className="btn" onClick={() => describeExercise(e.name)} disabled={descLoading === e.name}>
                            {descLoading === e.name ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
                                Describe…
                              </span>
                            ) : "Describe"}
                          </button>

                          {e.suggest && (
                            <>
                              <span className="text-xs text-neutral-300">
                                Next: {e.suggest.weight != null ? `${e.suggest.weight}${units}` : "bodyweight"} × {e.suggest.reps ?? "?"}
                              </span>
                              <button className="btn-ghost text-xs" onClick={() => {
                                const w = structuredClone(work); w.entries[ei].showWhy = !w.entries[ei].showWhy; setWork(w);
                              }}>Why</button>
                            </>
                          )}
                        </div>
                      </div>

                      {e.suggest && e.showWhy && (
                        <div className="mt-2 text-xs text-neutral-400">
                          {e.suggest.note || "No extra detail."}
                          <div className="mt-1">
                            <button className="btn text-xs" onClick={() => navigator.clipboard?.writeText(e.suggest.note || "")}>Copy note</button>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 grid gap-2">
                        {e.sets.map((s, si) => (
                          <div key={si} className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400 w-10">Set {si + 1}</span>
                            <input className="input w-24" placeholder={`wt (${units})`} value={s.weight}
                              onChange={(ev) => { const next = structuredClone(work); next.entries[ei].sets[si].weight = ev.target.value; setWork(next); }}/>
                            <input className="input w-20" placeholder="reps" value={s.reps}
                              onChange={(ev) => { const next = structuredClone(work); next.entries[ei].sets[si].reps = ev.target.value; setWork(next); }}/>
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={s.fail}
                                onChange={(ev) => { const next = structuredClone(work); next.entries[ei].sets[si].fail = ev.target.checked; setWork(next); }}/>
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

            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => setShowImporter(true)}>+ Import (AI)</button>
              <button className="btn" onClick={() => setShowTemplates(true)}>Templates</button>
              {split && (
                <>
                  <button className="btn" onClick={() => { if (confirm("Clear your split?")) setSplit(null); }}>Clear split</button>
                  <button className="btn" onClick={exportAll}>Export data</button>
                  <label className="btn cursor-pointer">
                    <input hidden type="file" accept="application/json" onChange={(e)=> e.target.files?.[0] && importAll(e.target.files[0])}/>
                    Import data
                  </label>
                </>
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{d.name}</div>
                      </div>
                      <ul className="mt-1 text-sm text-neutral-300 grid gap-1">
                        {d.exercises.map((x, xi) => (
                          <li key={xi} className="rounded-lg border border-neutral-800 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">{x.name}</div>
                              <div className="text-xs text-neutral-400">{x.sets} × {x.low}–{x.high}</div>
                            </div>
                            {notes[x.name] && (
                              <div className="mt-1 text-xs text-neutral-400 whitespace-pre-wrap">{notes[x.name]}</div>
                            )}
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

            {/* Templates modal (if you kept templates) */}
            {showTemplates && (
              <div className="fixed inset-0 bg-black/60 grid place-items-center p-2 z-50">
                <div className="w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Templates</h3>
                    <button className="btn" onClick={() => setShowTemplates(false)}>Close</button>
                  </div>
                  {/* If you removed the built-in list, populate your template cards here. */}
                  <div className="mt-3 text-neutral-400">Choose a template (if available).</div>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "sessions" && (
          <section className="grid gap-6">
            <div className="grid gap-4">
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
            </div>

            <Analytics sessions={sessions} split={split} units={units} />
          </section>
        )}

        {tab === "coach" && (
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">Coach</h2>
            <CoachChat units={units} />
          </section>
        )}
      </main>

      <footer className="mt-8 text-center text-xs text-neutral-500 safe-px">Works offline • Advice-only AI when online</footer>

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

      {/* Describe modal */}
      {showDesc && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center p-3 z-50">
          <div className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
            <div className="font-semibold">How to: {descFor}</div>
            <div className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap">{descText}</div>
            <div className="mt-3 flex gap-2 justify-end">
              <button className="btn" onClick={() => navigator.clipboard?.writeText(descText)}>Copy</button>
              <button className="btn" onClick={addDescToNote}>Add to exercise note</button>
              <button className="btn-primary" onClick={() => setShowDesc(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
