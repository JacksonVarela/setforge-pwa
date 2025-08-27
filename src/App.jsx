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
import Analytics from "./components/Analytics";
import Busy from "./components/Busy";
import PlateMath from "./components/PlateMath";

import { aiSuggestNext, aiCoachNote, aiDescribe } from "./utils/ai";

// Cloud backup (manual): Firestore
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
const db = getFirestore();

// ---------- helpers ----------
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function e1rm(weight, reps){ const w=Number(weight)||0, r=Number(reps)||0; return w*(1+r/30); }
function parseHashImport(){ try{ if(location.hash.startsWith("#import=")){ return JSON.parse(decodeURIComponent(location.hash.slice(8))); }}catch{} return null; }

// ---------- localStorage hook ----------
function useLocalState(key, initial) {
  const [val, setVal] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

// ---------- login ----------
function LoginScreen() {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [mode, setMode] = useState("signin"); const [error, setError] = useState("");

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
        <h1 className="text-2xl sm:text-3xl font-extrabold text-center">SetForge</h1>
        <p className="text-center text-neutral-400">Sign in to get started</p>
        <div className="mt-4 grid gap-2">
          <input className="input" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} type="email"/>
          <input className="input" placeholder="Password" value={pass} onChange={(e)=>setPass(e.target.value)} type="password"/>
          {mode === "signin"
            ? <button className="btn-primary w-full sm:w-auto" onClick={doSignIn}>Sign in</button>
            : <button className="btn-primary w-full sm:w-auto" onClick={doSignUp}>Create account</button>}
          <div className="text-xs text-neutral-400 text-center">Email verification required.</div>
        </div>
        <div className="mt-3 text-center">
          {mode === "signin"
            ? <button className="btn w-full sm:w-auto" onClick={() => setMode("signup")}>No account? Sign up</button>
            : <button className="btn w-full sm:w-auto" onClick={() => setMode("signin")}>Have an account? Sign in</button>}
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
  const [split, setSplit] = useLocalState("sf.split", null);            // {name, days:[{id,name,exercises:[exercise|superset]}]}
  const [sessions, setSessions] = useLocalState("sf.sessions", []);     // saved sessions
  const [notes, setNotes] = useLocalState("sf.notes", {});              // pinned notes by exercise name
  const [work, setWork] = useLocalState("sf.work", null);               // in-progress session

  const [coachNote, setCoachNote] = useState("");
  const [showCoachNote, setShowCoachNote] = useState(false);

  const [descText, setDescText] = useState("");
  const [descFor, setDescFor] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [descLoading, setDescLoading] = useState("");

  const [showImporter, setShowImporter] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const [plateFor, setPlateFor] = useState({ open:false, weight:0 });

  // cloud
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u || null); setAuthReady(true); }), []);

  useEffect(() => {
    // import split via URL: #import=<encoded JSON>
    const payload = parseHashImport();
    if (payload?.days) {
      setSplit(payload);
      location.hash = "";
      alert("Split imported from link.");
      setTab("log");
    }
  }, []);

  async function signOut(){ try{ await fbSignOut(auth);}catch{} window.location.replace(window.location.origin + window.location.pathname); }

  // ---------- start / save / discard ----------
  function startWorkoutFor(dayIdx) {
    if (!split) return;
    const day = split.days[dayIdx];
    const entries = [];
    for (const ex of day.exercises || []) {
      if (ex.type === "superset") {
        const rounds = Number(ex.rounds || 3);
        const items = (ex.items || []).map(s => ({
          type: "exercise",
          name: s.name,
          low: s.low === "failure" ? "failure" : Number(s.low || 8),
          high: s.high === "failure" ? "failure" : Number(s.high || 12),
          group: s.group || "upper",
          equip: s.equip || "machine",
          cat: s.cat || "isolation",
          sets: Array.from({ length: rounds }, () => ({ weight: "", reps: "", fail: false, rir: "", isDrop: false, segments: [] }))
        }));
        entries.push({ type:"superset", name: ex.name || "Superset", rounds, items, suggest:null, _busy:false, showWhy:false, lastRest: null });
      } else {
        const setsNum = Number(ex.sets || 3);
        const sets = Array.from({ length: setsNum }, () => ({ weight: "", reps: "", fail: false, rir: "", isDrop: false, segments: [] }));
        entries.push({ type:"exercise", name: ex.name, low: ex.low||8, high: ex.high||12, group: ex.group||"upper", equip: ex.equip||"machine", cat: ex.cat||"isolation",
          sets, suggest:null, _busy:false, showWhy:false, lastRest: null });
      }
    }
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

  // ---------- helpers for set editing ----------
  function addDropSegment(ei, si) {
    const next = structuredClone(work);
    const set = next.entries[ei].sets[si];
    set.isDrop = true;
    set.segments ||= [];
    set.segments.push({ weight: "", reps: "", fail: false });
    setWork(next);
  }
  function copyPrev(ei, si) {
    if (si<=0) return;
    const next = structuredClone(work);
    const prev = next.entries[ei].sets[si-1];
    next.entries[ei].sets[si] = structuredClone(prev);
    setWork(next);
  }
  function fillDown(ei, si) {
    const next = structuredClone(work);
    const curr = next.entries[ei].sets[si];
    for (let k=si+1; k<next.entries[ei].sets.length; k++) next.entries[ei].sets[k] = structuredClone(curr);
    setWork(next);
  }
  function adjustWeight(ei, si, delta) {
    const next = structuredClone(work);
    const cur = Number(next.entries[ei].sets[si].weight||0);
    const val = Math.max(0, Math.round((cur + delta)*100)/100);
    next.entries[ei].sets[si].weight = String(val);
    setWork(next);
  }

  // Voice log (weight/reps)
  function voiceFill(ei, si) {
    // Safari: only works if webkitSpeechRecognition is available
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported on this browser."); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const txt = (ev.results?.[0]?.[0]?.transcript || "").toLowerCase();
      // naive parse: "<weight> for <reps>"
      const m = txt.match(/(\d+(\.\d+)?)\s*(pounds|lbs|lb|kg)?\s*(for|x|by)?\s*(\d+)/);
      if (!m) return;
      const weight = m[1], reps = m[5];
      const next = structuredClone(work);
      next.entries[ei].sets[si].weight = weight;
      next.entries[ei].sets[si].reps = reps;
      setWork(next);
    };
    rec.onerror = ()=>{};
    rec.start();
  }

  // Suggest (per exercise, uses last set RIR)
  async function suggestFor(eIdx, nameOverride=null) {
    if (!work) return;
    const w0 = structuredClone(work);
    w0.entries[eIdx]._busy = true;
    setWork(w0);

    const entry = work.entries[eIdx];
    const name = nameOverride || entry.name;

    try {
      // build history for this exercise name
      const hist = [];
      for (const s of sessions) {
        // session entries can be exercises or supersets
        for (const en of (s.entries||[])) {
          if (en.type === "superset") {
            for (const sub of (en.items||[])) {
              if (sub.name === name) {
                hist.push({ date: s.date, sets: (sub.sets || []).map(x => ({ weight: Number(x.weight)||0, reps: Number(x.reps)||0, fail: !!x.fail })) });
              }
            }
          } else if (en.name === name) {
            hist.push({ date: s.date, sets: (en.sets || []).map(x => ({ weight: Number(x.weight)||0, reps: Number(x.reps)||0, fail: !!x.fail })) });
          }
        }
        if (hist.length >= 3) break;
      }
      const failureFlags = hist.flatMap(h => h.sets.map(s => !!s.fail));
      const lastSet = (entry.sets||[])[(entry.sets?.length||1)-1] || {};
      const lastRIR = lastSet.rir==="" ? null : Number(lastSet.rir);
      const bodyweight = (entry.equip||"").toLowerCase()==="bodyweight";
      const targetLow = Number(entry.low)||8, targetHigh = Number(entry.high)||12;

      const { next, warmup } = await aiSuggestNext({
        name, history: hist, targetLow, targetHigh, units, bodyweight, failureFlags, lastRIR
      });

      const w = structuredClone(work);
      w.entries[eIdx].suggest = { ...next, warmup };
      w.entries[eIdx]._busy = false;
      setWork(w);
    } catch {
      const w = structuredClone(work);
      w.entries[eIdx].suggest = { weight: null, reps: null, note: "No suggestion available.", restSeconds: 90, warmup: [] };
      w.entries[eIdx]._busy = false;
      setWork(w);
    }
  }

  // Describe modal
  async function describeExercise(name){
    try { setDescLoading(name); const t = await aiDescribe(name); setDescFor(name); setDescText(t||""); setShowDesc(true); }
    catch { setDescFor(name); setDescText("No description available."); setShowDesc(true); }
    finally { setDescLoading(""); }
  }
  function addDescToNote(){
    if (!descFor) return;
    const next = { ...notes, [descFor]: (notes[descFor] ? notes[descFor] + "\n\n" : "") + descText };
    setNotes(next); setShowDesc(false);
  }

  // PR badges (simple e1RM compare vs past sessions)
  function isPR(name, weight, reps) {
    if (!weight || !reps) return false;
    const curr = e1rm(weight, reps);
    let best = 0;
    for (const s of sessions) {
      for (const en of (s.entries||[])) {
        const list = en.type==="superset" ? (en.items||[]) : [en];
        for (const ex of list) {
          if (ex.name !== name) continue;
          for (const set of (ex.sets||[])) best = Math.max(best, e1rm(set.weight, set.reps));
        }
      }
    }
    return curr > best;
  }
  function last3(name){
    const out = [];
    for (const s of sessions) {
      const matches=[];
      for (const en of (s.entries||[])) {
        const list = en.type==="superset" ? (en.items||[]) : [en];
        for (const ex of list) {
          if (ex.name===name) matches.push({ date:s.date, sets: ex.sets });
        }
      }
      if (matches.length) out.push({ date:s.date, sets: matches[0].sets });
      if (out.length>=3) break;
    }
    return out;
  }

  // Share split link
  function shareSplitLink(){
    if (!split) return alert("No split.");
    const encoded = encodeURIComponent(JSON.stringify(split));
    const url = `${location.origin}${location.pathname}#import=${encoded}`;
    navigator.clipboard?.writeText(url);
    alert("Link copied!");
  }

  // Cloud (manual)
  async function cloudSave(){
    if (!user) return alert("Sign in.");
    setCloudBusy(true);
    try {
      const payload = { units, split, sessions, notes, savedAt: new Date().toISOString() };
      await setDoc(doc(db, "users", user.uid, "app", "state"), payload, { merge:true });
      alert("Saved to cloud.");
    } catch { alert("Failed to save."); }
    setCloudBusy(false);
  }
  async function cloudLoad(){
    if (!user) return alert("Sign in.");
    setCloudBusy(true);
    try {
      const snap = await getDoc(doc(db, "users", user.uid, "app", "state"));
      if (!snap.exists()) return alert("No cloud save found.");
      const d = snap.data();
      if (d.units) setUnits(d.units);
      if (d.split) setSplit(d.split);
      if (d.sessions) setSessions(d.sessions);
      if (d.notes) setNotes(d.notes);
      alert("Loaded from cloud.");
    } catch { alert("Failed to load."); }
    setCloudBusy(false);
  }

  if (!authReady) return <div className="min-h-screen grid place-items-center text-neutral-400">Loading…</div>;
  if (!user) return <LoginScreen />;

  // ================== RENDER ==================
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] overflow-x-hidden safe-pt safe-pb">
      {/* top bar */}
      <header className="flex items-center gap-2 justify-between py-2 safe-px">
        <div className="text-lg sm:text-xl font-extrabold">SetForge</div>
        <nav className="flex gap-2 text-sm overflow-x-auto no-scrollbar max-w-[60vw] sm:max-w-none">
          {["log", "split", "sessions", "coach"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={"px-3 py-2 rounded-xl border whitespace-nowrap " + (tab === t ? "bg-neutral-800 border-neutral-700" : "bg-neutral-900 border-neutral-800")}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="pill">
            <button onClick={() => setUnits("lb")} className={"px-2 py-1 rounded " + (units === "lb" ? "bg-neutral-700" : "")}>lb</button>
            <button onClick={() => setUnits("kg")} className={"px-2 py-1 rounded " + (units === "kg" ? "bg-neutral-700" : "")}>kg</button>
          </div>
          <button className="btn hidden xs:inline-flex sm:inline-flex" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="mt-2 safe-px mx-auto w-full max-w-screen-sm md:max-w-3xl">
        {/* LOG */}
        {tab === "log" && (
          <section className="grid gap-4">
            <h2 className="text-lg sm:text-xl font-semibold">Log</h2>

            {!split ? (
              <div className="text-neutral-400">Import a split or choose a template first.</div>
            ) : !work ? (
              <div className="grid items-start gap-3">
                <div className="pill">Choose day to log</div>
                <div className="grid gap-2">
                  {split.days.map((d, i) => (
                    <button key={d.id} className="btn w-full sm:w-auto" onClick={() => startWorkoutFor(i)}>
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
                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">
                          {e.type==="superset" ? (e.name || "Superset") : e.name}
                          {e.type==="exercise" && (<span className="text-neutral-400 text-xs sm:text-sm"> ({e.low}–{e.high} reps)</span>)}
                          {notes[e.name] && <span className="ml-2 pill">Note pinned</span>}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Suggest */}
                          <button className="btn" onClick={() => suggestFor(ei)} disabled={e._busy}>
                            {e._busy ? <Busy text="Suggesting…" /> : "Suggest"}
                          </button>
                          {/* Describe */}
                          {e.type==="exercise" && (
                            <button className="btn" onClick={() => describeExercise(e.name)} disabled={descLoading === e.name}>
                              {descLoading === e.name ? <Busy text="Describe…" /> : "Describe"}
                            </button>
                          )}
                          {/* Why / Rest */}
                          {e.suggest && (
                            <>
                              <span className="text-[11px] sm:text-xs text-neutral-300">
                                Next: {e.suggest.weight != null ? `${e.suggest.weight}${units}` : "bodyweight"} × {e.suggest.reps ?? "?"}
                                {typeof e.suggest.restSeconds==="number" ? ` • Rest: ${e.suggest.restSeconds}s` : ""}
                              </span>
                              <button className="btn-ghost text-[11px] sm:text-xs" onClick={() => {
                                const w = structuredClone(work); w.entries[ei].showWhy = !w.entries[ei].showWhy; setWork(w);
                              }}>Why</button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Why note / warm-up */}
                      {e.suggest && e.showWhy && (
                        <div className="mt-2 text-xs text-neutral-300">
                          <div>{e.suggest.note || "No extra detail."}</div>
                          {!!(e.suggest.warmup||[]).length && (
                            <div className="mt-2">
                              <div className="font-semibold">AI warm-up:</div>
                              <ul className="mt-1 grid gap-1">
                                {e.suggest.warmup.map((w,i)=>(
                                  <li key={i} className="text-neutral-400">• {w.weight==null ? "bodyweight" : `${w.weight}${units}`} × {w.reps}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* CONTENT */}
                      {e.type==="superset" ? (
                        <div className="mt-2 grid gap-2">
                          <div className="text-xs text-neutral-400">Rounds: {e.rounds}</div>
                          {(e.items||[]).map((sub, si)=>(
                            <div key={si} className="rounded-lg border border-neutral-800 p-2">
                              <div className="flex items-center justify-between">
                                <div className="font-medium">{si===0?"A":"B"}. {sub.name} <span className="text-neutral-400 text-xs">({sub.low}–{sub.high})</span></div>
                                <div className="flex gap-2">
                                  <button className="btn" onClick={()=>suggestFor(ei, sub.name)} disabled={e._busy}><span>Suggest {si===0?"A":"B"}</span></button>
                                  <button className="btn" onClick={() => describeExercise(sub.name)} disabled={descLoading === sub.name}>
                                    {descLoading === sub.name ? <Busy text="Describe…" /> : "Describe"}
                                  </button>
                                </div>
                              </div>
                              <div className="mt-2 grid gap-2">
                                {sub.sets.map((s, sidx) => (
                                  <div key={sidx} className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] text-neutral-400 w-12">Set {sidx + 1}</span>
                                    <input className="input w-28" placeholder={`wt (${units})`} value={s.weight}
                                      onChange={(ev)=>{ const next=structuredClone(work); next.entries[ei].items[si].sets[sidx].weight=ev.target.value; setWork(next); }}/>
                                    <input className="input w-20" placeholder="reps" value={s.reps}
                                      onChange={(ev)=>{ const next=structuredClone(work); next.entries[ei].items[si].sets[sidx].reps=ev.target.value; setWork(next); }}/>
                                    <select className="input w-20" value={s.rir} onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].items[si].sets[sidx].rir=ev.target.value; setWork(n); }}>
                                      <option value="">RIR</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5+</option>
                                    </select>
                                    <label className="flex items-center gap-1 text-[11px]">
                                      <input type="checkbox" checked={s.fail}
                                        onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].items[si].sets[sidx].fail=ev.target.checked; setWork(n); }}/>
                                      to failure
                                    </label>
                                    {/* helpers */}
                                    <div className="flex items-center gap-1">
                                      <button className="btn" onClick={()=>adjustWeight(ei, sidx, +2.5)}>+2.5</button>
                                      <button className="btn" onClick={()=>adjustWeight(ei, sidx, +5)}>+5</button>
                                      <button className="btn" onClick={()=>adjustWeight(ei, sidx, -5)}>-5</button>
                                      <button className="btn" onClick={()=>copyPrev(ei, sidx)}>Copy prev</button>
                                      <button className="btn" onClick={()=>fillDown(ei, sidx)}>Fill down</button>
                                      <button className="btn" onClick={()=>voiceFill(ei, sidx)}>🎙️</button>
                                      <button className="btn" onClick={()=>setPlateFor({ open:true, weight:Number(s.weight)||0 })}>Plates</button>
                                    </div>
                                    {/* dropset */}
                                    {!s.isDrop && <button className="btn" onClick={()=>addDropSegment(ei, sidx)}>+ Drop</button>}
                                    {s.isDrop && (
                                      <div className="w-full pl-14 grid gap-1">
                                        {(s.segments||[]).map((seg,gi)=>(
                                          <div key={gi} className="flex flex-wrap items-center gap-2">
                                            <span className="text-[11px] text-neutral-400">Drop {gi+1}</span>
                                            <input className="input w-24" placeholder="wt" value={seg.weight} onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].items[si].sets[sidx].segments[gi].weight=ev.target.value; setWork(n); }}/>
                                            <input className="input w-20" placeholder="reps" value={seg.reps} onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].items[si].sets[sidx].segments[gi].reps=ev.target.value; setWork(n); }}/>
                                            <label className="flex items-center gap-1 text-[11px]">
                                              <input type="checkbox" checked={!!seg.fail} onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].items[si].sets[sidx].segments[gi].fail=ev.target.checked; setWork(n); }}/>
                                              to failure
                                            </label>
                                          </div>
                                        ))}
                                        <button className="btn w-fit" onClick={()=>{ const n=structuredClone(work); n.entries[ei].items[si].sets[sidx].segments.push({weight:"",reps:"",fail:false}); setWork(n); }}>+ Segment</button>
                                      </div>
                                    )}
                                    {/* PR badge */}
                                    {isPR(sub.name, s.weight, s.reps) && <span className="pill">PR 🎉</span>}
                                  </div>
                                ))}
                              </div>

                              <details className="mt-2">
                                <summary className="text-xs text-neutral-400 cursor-pointer">History (last 3)</summary>
                                <pre className="text-xs text-neutral-400 whitespace-pre-wrap mt-1">
                                  {JSON.stringify(last3(sub.name), null, 2)}
                                </pre>
                              </details>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // Single exercise card
                        <div className="mt-2 grid gap-2">
                          {e.sets.map((s, si) => (
                            <div key={si} className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-neutral-400 w-12">Set {si + 1}</span>
                              <input className="input w-28" placeholder={`wt (${units})`} value={s.weight}
                                onChange={(ev) => { const next = structuredClone(work); next.entries[ei].sets[si].weight = ev.target.value; setWork(next); }}/>
                              <input className="input w-20" placeholder="reps" value={s.reps}
                                onChange={(ev) => { const next = structuredClone(work); next.entries[ei].sets[si].reps = ev.target.value; setWork(next); }}/>
                              <select className="input w-20" value={s.rir} onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].sets[si].rir=ev.target.value; setWork(n); }}>
                                <option value="">RIR</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5+</option>
                              </select>
                              <label className="flex items-center gap-1 text-[11px]">
                                <input type="checkbox" checked={s.fail}
                                  onChange={(ev) => { const next = structuredClone(work); next.entries[ei].sets[si].fail = ev.target.checked; setWork(next); }}/>
                                to failure
                              </label>
                              {/* helpers */}
                              <div className="flex items-center gap-1">
                                <button className="btn" onClick={()=>adjustWeight(ei, si, +2.5)}>+2.5</button>
                                <button className="btn" onClick={()=>adjustWeight(ei, si, +5)}>+5</button>
                                <button className="btn" onClick={()=>adjustWeight(ei, si, -5)}>-5</button>
                                <button className="btn" onClick={()=>copyPrev(ei, si)}>Copy prev</button>
                                <button className="btn" onClick={()=>fillDown(ei, si)}>Fill down</button>
                                <button className="btn" onClick={()=>voiceFill(ei, si)}>🎙️</button>
                                <button className="btn" onClick={()=>setPlateFor({ open:true, weight:Number(s.weight)||0 })}>Plates</button>
                              </div>
                              {/* dropset */}
                              {!s.isDrop && <button className="btn" onClick={()=>addDropSegment(ei, si)}>+ Drop</button>}
                              {s.isDrop && (
                                <div className="w-full pl-14 grid gap-1">
                                  {(s.segments||[]).map((seg,gi)=>(
                                    <div key={gi} className="flex flex-wrap items-center gap-2">
                                      <span className="text-[11px] text-neutral-400">Drop {gi+1}</span>
                                      <input className="input w-24" placeholder="wt" value={seg.weight} onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].sets[si].segments[gi].weight=ev.target.value; setWork(n); }}/>
                                      <input className="input w-20" placeholder="reps" value={seg.reps} onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].sets[si].segments[gi].reps=ev.target.value; setWork(n); }}/>
                                      <label className="flex items-center gap-1 text-[11px]">
                                        <input type="checkbox" checked={!!seg.fail} onChange={(ev)=>{ const n=structuredClone(work); n.entries[ei].sets[si].segments[gi].fail=ev.target.checked; setWork(n); }}/>
                                        to failure
                                      </label>
                                    </div>
                                  ))}
                                  <button className="btn w-fit" onClick={()=>{ const n=structuredClone(work); n.entries[ei].sets[si].segments.push({weight:"",reps:"",fail:false}); setWork(n); }}>+ Segment</button>
                                </div>
                              )}
                              {/* PR badge */}
                              {isPR(e.name, s.weight, s.reps) && <span className="pill">PR 🎉</span>}
                            </div>
                          ))}
                          <details className="mt-1">
                            <summary className="text-xs text-neutral-400 cursor-pointer">History (last 3)</summary>
                            <pre className="text-xs text-neutral-400 whitespace-pre-wrap mt-1">
                              {JSON.stringify(last3(e.name), null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
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
            <h2 className="text-lg sm:text-xl font-semibold">Split</h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn w-full sm:w-auto" onClick={() => setShowImporter(true)}>+ Import (AI)</button>
              <button className="btn w-full sm:w-auto" onClick={() => setShowTemplates(true)}>Templates</button>
              <button className="btn w-full sm:w-auto" onClick={shareSplitLink}>Share link</button>
              <button className="btn w-full sm:w-auto" onClick={cloudSave} disabled={cloudBusy}>{cloudBusy ? "Saving…" : "Save to cloud"}</button>
              <button className="btn w-full sm:w-auto" onClick={cloudLoad} disabled={cloudBusy}>{cloudBusy ? "Loading…" : "Load from cloud"}</button>
              {split && (
                <button className="btn w-full sm:w-auto" onClick={() => { if (confirm("Clear your split?")) setSplit(null); }}>Clear split</button>
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
                      <ul className="mt-1 text-sm text-neutral-300 grid gap-1">
                        {d.exercises.map((x, xi) => (
                          <li key={xi} className="rounded-lg border border-neutral-800 p-2">
                            {x.type==="superset" ? (
                              <>
                                <div className="flex items-center justify-between">
                                  <div className="font-medium">Superset: {x.name}</div>
                                  <div className="text-xs text-neutral-400">Rounds {x.rounds}</div>
                                </div>
                                <ul className="mt-1 pl-4 list-disc">
                                  {x.items.map((s, i)=>(
                                    <li key={i}>{s.name} — {s.low}–{s.high}</li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium">{x.name}</div>
                                <div className="text-xs text-neutral-400">{x.sets} × {x.low}–{x.high}</div>
                              </div>
                            )}
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
                <div className="w-full max-w-5xl bg-neutral-950 border border-neutral-800 rounded-2xl p-3 max-h-[92vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Import split (AI)</h3>
                    <button className="btn" onClick={() => setShowImporter(false)}>Close</button>
                  </div>
                  <div className="mt-3">
                    <ImporterAI onConfirm={(payload)=>{ setSplit(payload); setShowImporter(false); setTab("log"); }} onCancel={() => setShowImporter(false)} />
                  </div>
                </div>
              </div>
            )}

            {/* Templates modal (simple) */}
            {showTemplates && (
              <div className="fixed inset-0 bg-black/60 grid place-items-center p-2 z-50">
                <div className="w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-2xl p-3 max-h-[92vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Templates</h3>
                    <button className="btn" onClick={() => setShowTemplates(false)}>Close</button>
                  </div>

                  <div className="mt-3 grid gap-3">
                    {DEFAULT_TEMPLATES.map((t) => (
                      <div key={t.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold">{t.name}</div>
                            <div className="text-xs text-neutral-400">
                              {t.days.length} day(s) • {t.days.reduce((a, d) => a + d.exercises.length, 0)} items
                              {t.note ? ` • ${t.note}` : ""}
                            </div>
                          </div>
                          <button className="btn-primary" onClick={() => {
                            const days = t.days.map(d => ({ id: uid(), name:d.name, exercises: d.exercises.map(x=>({...x})) }));
                            setSplit({ name: t.name, days }); setShowTemplates(false); setTab("log");
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
          <section className="grid gap-6">
            <div className="grid gap-4">
              <h2 className="text-lg sm:text-xl font-semibold">Sessions</h2>
              {!sessions.length ? (
                <div className="text-neutral-400">No sessions yet.</div>
              ) : (
                <div className="grid gap-3">
                  {sessions.map((s) => (
                    <div key={s.id} className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
                      <div className="font-semibold">{s.dayName} — {s.date}</div>
                      <div className="mt-2 grid gap-1 text-sm">
                        {s.entries.map((e, i) => (
                          e.type==="superset" ? (
                            <div key={i} className="text-neutral-300">
                              <div className="font-medium">Superset: {e.name} (x{e.rounds})</div>
                              {(e.items||[]).map((sub, si)=>(
                                <div key={si} className="text-xs text-neutral-400">
                                  {sub.name}: {(sub.sets||[]).map((x, xi) => (
                                    <span key={xi} className="mr-2">[{x.weight || "?"}{units} × {x.reps || "?"}{x.fail ? " F" : ""}]</span>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div key={i} className="text-neutral-300">
                              <div className="font-medium">{e.name}</div>
                              <div className="text-xs text-neutral-400">
                                {e.sets.map((x, xi) => (
                                  <span key={xi} className="mr-2">[{x.weight || "?"}{units} × {x.reps || "?"}{x.fail ? " F" : ""}]</span>
                                ))}
                              </div>
                            </div>
                          )
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

        {/* COACH */}
        {tab === "coach" && (
          <section className="grid gap-4">
            <h2 className="text-lg sm:text-xl font-semibold">Coach</h2>
            <CoachChat units={units} />
          </section>
        )}
      </main>

      <footer className="mt-8 text-center text-[11px] sm:text-xs text-neutral-500 safe-px">
        Works offline • Advice-only AI when online
      </footer>

      {/* Coach note modal */}
      {showCoachNote && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center p-3 z-50">
          <div className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-2xl p-4 max-h-[90vh] overflow-y-auto">
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
          <div className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-2xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="font-semibold">How to: {descFor}</div>
            <div className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap">{descText}</div>
            <div className="mt-3 flex gap-2 justify-end">
              <button className="btn" onClick={() => navigator.clipboard?.writeText(descText)}>Copy</button>
              <button className="btn" onClick={() => {
                const next = { ...notes, [descFor]: (notes[descFor] ? notes[descFor] + "\n\n" : "") + descText };
                setNotes(next); setShowDesc(false);
              }}>Add to exercise note</button>
              <button className="btn-primary" onClick={() => setShowDesc(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Plate math */}
      {plateFor.open && <PlateMath weight={plateFor.weight} units={units} onClose={()=>setPlateFor({ open:false, weight:0 })} />}
    </div>
  );
}

/* ---------- Templates (unchanged style, simple set) ---------- */
const DEFAULT_TEMPLATES = [
  {
    id: "ul-rest-repeat",
    name: "Upper/Lower (Rest-Repeat)",
    note: "Run U/L then rest and repeat.",
    days: [
      { name:"Upper", exercises:[
        { type:"exercise", name:"Bench Press", sets:4, low:5, high:8, equip:"barbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Chest-Supported Row", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound" },
        { type:"exercise", name:"Overhead Press", sets:3, low:6, high:10, equip:"barbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Lat Pulldown", sets:3, low:10, high:12, equip:"machine", group:"pull", cat:"compound" },
        { type:"exercise", name:"Lateral Raise", sets:3, low:12, high:20, equip:"dumbbell", group:"push", cat:"isolation" },
        { type:"exercise", name:"Cable Curl", sets:2, low:10, high:15, equip:"cable", group:"pull", cat:"isolation" }
      ]},
      { name:"Lower", exercises:[
        { type:"exercise", name:"Back Squat", sets:4, low:5, high:8, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Romanian Deadlift", sets:3, low:6, high:10, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Leg Press", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"compound" },
        { type:"exercise", name:"Leg Curl", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"isolation" },
        { type:"exercise", name:"Standing Calf Raise", sets:3, low:12, high:20, equip:"machine", group:"legs", cat:"isolation" }
      ]}
    ]
  },
  {
    id: "ppl-6d",
    name: "PPL • 6×/wk",
    note: "Push / Pull / Legs, repeat.",
    days: [
      { name:"Push A", exercises:[
        { type:"exercise", name:"Barbell Bench Press", sets:4, low:5, high:8, equip:"barbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Incline DB Press", sets:3, low:8, high:12, equip:"dumbbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Cable Fly", sets:3, low:12, high:15, equip:"cable", group:"push", cat:"isolation" },
        { type:"exercise", name:"Overhead Press (Smith)", sets:3, low:6, high:10, equip:"smith", group:"push", cat:"compound" },
        { type:"exercise", name:"Lateral Raise", sets:3, low:12, high:20, equip:"dumbbell", group:"push", cat:"isolation" },
        { type:"exercise", name:"Triceps Rope Pushdown", sets:3, low:10, high:15, equip:"cable", group:"push", cat:"isolation" }
      ]},
      { name:"Pull A", exercises:[
        { type:"exercise", name:"Weighted Pull-up", sets:4, low:5, high:8, equip:"bodyweight", group:"pull", cat:"compound" },
        { type:"exercise", name:"Barbell Row", sets:3, low:6, high:10, equip:"barbell", group:"pull", cat:"compound" },
        { type:"exercise", name:"Lat Pulldown", sets:3, low:10, high:12, equip:"machine", group:"pull", cat:"compound" },
        { type:"exercise", name:"Cable Row", sets:3, low:10, high:12, equip:"cable", group:"pull", cat:"compound" },
        { type:"exercise", name:"Face Pull", sets:3, low:12, high:20, equip:"cable", group:"pull", cat:"isolation" },
        { type:"exercise", name:"DB Curl", sets:3, low:8, high:12, equip:"dumbbell", group:"pull", cat:"isolation" }
      ]},
      { name:"Legs A", exercises:[
        { type:"exercise", name:"Back Squat", sets:4, low:5, high:8, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Romanian Deadlift", sets:3, low:6, high:10, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Leg Press", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"compound" },
        { type:"exercise", name:"Leg Curl", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"isolation" },
        { type:"exercise", name:"Standing Calf Raise", sets:3, low:12, high:20, equip:"machine", group:"legs", cat:"isolation" }
      ]},
      { name:"Push B", exercises:[
        { type:"exercise", name:"Incline Bench Press", sets:4, low:6, high:10, equip:"barbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Seated DB Shoulder Press", sets:3, low:8, high:12, equip:"dumbbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Machine Chest Press", sets:3, low:10, high:12, equip:"machine", group:"push", cat:"compound" },
        { type:"exercise", name:"Cable Lateral Raise", sets:3, low:12, high:20, equip:"cable", group:"push", cat:"isolation" },
        { type:"exercise", name:"Overhead Rope Extension", sets:3, low:10, high:15, equip:"cable", group:"push", cat:"isolation" }
      ]},
      { name:"Pull B", exercises:[
        { type:"exercise", name:"Deadlift (RPE 7)", sets:3, low:3, high:5, equip:"barbell", group:"pull", cat:"compound" },
        { type:"exercise", name:"Chest-Supported Row", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound" },
        { type:"exercise", name:"Single-arm Pulldown", sets:3, low:10, high:15, equip:"cable", group:"pull", cat:"compound" },
        { type:"exercise", name:"Reverse Pec Deck", sets:3, low:12, high:20, equip:"machine", group:"pull", cat:"isolation" },
        { type:"exercise", name:"EZ Bar Curl", sets:3, low:8, high:12, equip:"barbell", group:"pull", cat:"isolation" }
      ]},
      { name:"Legs B", exercises:[
        { type:"exercise", name:"Front Squat", sets:4, low:5, high:8, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Hip Thrust", sets:3, low:8, high:12, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Leg Extension", sets:3, low:12, high:15, equip:"machine", group:"legs", cat:"isolation" },
        { type:"exercise", name:"Seated Calf Raise", sets:3, low:12, high:20, equip:"machine", group:"legs", cat:"isolation" },
        { type:"exercise", name:"Hanging Leg Raise", sets:3, low:10, high:15, equip:"bodyweight", group:"core", cat:"isolation" }
      ]}
    ]
  },
  {
    id: "arnold-6d",
    name: "Arnold (C/B • S/A • Legs)",
    note: "Classic high-volume: Chest+Back, Shoulders+Arms, Legs.",
    days: [
      { name:"Chest + Back", exercises:[
        { type:"exercise", name:"Incline Bench Press", sets:4, low:6, high:10, equip:"barbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Pull-up / Pulldown", sets:4, low:6, high:10, equip:"machine", group:"pull", cat:"compound" },
        { type:"exercise", name:"DB Fly", sets:3, low:10, high:15, equip:"dumbbell", group:"push", cat:"isolation" },
        { type:"exercise", name:"Barbell Row", sets:3, low:6, high:10, equip:"barbell", group:"pull", cat:"compound" }
      ]},
      { name:"Shoulders + Arms", exercises:[
        { type:"exercise", name:"Overhead Press", sets:4, low:6, high:10, equip:"barbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Lateral Raise", sets:4, low:12, high:20, equip:"dumbbell", group:"push", cat:"isolation" },
        { type:"exercise", name:"EZ Curl", sets:3, low:8, high:12, equip:"barbell", group:"pull", cat:"isolation" },
        { type:"exercise", name:"Cable Pushdown", sets:3, low:10, high:15, equip:"cable", group:"push", cat:"isolation" }
      ]},
      { name:"Legs", exercises:[
        { type:"exercise", name:"Squat", sets:4, low:5, high:8, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Leg Press", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"compound" },
        { type:"exercise", name:"Leg Curl", sets:3, low:10, high:15, equip:"machine", group:"legs", cat:"isolation" },
        { type:"exercise", name:"Standing Calf", sets:4, low:12, high:20, equip:"machine", group:"legs", cat:"isolation" }
      ]}
    ]
  },
  {
    id: "fullbody-3d",
    name: "Full Body • 3×/wk",
    note: "Great for busy schedules and beginners/intermediates.",
    days: [
      { name:"Full A", exercises:[
        { type:"exercise", name:"Back Squat", sets:3, low:5, high:8, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Bench Press", sets:3, low:6, high:10, equip:"barbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Lat Pulldown", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound" },
        { type:"exercise", name:"Plank", sets:2, low:30, high:60, equip:"bodyweight", group:"core", cat:"isolation" }
      ]},
      { name:"Full B", exercises:[
        { type:"exercise", name:"Romanian Deadlift", sets:3, low:6, high:10, equip:"barbell", group:"legs", cat:"compound" },
        { type:"exercise", name:"Overhead Press", sets:3, low:6, high:10, equip:"barbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Seated Row", sets:3, low:8, high:12, equip:"machine", group:"pull", cat:"compound" },
        { type:"exercise", name:"Calf Raise", sets:2, low:10, high:15, equip:"machine", group:"legs", cat:"isolation" }
      ]},
      { name:"Full C", exercises:[
        { type:"exercise", name:"Front Squat or Hack Squat", sets:3, low:6, high:10, equip:"machine", group:"legs", cat:"compound" },
        { type:"exercise", name:"Incline DB Press", sets:3, low:8, high:12, equip:"dumbbell", group:"push", cat:"compound" },
        { type:"exercise", name:"Pull-ups or Assisted", sets:3, low:6, high:10, equip:"bodyweight", group:"pull", cat:"compound" },
        { type:"exercise", name:"Cable Curl", sets:2, low:10, high:15, equip:"cable", group:"pull", cat:"isolation" }
      ]}
    ]
  }
];
