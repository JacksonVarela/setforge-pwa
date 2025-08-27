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

/* ============================
   TEMPLATES (science-forward)
   ============================ */
const TEMPLATES = [
  {
    id: "ul-rest-repeat",
    name: "Upper/Lower (Rest-Repeat cycle)",
    note: "2-day training cycle; run U/L then take a rest day and repeat.",
    days: [
      {
        name: "Upper",
        exercises: [
          { name: "Bench Press", sets: 4, low: 5, high: 8, equip: "barbell", group: "push", cat: "compound" },
          { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
          { name: "Overhead Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Lat Pulldown", sets: 3, low: 10, high: 12, equip: "machine", group: "pull", cat: "compound" },
          { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
          { name: "Cable Curl", sets: 2, low: 10, high: 15, equip: "cable", group: "pull", cat: "isolation" },
        ],
      },
      {
        name: "Lower",
        exercises: [
          { name: "Back Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
          { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
          { name: "Standing Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
        ],
      },
    ],
  },
  {
    id: "ppl-6d",
    name: "PPL • 6×/wk",
    note: "Push / Pull / Legs, repeat. Higher frequency & volume.",
    days: [
      {
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
        name: "Legs A",
        exercises: [
          { name: "Back Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
          { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
          { name: "Standing Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
        ],
      },
      {
        name: "Push B",
        exercises: [
          { name: "Incline Bench Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Seated DB Shoulder Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
          { name: "Machine Chest Press", sets: 3, low: 10, high: 12, equip: "machine", group: "push", cat: "compound" },
          { name: "Cable Lateral Raise", sets: 3, low: 12, high: 20, equip: "cable", group: "push", cat: "isolation" },
          { name: "Overhead Rope Extension", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
        ],
      },
      {
        name: "Pull B",
        exercises: [
          { name: "Deadlift (RPE 7)", sets: 3, low: 3, high: 5, equip: "barbell", group: "pull", cat: "compound" },
          { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
          { name: "Single-arm Pulldown", sets: 3, low: 10, high: 15, equip: "cable", group: "pull", cat: "compound" },
          { name: "Reverse Pec Deck", sets: 3, low: 12, high: 20, equip: "machine", group: "pull", cat: "isolation" },
          { name: "EZ Bar Curl", sets: 3, low: 8, high: 12, equip: "barbell", group: "pull", cat: "isolation" },
        ],
      },
      {
        name: "Legs B",
        exercises: [
          { name: "Front Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Hip Thrust", sets: 3, low: 8, high: 12, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Leg Extension", sets: 3, low: 12, high: 15, equip: "machine", group: "legs", cat: "isolation" },
          { name: "Seated Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
          { name: "Hanging Leg Raise", sets: 3, low: 10, high: 15, equip: "bodyweight", group: "core", cat: "isolation" },
        ],
      },
    ],
  },
  {
    id: "arnold-6d",
    name: "Arnold (C/B • S/A • Legs, repeat)",
    note: "Classic high-volume split (Chest+Back, Shoulders+Arms, Legs).",
    days: [
      {
        name: "Chest + Back",
        exercises: [
          { name: "Incline Bench Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Pull-up / Pulldown", sets: 4, low: 6, high: 10, equip: "machine", group: "pull", cat: "compound" },
          { name: "DB Fly", sets: 3, low: 10, high: 15, equip: "dumbbell", group: "push", cat: "isolation" },
          { name: "Barbell Row", sets: 3, low: 6, high: 10, equip: "barbell", group: "pull", cat: "compound" },
        ],
      },
      {
        name: "Shoulders + Arms",
        exercises: [
          { name: "Overhead Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Lateral Raise", sets: 4, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
          { name: "EZ Curl", sets: 3, low: 8, high: 12, equip: "barbell", group: "pull", cat: "isolation" },
          { name: "Cable Pushdown", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
        ],
      },
      {
        name: "Legs",
        exercises: [
          { name: "Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Leg Press", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "compound" },
          { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
          { name: "Standing Calf", sets: 4, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
        ],
      },
    ],
  },
  {
    id: "fullbody-3d",
    name: "Full Body • 3×/wk",
    note: "Great for busy schedules and beginners/intermediates.",
    days: [
      {
        name: "Full A",
        exercises: [
          { name: "Back Squat", sets: 3, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Bench Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Lat Pulldown", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
          { name: "Plank", sets: 2, low: 30, high: 60, equip: "bodyweight", group: "core", cat: "isolation" },
        ],
      },
      {
        name: "Full B",
        exercises: [
          { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Overhead Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Seated Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
          { name: "Calf Raise", sets: 2, low: 10, high: 15, equip: "machine", group: "legs", cat: "isolation" },
        ],
      },
      {
        name: "Full C",
        exercises: [
          { name: "Front Squat or Hack Squat", sets: 3, low: 6, high: 10, equip: "machine", group: "legs", cat: "compound" },
          { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
          { name: "Pull-ups or Assisted", sets: 3, low: 6, high: 10, equip: "bodyweight", group: "pull", cat: "compound" },
          { name: "Cable Curl", sets: 2, low: 10, high: 15, equip: "cable", group: "pull", cat: "isolation" },
        ],
      },
    ],
  },
  {
    id: "minimal-2d",
    name: "Minimal • 2×/wk",
    note: "Time-crunched? Two fast sessions; progressive over time.",
    days: [
      {
        name: "Day 1",
        exercises: [
          { name: "Back Squat", sets: 3, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Bench Press", sets: 3, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Lat Pulldown", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        ],
      },
      {
        name: "Day 2",
        exercises: [
          { name: "Deadlift (RDL or Trap Bar)", sets: 3, low: 3, high: 6, equip: "barbell", group: "pull", cat: "compound" },
          { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
          { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        ],
      },
    ],
  },
  {
    id: "bro-5d",
    name: "Bro Split • 5×/wk",
    note: "Chest, Back, Shoulders, Legs, Arms (or sequence you prefer).",
    days: [
      {
        name: "Chest",
        exercises: [
          { name: "Bench Press", sets: 4, low: 5, high: 8, equip: "barbell", group: "push", cat: "compound" },
          { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", group: "push", cat: "compound" },
          { name: "Cable Fly", sets: 3, low: 12, high: 15, equip: "cable", group: "push", cat: "isolation" },
        ],
      },
      {
        name: "Back",
        exercises: [
          { name: "Deadlift (RPE 7)", sets: 3, low: 3, high: 5, equip: "barbell", group: "pull", cat: "compound" },
          { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
          { name: "Lat Pulldown", sets: 3, low: 8, high: 12, equip: "machine", group: "pull", cat: "compound" },
        ],
      },
      {
        name: "Shoulders",
        exercises: [
          { name: "Overhead Press", sets: 4, low: 6, high: 10, equip: "barbell", group: "push", cat: "compound" },
          { name: "Lateral Raise", sets: 4, low: 12, high: 20, equip: "dumbbell", group: "push", cat: "isolation" },
          { name: "Rear Delt Fly (machine)", sets: 3, low: 12, high: 20, equip: "machine", group: "pull", cat: "isolation" },
        ],
      },
      {
        name: "Legs",
        exercises: [
          { name: "Back Squat", sets: 4, low: 5, high: 8, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", group: "legs", cat: "compound" },
          { name: "Leg Extension", sets: 3, low: 12, high: 15, equip: "machine", group: "legs", cat: "isolation" },
          { name: "Seated Calf Raise", sets: 3, low: 12, high: 20, equip: "machine", group: "legs", cat: "isolation" },
        ],
      },
      {
        name: "Arms",
        exercises: [
          { name: "EZ Bar Curl", sets: 3, low: 8, high: 12, equip: "barbell", group: "pull", cat: "isolation" },
          { name: "Triceps Rope Pushdown", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
          { name: "Incline DB Curl", sets: 3, low: 10, high: 15, equip: "dumbbell", group: "pull", cat: "isolation" },
          { name: "Overhead Rope Extension", sets: 3, low: 10, high: 15, equip: "cable", group: "push", cat: "isolation" },
        ],
      },
    ],
  },
];

/* ================
   small helpers
   ================ */
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

/* ================
   local storage hook
   ================ */
function useLocalState(key, initial) {
  const [val, setVal] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

/* ================
   login screen
   ================ */
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
          {mode === "signin"
            ? <button className="btn-primary" onClick={doSignIn}>Sign in</button>
            : <button className="btn-primary" onClick={doSignUp}>Create account</button>}
          <div className="text-xs text-neutral-400 text-center">Email verification required. We use Firebase Auth free tier.</div>
        </div>
        <div className="mt-3 text-center">
          {mode === "signin"
            ? <button className="btn" onClick={() => setMode("signup")}>No account? Sign up</button>
            : <button className="btn" onClick={() => setMode("signin")}>Have an account? Sign in</button>}
        </div>
        {!!error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        {mode === "verifySent" && <div className="mt-3 text-sm text-emerald-400">Verification email sent. Verify, then sign in again.</div>}
      </div>
    </div>
  );
}

/* ================
   main app
   ================ */
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
  const [descLoading, setDescLoading] = useState("");

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

  // ---- template / import ----
  function applyTemplate(t) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    const days = t.days.map(d => ({ id: uid(), name:d.name, exercises: d.exercises.map(x=>({...x})) }));
    setSplit({ name: t.name, days }); setShowTemplates(false); setTab("log");
  }
  function onImportConfirm(payload) {
    if (split && !confirm("You already have a split. Overwrite it?")) return;
    setSplit(payload); setShowImporter(false); setTab("log");
  }

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

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u || null); setAuthReady(true); }), []);
  async function discardWorkout(){ if (confirm("Discard current session?")) setWork(null); }

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
                              {t.days.length} day(s) • {t.days.reduce((a, d) => a + d.exercises.length, 0)} exercises
                              {t.note ? ` • ${t.note}` : ""}
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

      <footer className="mt-8 text-center text-xs text-neutral-500 safe-px">
        Works offline • Advice-only AI when online
      </footer>

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
