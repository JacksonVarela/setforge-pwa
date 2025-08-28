// src/App.jsx
import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as fbSignOut,
} from "firebase/auth";
import {
  doc, setDoc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc
} from "firebase/firestore";

import ImporterAI from "./components/ImporterAI";
import CoachChat from "./components/CoachChat";
import ErrorBoundary from "./components/ErrorBoundary";

import { aiSuggestNext, aiCoachNote, aiDescribe, aiWarmupPlan, aiRest } from "./utils/ai";

// ---------- helpers ----------
function useLocalState(key, initial) {
  const [val, setVal] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}
const uid = () => (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------- templates ----------
const TEMPLATES = [
  {
    id: "ul-rr", name: "Upper / Lower / Rest (repeat)",
    days: [
      { id: uid(), name: "Upper", exercises: [
        { name: "Bench Press", sets: 4, low: 5, high: 8, superset: null },
        { name: "Row (Machine)", sets: 3, low: 8, high: 12, superset: null },
        { name: "Overhead Press", sets: 3, low: 6, high: 10, superset: null },
        { name: "Lat Pulldown", sets: 3, low: 10, high: 12, superset: null },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, superset: null },
      ]},
      { id: uid(), name: "Lower", exercises: [
        { name: "Back Squat", sets: 4, low: 5, high: 8, superset: null },
        { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, superset: null },
        { name: "Leg Press", sets: 3, low: 10, high: 15, superset: null },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, superset: null },
        { name: "Calf Raise", sets: 3, low: 12, high: 20, superset: null },
      ]},
      { id: uid(), name: "Rest / Active Recovery", exercises: [] }
    ]
  },
  {
    id: "ppl-6d", name: "PPL (6 days)",
    days: [
      { id: uid(), name: "Push A", exercises: [
        { name: "Barbell Bench Press", sets: 4, low: 5, high: 8, superset: null },
        { name: "Incline DB Press", sets: 3, low: 8, high: 12, superset: null },
        { name: "Overhead Press (Smith)", sets: 3, low: 6, high: 10, superset: null },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, superset: null },
      ]},
      { id: uid(), name: "Pull A", exercises: [
        { name: "Weighted Pull-up", sets: 4, low: 5, high: 8, superset: null },
        { name: "Barbell Row", sets: 3, low: 6, high: 10, superset: null },
        { name: "Lat Pulldown", sets: 3, low: 10, high: 12, superset: null },
        { name: "Face Pull", sets: 3, low: 12, high: 20, superset: null },
      ]},
      { id: uid(), name: "Legs A", exercises: [
        { name: "Back Squat", sets: 4, low: 5, high: 8, superset: null },
        { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, superset: null },
        { name: "Leg Press", sets: 3, low: 10, high: 15, superset: null },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, superset: null },
      ]},
      { id: uid(), name: "Push B", exercises: [
        { name: "Incline Bench Press", sets: 4, low: 6, high: 10, superset: null },
        { name: "Seated DB Shoulder Press", sets: 3, low: 8, high: 12, superset: null },
        { name: "Cable Lateral Raise", sets: 3, low: 12, high: 20, superset: null },
      ]},
      { id: uid(), name: "Pull B", exercises: [
        { name: "Deadlift (RPE 7)", sets: 3, low: 3, high: 5, superset: null },
        { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, superset: null },
        { name: "EZ Bar Curl", sets: 3, low: 8, high: 12, superset: null },
      ]},
      { id: uid(), name: "Legs B", exercises: [
        { name: "Front Squat", sets: 4, low: 5, high: 8, superset: null },
        { name: "Hip Thrust", sets: 3, low: 8, high: 12, superset: null },
        { name: "Leg Extension", sets: 3, low: 12, high: 15, superset: null },
      ]},
    ],
  },
  {
    id: "arnold-6d", name: "Arnold (C/B • S/A • Legs x2)",
    days: [
      { id: uid(), name: "Chest + Back", exercises: [
        { name: "Incline Bench Press", sets: 4, low: 6, high: 10, superset: null },
        { name: "Pull-up / Pulldown", sets: 4, low: 6, high: 10, superset: null },
        { name: "DB Fly", sets: 3, low: 10, high: 15, superset: null },
        { name: "Barbell Row", sets: 3, low: 6, high: 10, superset: null },
      ]},
      { id: uid(), name: "Shoulders + Arms", exercises: [
        { name: "Overhead Press", sets: 4, low: 6, high: 10, superset: null },
        { name: "Lateral Raise", sets: 4, low: 12, high: 20, superset: null },
        { name: "EZ Curl", sets: 3, low: 8, high: 12, superset: null },
        { name: "Cable Pushdown", sets: 3, low: 10, high: 15, superset: null },
      ]},
      { id: uid(), name: "Legs", exercises: [
        { name: "Squat", sets: 4, low: 5, high: 8, superset: null },
        { name: "Leg Press", sets: 3, low: 10, high: 15, superset: null },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, superset: null },
        { name: "Standing Calf", sets: 4, low: 12, high: 20, superset: null },
      ]},
    ],
  },
  {
    id: "fb-3d", name: "Full Body (3 days)",
    days: [
      { id: uid(), name: "Full 1", exercises: [
        { name: "Squat", sets: 3, low: 5, high: 8, superset: null },
        { name: "Bench Press", sets: 3, low: 6, high: 10, superset: null },
        { name: "Pull-up", sets: 3, low: 6, high: 10, superset: null },
      ]},
      { id: uid(), name: "Full 2", exercises: [
        { name: "Deadlift", sets: 2, low: 3, high: 5, superset: null },
        { name: "Incline DB Press", sets: 3, low: 8, high: 12, superset: null },
        { name: "Row (Machine)", sets: 3, low: 8, high: 12, superset: null },
      ]},
      { id: uid(), name: "Full 3", exercises: [
        { name: "Front Squat", sets: 3, low: 5, high: 8, superset: null },
        { name: "Overhead Press", sets: 3, low: 6, high: 10, superset: null },
        { name: "Lat Pulldown", sets: 3, low: 10, high: 12, superset: null },
      ]},
    ],
  },
];

// ---------- login ----------
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
    } catch (e) { setError(e.message || "Could not sign in."); }
  }
  async function doSignUp() {
    setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user);
      setMode("verifySent");
    } catch (e) { setError(e.message || "Could not sign up."); }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-login anime-overlay relative safe-px safe-pt safe-pb">
      <div className="coach-sticker" aria-hidden />
      <div className="w-[96%] max-w-md glass-strong p-5">
        <h1 className="text-3xl font-extrabold text-center">SetForge</h1>
        <p className="text-center text-neutral-400">Sign in to get started</p>

        <div className="mt-4 grid gap-2">
          <input className="input" style={{fontSize:16}} placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} type="email" />
          <input className="input" style={{fontSize:16}} placeholder="Password" value={pass} onChange={(e)=>setPass(e.target.value)} type="password" />
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

// Small async button (shows “…” while busy)
function AsyncButton({ label, onClick }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try { await onClick?.(); } catch (e) { console.error(label, e); alert(`${label} failed.`); }
        finally { setBusy(false); }
      }}
    >
      {busy ? "…" : label}
    </button>
  );
}

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

  // auth + mobile compact class
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u || null); setAuthReady(true); });
    return unsub;
  }, []);
  useEffect(() => {
    const apply = () => document.body.classList.toggle("compact", window.innerWidth <= 430);
    apply(); window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  async function signOut() {
    try { await fbSignOut(auth); } catch {}
    window.location.replace(window.location.origin + window.location.pathname);
  }

  // -------- Firestore sync (split doc + sessions collection) --------
  useEffect(() => {
    if (!user) return;
    const splitRef = doc(db, "users", user.uid, "data", "split");
    getDoc(splitRef).then(snap => {
      const s = snap.data()?.value;
      if (s && Array.isArray(s.days)) setSplit(s);
    }).catch(()=>{});

    const q = query(collection(db, "users", user.uid, "sessions"), orderBy("date", "desc"), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      setSessions(list);
    });
    return () => unsub();
  }, [user]);

  // Save split to Firestore when changed
  const splitSaveTimer = useRef(null);
  useEffect(() => {
    if (!user || !split || !Array.isArray(split.days)) return;
    clearTimeout(splitSaveTimer.current);
    splitSaveTimer.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, "users", user.uid, "data", "split"), { value: split, updatedAt: Date.now() });
      } catch {}
    }, 400);
    return () => clearTimeout(splitSaveTimer.current);
  }, [split, user]);

  // ---------- logging ----------
  async function startWorkoutFor(dayIdx) {
    if (!split || !Array.isArray(split.days)) return;
    const day = split.days[dayIdx]; if (!day) return;

    // Build entries; inherit split-level superset group
    const entries = (day.exercises || []).map((ex) => {
      const sets = Array.from({ length: Number(ex.sets || 3) }, () => ({
        weight: "", reps: "", rir: "", fail: false, isDrop:false
      }));
      return {
        name: ex.name || "Exercise",
        low: ex.low ?? 8,
        high: ex.high ?? 12,
        sets,
        restText: "…",
        supersetWith: null,
        decisionNote: "", // auto-saved “why” from Suggest
      };
    });

    // If split had "superset" grouping, pair entries that share the same number
    const groups = {};
    (day.exercises || []).forEach((ex, idx) => {
      if (typeof ex.superset === "number") {
        groups[ex.superset] = (groups[ex.superset] || []).concat(idx);
      }
    });
    Object.values(groups).forEach(arr => {
      if (arr.length >= 2) {
        // link first two for now
        const [a, b] = arr;
        entries[a].supersetWith = b;
        entries[b].supersetWith = a;
      }
    });

    const base = { id: uid(), date: todayISO(), dayName: day.name || `Day ${dayIdx+1}`, entries };
    setWork(base);

    // Inline rest
    try {
      const results = await Promise.all(entries.map(e => aiRest({ name: e.name })));
      const next = structuredClone(base);
      next.entries.forEach((e, i) => { e.restText = results[i]?.text || (e.low <= 8 ? "Rest ~2–3 min" : "Rest ~60–90s"); });
      setWork(next);
    } catch {
      const next = structuredClone(base);
      next.entries.forEach((e) => { e.restText = e.low <= 8 ? "Rest ~2–3 min" : "Rest ~60–90s"; });
      setWork(next);
    }
  }

  async function saveWorkout() {
    if (!user || !work || !Array.isArray(work?.entries)) return;
    // local (visible immediately)
    const local = [{ ...work }, ...sessions].slice(0, 200);
    setSessions(local);
    setWork(null);
    alert("Session saved.");

    // cloud
    try {
      await addDoc(collection(db, "users", user.uid, "sessions"), {
        ...local[0],
        uid: user.uid,
      });
    } catch {}
  }

  function discardWorkout() { if (confirm("Discard current session?")) setWork(null); }

  function linkSuperset(aIdx, bIdx) {
    if (!work) return;
    if (aIdx === bIdx) return;
    const next = structuredClone(work);
    next.entries[aIdx].supersetWith = bIdx;
    next.entries[bIdx].supersetWith = aIdx;
    const labelA = next.entries[bIdx].name;
    const labelB = next.entries[aIdx].name;
    next.entries[aIdx].restText = `Alternate with “${labelA}”. Rest ~45–75s between moves (~90–120s per pair).`;
    next.entries[bIdx].restText = `Alternate with “${labelB}”. Rest ~45–75s between moves (~90–120s per pair).`;
    setWork(next);
  }
  function unlinkSuperset(idx) {
    if (!work) return;
    const next = structuredClone(work);
    const peer = next.entries[idx].supersetWith;
    next.entries[idx].supersetWith = null;
    if (peer != null && next.entries[peer]) next.entries[peer].supersetWith = null;
    const e = next.entries[idx];
    next.entries[idx].restText = e.low <= 8 ? "Rest ~2–3 min" : "Rest ~60–90s";
    if (peer != null && next.entries[peer]) {
      const p = next.entries[peer];
      next.entries[peer].restText = p.low <= 8 ? "Rest ~2–3 min" : "Rest ~60–90s";
    }
    setWork(next);
  }

  function addDropSet(ei, si) {
    if (!work) return;
    const next = structuredClone(work);
    const sets = next.entries[ei].sets;
    const base = sets[si];
    const prevW = parseFloat((base?.weight ?? "").toString());
    const dropW = isFinite(prevW) && prevW > 0 ? Math.max(0, Math.round(prevW * 0.85)) : "";
    const drop = { weight: dropW, reps: "", rir: "", fail: false, isDrop: true };
    sets.splice(si + 1, 0, drop);
    setWork(next);
  }
  function removeSet(ei, si) {
    if (!work) return;
    const next = structuredClone(work);
    next.entries[ei].sets.splice(si, 1);
    setWork(next);
  }

  function historyFor(name) {
    const hist = [];
    for (const s of sessions) {
      for (const e of (s.entries || [])) {
        if (String(e.name).toLowerCase() === String(name).toLowerCase()) {
          for (const set of (e.sets || [])) {
            const w = Number(set.weight); const r = Number(set.reps);
            if (Number.isFinite(w) && Number.isFinite(r)) {
              hist.push({ weight: w, reps: r, fail: !!set.fail });
            }
          }
        }
      }
    }
    return hist.slice(0, 12);
  }
  function rirHistoryFor(name) {
    const out = [];
    for (const s of sessions) {
      for (const e of (s.entries || [])) {
        if (String(e.name).toLowerCase() === String(name).toLowerCase()) {
          for (const set of (e.sets || [])) {
            const rir = set?.rir === "" ? null : Number(set.rir);
            out.push(Number.isFinite(rir) ? rir : null);
          }
        }
      }
    }
    return out.slice(0, 12);
  }
  function failureFlagsFor(name) {
    const flags = [];
    for (const s of sessions) {
      for (const e of (s.entries || [])) {
        if (String(e.name).toLowerCase() === String(name).toLowerCase()) {
          flags.push(!!(e.sets || []).some(z => z.fail));
        }
      }
    }
    return flags.slice(0, 6);
  }

  // ---------- render ----------
  if (!authReady) return <div className="min-h-screen grid place-items-center text-neutral-400">Loading…</div>;
  if (!user) return <LoginScreen />;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] safe-px safe-pt safe-pb">
        <header className="flex flex-wrap items-center gap-2 justify-between py-3">
          <div className="text-2xl font-extrabold shrink-0">SetForge</div>
          <nav className="flex gap-2 w-full sm:w-auto order-3 sm:order-none">
            {["log", "split", "sessions", "coach"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "flex-1 sm:flex-initial px-3 py-2 rounded-xl border " +
                  (tab === t ? "bg-neutral-800 border-neutral-700" : "bg-neutral-900 border-neutral-800")
                }
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 shrink-0">
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
                <div className="text-neutral-400">Import a split first, then you can log your session here.</div>
              ) : !work ? (
                <div className="grid items-start gap-3 max-w-2xl">
                  <div className="pill">Choose day to log</div>
                  <div className="grid gap-2">
                    {split.days.map((d, i) => (
                      <button key={d.id ?? i} className="btn" onClick={() => startWorkoutFor(i)}>Start — {d?.name ?? `Day ${i + 1}`}</button>
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
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold">
                            {e?.name ?? "Exercise"}{" "}
                            <span className="text-neutral-400 text-sm">({e?.low ?? 8}–{e?.high ?? 12} reps)</span>
                          </div>
                          {/* Superset control */}
                          <div className="flex items-center gap-2">
                            {e?.supersetWith == null ? (
                              <select
                                className="input w-auto"
                                value=""
                                onChange={(ev) => {
                                  const val = ev.target.value;
                                  if (val === "") return;
                                  linkSuperset(ei, Number(val));
                                }}
                              >
                                <option value="">Superset…</option>
                                {(work.entries || []).map((other, oi) => (
                                  oi !== ei && other.supersetWith == null ? (
                                    <option key={oi} value={oi}>{other.name}</option>
                                  ) : null
                                ))}
                              </select>
                            ) : (
                              <button className="btn" onClick={() => unlinkSuperset(ei)}>
                                Unlink
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline rest guidance */}
                        <div className="mt-1 text-xs text-neutral-400">Rest: {e?.restText || "…"}</div>

                        {/* Decision note from Suggest (auto-saved) */}
                        {e?.decisionNote ? (
                          <div className="mt-2 text-xs text-emerald-400">
                            Suggest note saved: {e.decisionNote}{" "}
                            <button
                              className="underline text-neutral-300"
                              onClick={()=>{
                                const next=structuredClone(work);
                                next.entries[ei].decisionNote="";
                                setWork(next);
                              }}
                            >
                              Clear
                            </button>
                          </div>
                        ) : null}

                        {/* Describe + Suggest + Warm-up */}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <AsyncButton
                            label="Describe"
                            onClick={async () => {
                              const { text } = await aiDescribe({ name: e?.name || "" });
                              alert(text || "No description available right now.");
                            }}
                          />
                          <AsyncButton
                            label="Suggest"
                            onClick={async () => {
                              const hist = historyFor(e?.name || "");
                              const fails = failureFlagsFor(e?.name || "");
                              const rirs = rirHistoryFor(e?.name || "");
                              const resp = await aiSuggestNext({
                                name: e?.name || "",
                                units,
                                history: hist,
                                rirHistory: rirs,
                                targetLow: e?.low ?? 8,
                                targetHigh: e?.high ?? 12,
                                bodyweight: /pull-up|chin-up|dip/i.test(e?.name || ""),
                                failureFlags: fails,
                              });
                              const next = structuredClone(work);
                              const nx = resp?.next || {};
                              const parts = [];
                              if (nx.weight != null) parts.push(`${nx.weight}${units}`);
                              if (nx.reps != null) parts.push(`${nx.reps} reps`);
                              const line = parts.length ? `${nx.decision?.toUpperCase?.() || "Decision"}: ${parts.join(" × ")}` : (nx.decision?.toUpperCase?.() || "Decision");
                              const why = nx.note || "Insufficient history; aim near 1–2 RIR.";

                              // auto-save the “why” note on the exercise
                              next.entries[ei].decisionNote = why;
                              setWork(next);

                              alert(`${line}\n\nWhy: ${why}`);
                            }}
                          />
                          <AsyncButton
                            label="Warm-up"
                            onClick={async () => {
                              const firstWt = parseFloat((e?.sets?.[0]?.weight || "").toString());
                              const target = isFinite(firstWt) && firstWt > 0 ? firstWt : null;
                              const { text } = await aiWarmupPlan({ name: e?.name || "", units, target });
                              alert(text || "No warm-up suggestion available right now.");
                            }}
                          />
                        </div>

                        {/* Sets */}
                        <div className="mt-2 grid gap-2">
                          {(e?.sets ?? []).map((s, si) => (
                            <div key={si} className={"flex flex-wrap items-center gap-2 " + (s.isDrop ? "opacity-90" : "")}>
                              <span className="text-xs text-neutral-400 w-10">{s.isDrop ? "Drop" : `Set ${si + 1}`}</span>
                              <input
                                className="input w-24"
                                style={{fontSize:16}}
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
                                style={{fontSize:16}}
                                placeholder="reps"
                                value={s?.reps ?? ""}
                                onChange={(ev) => {
                                  const next = structuredClone(work);
                                  next.entries[ei].sets[si].reps = ev.target.value;
                                  setWork(next);
                                }}
                              />
                              <input
                                className="input w-16"
                                style={{fontSize:16}}
                                placeholder="RIR"
                                value={s?.rir ?? ""}
                                onChange={(ev) => {
                                  const next = structuredClone(work);
                                  next.entries[ei].sets[si].rir = ev.target.value;
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
                              {!s.isDrop ? (
                                <button className="btn" onClick={() => addDropSet(ei, si)}>Drop+</button>
                              ) : (
                                <button className="btn" onClick={() => removeSet(ei, si)}>Remove</button>
                              )}
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
                {split && <button className="btn" onClick={() => { if (confirm("Clear your split?")) setSplit(null); }}>Clear split</button>}
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
                              {typeof x?.superset === "number" ? <span className="text-xs text-neutral-400"> (SS {x.superset})</span> : null}
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
                      <ImporterAI onConfirm={(payload) => {
                        if (!payload || !Array.isArray(payload?.days)) {
                          alert("Import failed. Try a simpler paste or a different file.");
                          return;
                        }
                        if (split && !confirm("You already have a split. Overwrite it?")) return;
                        setSplit({ name: payload.name || "Imported Split", days: payload.days });
                        setShowImporter(false);
                        setTab("log");
                      }} onCancel={() => setShowImporter(false)} />
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
                            <button className="btn-primary" onClick={() => {
                              if (split && !confirm("You already have a split. Overwrite it?")) return;
                              const days = (t.days || []).map(d => ({
                                id: uid(),
                                name: d.name || "DAY",
                                exercises: (d.exercises || []).map(x => ({ ...x })),
                              }));
                              setSplit({ name: t.name, days });
                              setShowTemplates(false);
                              setTab("log");
                            }}>Use this</button>
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
                    <div key={s?.id ?? si} className="rounded-2xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold">{s?.dayName ?? "Session"} — {s?.date ?? ""}</div>
                      <div className="mt-2 grid gap-1 text-sm">
                        {(s?.entries || []).map((e, i) => (
                          <div key={i} className="text-neutral-300">
                            <div className="font-medium">
                              {e?.name ?? "Exercise"}
                              {e?.supersetWith != null ? <span className="text-xs text-neutral-400"> — (part of superset)</span> : null}
                            </div>
                            {e?.decisionNote ? (
                              <div className="text-xs text-emerald-400">Note: {e.decisionNote}</div>
                            ) : null}
                            <div className="text-xs text-neutral-400">
                              {(e?.sets || []).map((x, xi) => (
                                <span key={xi} className="mr-2">
                                  [{(x?.weight ?? "?")}{units} × {(x?.reps ?? "?")} {x?.rir !== "" ? `${x?.rir}RIR` : ""}{x?.fail ? " F" : ""}{x?.isDrop ? " DS" : ""}]
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
              <CoachChat units={units} day={work?.dayName || ""} />
            </section>
          )}
        </main>

        <footer className="mt-8 text-center text-xs text-neutral-500">
          Works offline • Advice-only AI when online
        </footer>
      </div>
    </ErrorBoundary>
  );
}
