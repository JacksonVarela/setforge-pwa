// src/App.jsx — SetForge V5
import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification, signOut,
} from "firebase/auth";
import { initFirebaseApp } from "./firebase";
import ImporterAI from "./components/ImporterAI";
import { chatCoach } from "./utils/ai";

initFirebaseApp();
const auth = getAuth();

const PRESET_TAGS = [
  "tempo 3-1-1",
  "slow eccentric",
  "paused 2s",
  "straps",
  "elbows tucked",
  "wide grip",
  "narrow stance",
  "knees out",
  "brace hard",
];

const CONFIG = {
  unitsDefault: "lb",
  dumbbellStepLb: 2.5,
  barbellStepLb: 5,
  machineStepLb: 1,
  bodyweightStepLb: 5,
  isoPct: 0.015,
  upperPct: 0.0225,
  lowerPct: 0.035,
  isoMinLb: 2,
  upperMinLb: 2.5,
  lowerMinLb: 5,
  isoMinKg: 1,
  upperMinKg: 1.25,
  lowerMinKg: 2.5,
};
const DEFAULT_STATE = (units = CONFIG.unitsDefault) => ({
  units,
  activeSplitId: "",
  splits: [],
  sessions: [],
  tagsLibrary: [...PRESET_TAGS],
});

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const cx = (...a) => a.filter(Boolean).join(" ");
const lsKeyFor = (user) => `setforge_v5_${user?.uid || "guest"}`;
const save = (user, data) => localStorage.setItem(lsKeyFor(user), JSON.stringify(data));
const load = (user) => {
  try {
    const raw = localStorage.getItem(lsKeyFor(user));
    return raw ? JSON.parse(raw) : DEFAULT_STATE();
  } catch { return DEFAULT_STATE(); }
};

// ---- helpers ----
function roundByEquip(weight, equip, units) {
  const step =
    units === "kg"
      ? equip === "machine" ? 1 : equip === "dumbbell" ? 1.25 : equip === "barbell" ? 2.5 : 2.5
      : equip === "machine"
      ? CONFIG.machineStepLb
      : equip === "dumbbell"
      ? CONFIG.dumbbellStepLb
      : equip === "barbell"
      ? CONFIG.barbellStepLb
      : CONFIG.bodyweightStepLb;
  return Math.round(weight / step) * step;
}
function incByCategory(group, isCompound, units, current) {
  // translate to previous categories roughly
  const cat =
    group === "lower" || group === "legs"
      ? "lower_comp"
      : isCompound
      ? "upper_comp"
      : "iso_small";

  const pct = cat === "lower_comp" ? CONFIG.lowerPct : cat === "upper_comp" ? CONFIG.upperPct : CONFIG.isoPct;
  const raw = (+current || 0) * pct;
  const min =
    units === "kg"
      ? cat === "lower_comp" ? CONFIG.lowerMinKg : cat === "upper_comp" ? CONFIG.upperMinKg : CONFIG.isoMinKg
      : cat === "lower_comp" ? CONFIG.lowerMinLb : cat === "upper_comp" ? CONFIG.upperMinLb : CONFIG.isoMinLb;
  return Math.max(raw, min);
}
function bestSetByLoad(sets) {
  if (!sets || !sets.length) return null;
  return sets.slice().sort((a, b) => (+b.w || 0) - (+a.w || 0) || (+b.r || 0) - (+a.r || 0))[0];
}
function topWeight(sets) {
  return sets.reduce((m, s) => Math.max(m, +s.w || 0), 0);
}

// ---------- App ----------
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(DEFAULT_STATE());
  const [tab, setTab] = useState("log"); // log | split | history | prs | coach | import
  const [units, setUnits] = useState(CONFIG.unitsDefault);
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [showImporter, setShowImporter] = useState(false);
  const currentSplit = useMemo(() => data.splits.find((s) => s.id === data.activeSplitId), [data]);
  const [selectedDayId, setSelectedDayId] = useState("");

  useEffect(
    () => onAuthStateChanged(auth, (u) => {
      setUser(u);
      const loaded = load(u);
      setUnits(loaded.units || CONFIG.unitsDefault);
      setData(loaded);
    }),
    []
  );
  useEffect(() => save(user, { ...data, units }), [data, units, user]);

  useEffect(() => {
    if (currentSplit) setSelectedDayId(currentSplit.days?.[0]?.id || "");
  }, [data.activeSplitId]);

  const needsOnboarding = (data.splits?.length || 0) === 0;

  function setActiveSplit(id) {
    setData((prev) => ({ ...prev, activeSplitId: id }));
  }
  function createSplit(name, days) {
    const id = uid();
    const split = { id, name: name || `Split ${(data.splits?.length || 0) + 1}`, days: days || [] };
    setData((prev) => ({ ...prev, splits: [...prev.splits, split], activeSplitId: id }));
  }
  function removeSplit(id) {
    if (!confirm("Delete this split? (sessions stay stored)")) return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.filter((s) => s.id !== id),
      activeSplitId: prev.activeSplitId === id ? "" : prev.activeSplitId,
    }));
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      <div className="mx-auto w-full max-w-screen-sm px-3 py-4">
        <Header units={units} setUnits={setUnits} user={user} setTab={setTab} />
        {!user ? (
          <AuthScreen />
        ) : user && !user.emailVerified ? (
          <VerifyScreen user={user} />
        ) : (
          <>
            {/* Tabs */}
            <nav className="mt-3 flex flex-wrap gap-2">
              <TabBtn onClick={()=>setTab("log")} active={tab==="log"} disabled={!data.activeSplitId}>Log</TabBtn>
              <TabBtn onClick={()=>setTab("split")} active={tab==="split"}>Split</TabBtn>
              <TabBtn onClick={()=>setTab("history")} active={tab==="history"}>Past Sessions</TabBtn>
              <TabBtn onClick={()=>setTab("prs")} active={tab==="prs"}>PRs</TabBtn>
              <TabBtn onClick={()=>setTab("coach")} active={tab==="coach"}>Coach</TabBtn>
              {needsOnboarding && (
                <TabBtn onClick={()=>setTab("import")} active={tab==="import"}>Import</TabBtn>
              )}
            </nav>

            {/* Importer shortcut (even after onboarding) */}
            {!needsOnboarding && tab==="split" && (
              <div className="mt-3">
                <button className="btn-primary" onClick={()=>setShowImporter(true)}>AI Import Split</button>
              </div>
            )}

            {showImporter && (
              <ImporterAI
                onConfirm={({ name, days }) => {
                  createSplit(name, days);
                  setShowImporter(false);
                  setTab("log");
                }}
                onCancel={() => setShowImporter(false)}
              />
            )}

            {needsOnboarding && tab !== "import" && (
              <WelcomeCard onImport={() => setTab("import")} />
            )}

            {tab === "import" && (
              <ImporterAI
                onConfirm={({ name, days }) => {
                  createSplit(name, days);
                  setTab("log");
                }}
                onCancel={() => setTab(needsOnboarding ? "import" : "split")}
              />
            )}

            {tab === "log" && (
              <LogView
                data={data}
                setData={setData}
                currentSplit={currentSplit}
                selectedDayId={selectedDayId}
                setSelectedDayId={setSelectedDayId}
                units={units}
                today={today}
                setToday={setToday}
              />
            )}

            {tab === "split" && (
              <SplitView
                data={data}
                setData={setData}
                setActiveSplit={setActiveSplit}
                createSplit={createSplit}
                removeSplit={removeSplit}
              />
            )}

            {tab === "history" && <HistoryView data={data} />}

            {tab === "prs" && <PRsView data={data} />}

            {tab === "coach" && <CoachView units={units} />}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Small UI bits ----------
function TabBtn({children, active, onClick, disabled}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "px-3 py-2 rounded-xl text-sm",
        active ? "bg-white text-neutral-900" : "bg-neutral-800 border border-neutral-700",
        disabled && "opacity-50"
      )}
    >
      {children}
    </button>
  );
}

function Header({ units, setUnits, user, setTab }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">SetForge</h1>
        <span className="pill">offline-first</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        >
          <option value="lb">lb</option>
          <option value="kg">kg</option>
        </select>
        {user && <SignOutBtn />}
      </div>
    </header>
  );
}
function SignOutBtn() {
  return (
    <button onClick={() => signOut(getAuth())} className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm">
      Sign out
    </button>
  );
}

function WelcomeCard({ onImport }) {
  return (
    <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <h2 className="font-semibold mb-1">Welcome to SetForge</h2>
      <p className="text-sm text-neutral-400">
        Import your plan or build it. Your data stays on device; works offline. AI features need internet.
      </p>
      <div className="mt-2 flex gap-2">
        <button onClick={onImport} className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm">
          Paste / Import
        </button>
        <span className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm">Build Manually</span>
        <span className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm">Templates</span>
      </div>
    </div>
  );
}

// ---------- Auth ----------
function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function go() {
    setBusy(true); setMsg("");
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(getAuth(), email, pw);
      } else {
        const cred = await createUserWithEmailAndPassword(getAuth(), email, pw);
        await sendEmailVerification(cred.user);
        setMsg("Check your inbox for a verification email.");
      }
    } catch (e) {
      setMsg(e.message || "Error");
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-8 rounded-2xl p-0 anime-overlay bg-login">
      <div className="glass-strong p-4 safe-px safe-pt safe-pb min-h-[60svh] flex flex-col justify-center">
        <div className="text-center mb-3">
          <div className="text-2xl font-bold">SetForge</div>
          <div className="text-sm text-neutral-400">
            Sign {mode === "signin" ? "in" : "up"} to get started
          </div>
        </div>
        <div className="grid gap-2 max-w-sm mx-auto w-full">
          <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" />
          <input className="input" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} placeholder="Password (8+ chars)" />
          <button onClick={go} disabled={busy} className="px-3 py-2 rounded-xl bg-white text-neutral-900">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {msg && <div className="text-xs text-neutral-200 text-center">{msg}</div>}
          <button onClick={()=>setMode(mode==="signin"?"signup":"signin")} className="text-xs text-neutral-400 mt-1">
            {mode==="signin"?"No account? Sign up":"Have an account? Sign in"}
          </button>
        </div>
      </div>
    </section>
  );
}
function VerifyScreen({ user }) {
  const [sent, setSent] = useState(false);
  async function resend() {
    try { await sendEmailVerification(user); setSent(true); } catch {}
  }
  return (
    <section className="mt-8 rounded-2xl border border-neutral-800 p-4 text-center">
      <div className="text-lg font-semibold">Verify your email</div>
      <div className="text-sm text-neutral-400">We sent a link to <b>{user.email}</b>. Click it, then refresh this screen.</div>
      <div className="mt-3 flex justify-center gap-2">
        <button onClick={()=>window.location.reload()} className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm">I verified</button>
        <button onClick={resend} className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm">Resend</button>
      </div>
      {sent && <div className="text-xs text-green-400 mt-2">Sent!</div>}
    </section>
  );
}

// ---------- Log ----------
function LogView({ data, setData, currentSplit, selectedDayId, setSelectedDayId, units, today, setToday }) {
  const [draft, setDraft] = useState({});
  const [skipped, setSkipped] = useState({}); // { [exerciseName]: true }
  const [tagPicker, setTagPicker] = useState(null); // { ex, idx } | null

  const day = useMemo(() => {
    if (!currentSplit) return null;
    return currentSplit.days?.find((d) => d.id === selectedDayId) || currentSplit.days?.[0];
  }, [currentSplit, selectedDayId]);

  useEffect(() => {
    if (!day) return;
    const map = {};
    (day.exercises || []).forEach((ex) => {
      map[ex.name] = Array.from({ length: ex.sets || 3 }).map(() => ({
        failed: false, w: "", r: "", tags: [], bw: ex.equip === "bodyweight" // bodyweight toggle default
      }));
    });
    setDraft(map);
    setSkipped({});
  }, [day]);

  if (!currentSplit) {
    return <div className="mt-6 text-sm text-neutral-400">Pick a split first in the Split tab.</div>;
  }

  // Suggestions (weighted by failure & last 3 sessions)
  function historyFor(name) {
    return data.sessions
      .filter((s) => s.splitId === data.activeSplitId)
      .map((s) => s.entries.find((e) => e.exercise === name))
      .filter(Boolean);
  }
  function suggestNext(ex) {
    const hist = historyFor(ex.name);
    if (!hist.length) return null;
    const last = hist[0];
    const lastTop = bestSetByLoad(last.sets) || { w: 0, r: 0, failed: false };
    const last3 = hist.slice(0, 3).map(h => bestSetByLoad(h.sets)).filter(Boolean);
    const avgReps = last3.length ? Math.round(last3.reduce((s, t) => s + (+t.r||0), 0) / last3.length) : (+lastTop.r||0);
    const anyFailed = last3.some(t => !!t.failed);
    const delta = incByCategory(ex.group || "upper", !!ex.isCompound, units, +lastTop.w || 0);

    let next = +lastTop.w || 0;
    if (anyFailed && avgReps < (ex.low || 8)) {
      // keep or deload slightly
      next = roundByEquip(Math.max(0, next - 0.5 * delta), ex.equip || "machine", units);
    } else if (!anyFailed && avgReps >= (ex.high || 12)) {
      next = roundByEquip(next + 1.25 * delta, ex.equip || "machine", units);
    } else if (!anyFailed && avgReps >= (ex.low || 8)) {
      next = roundByEquip(next + 0.5 * delta, ex.equip || "machine", units);
    } else {
      next = roundByEquip(next, ex.equip || "machine", units);
    }
    return { next, basis: { weight: +lastTop.w || 0, reps: +lastTop.r || 0, avgReps, low: ex.low, high: ex.high } };
  }
  function liveSuggest(ex, idx) {
    const s = (draft[ex.name] || [])[idx];
    if (!s) return null;
    const w = +s.w || 0, r = +s.r || 0;
    if (s.bw) return null; // BW mode: no load suggestion
    if (!w || !r) return null;
    const d = incByCategory(ex.group || "upper", !!ex.isCompound, units, w);
    if (s.failed) return roundByEquip(Math.max(0, w - 0.5 * d), ex.equip || "machine", units);
    if (r >= (ex.high || 12)) return roundByEquip(w + d, ex.equip || "machine", units);
    if (r < (ex.low || 8)) return roundByEquip(Math.max(0, w - d), ex.equip || "machine", units);
    return roundByEquip(w, ex.equip || "machine", units);
  }

  function updateSet(ex, idx, patch) {
    setDraft(prev => {
      const arr = [...(prev[ex] || [])];
      const row = { ...(arr[idx] || { failed:false,w:"",r:"",tags:[],bw:false }), ...patch };
      // if bw is toggled on, blank weight
      if (patch.bw === true) row.w = "";
      arr[idx] = row;
      return { ...prev, [ex]: arr };
    });
  }

  function addSet(ex) {
    setDraft(prev => ({
      ...prev,
      [ex]: [...(prev[ex] || []), { failed:false, w:"", r:"", tags:[], bw:false }]
    }));
  }
  function removeSetHere(ex, idx) {
    setDraft(prev => {
      const arr = [...(prev[ex] || [])];
      arr.splice(idx, 1);
      return { ...prev, [ex]: arr.length ? arr : [{ failed:false, w:"", r:"", tags:[], bw:false }] };
    });
  }

  function skipToday(exName) {
    setSkipped(prev => ({ ...prev, [exName]: true }));
  }
  function undoSkip(exName) {
    setSkipped(prev => {
      const n = { ...prev }; delete n[exName]; return n;
    });
  }
  function addTodayExercise() {
    const name = prompt("Exercise name");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const equip = prompt("Equip barbell|dumbbell|machine|cable|smith|bodyweight", "machine") || "machine";
    const group = prompt("Group upper|lower|push|pull|legs|core|neck|forearms", "upper") || "upper";
    const isCompound = (prompt("Compound? y/n", "n") || "n").toLowerCase().startsWith("y");
    // don't mutate split; just add to draft map
    setDraft(prev => ({ ...prev, [name]: Array.from({ length: sets }).map(()=>({failed:false,w:"",r:"",tags:[],bw:equip==="bodyweight"})) }));
    alert(`Added "${name}" for today only (does not change split).`);
  }

  function saveSession() {
    if (!currentSplit || !day) { alert("Pick a split/day first"); return; }
    // Build entries from all current visible exercises (plus ad-hoc in draft not in day)
    const exerciseNames = new Set([
      ...(day.exercises || []).map(e => e.name),
      ...Object.keys(draft || {})
    ]);
    const entries = [];
    for (const name of exerciseNames) {
      if (skipped[name]) continue;
      const meta = (day.exercises || []).find(e => e.name === name) || { name, sets: (draft[name]?.length || 1), low:8, high:12, equip:"machine", group:"upper", isCompound:false };
      const arr = (draft[name] || []).filter(s => (s.bw || s.w === "0" || s.w === 0 || +s.w > -99999) && +s.r > 0);
      if (!arr.length) continue;
      const sets = arr.map(s => ({ failed: !!s.failed, w: s.bw ? 0 : +s.w, r: +s.r, tags: s.tags || [] }));
      entries.push({
        exercise: name,
        sets,
        units,
        // volume removed (per your request); keep zero for backward compat if needed:
        volume: 0,
      });
    }
    if (!entries.length) { alert("No sets to save yet"); return; }

    const session = {
      id: uid(),
      splitId: data.activeSplitId,
      dateISO: today,
      dayId: day.id,
      dayName: day.name,
      entries,
      units,
    };
    setData(prev => ({ ...prev, sessions: [session, ...prev.sessions] }));

    // Fire-and-forget advice (ok if offline)
    try {
      fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day: day.name, units, session,
          recent: data.sessions.filter(s => s.splitId === data.activeSplitId).slice(0, 6),
        }),
      });
    } catch {}
    alert("Session saved");
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-400">Split</label>
          <select
            value={currentSplit?.id || ""}
            onChange={(e) => setData(prev => ({ ...prev, activeSplitId: e.target.value }))}
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          >
            {data.splits.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="text-xs text-neutral-400 ml-2">Day</label>
          <select
            value={day?.id || ""}
            onChange={(e) => setSelectedDayId(e.target.value)}
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          >
            {(currentSplit?.days || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <label className="text-xs text-neutral-400 ml-2">Date</label>
          <input type="date" value={today} onChange={(e)=>setToday(e.target.value)} className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={addTodayExercise}>+ Add exercise (today)</button>
          <button className="btn-primary" onClick={saveSession}>Save session</button>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {((day?.exercises || []).length === 0 && Object.keys(draft).length === 0) && (
          <div className="text-neutral-500">No exercises yet — add some in Split or add for today.</div>
        )}
        {[...(day?.exercises || []).map(e => ({...e, _fromSplit:true})),
          ...Object.keys(draft).filter(n => !(day?.exercises||[]).some(x => x.name===n)).map(n => ({ name:n, sets:(draft[n]?.length||1), low:8, high:12, equip:"machine", group:"upper", isCompound:false, _fromSplit:false }))
        ].map((exItem) => {
          const ex = exItem.name;
          const sets = draft[ex] || [];
          const sug = suggestNext(exItem);

          return skipped[ex] ? (
            <div key={ex} className="rounded-xl border border-neutral-800 p-3 text-neutral-400">
              Skipped: <b>{ex}</b> <button className="ml-2 text-xs underline" onClick={()=>undoSkip(ex)}>Undo</button>
            </div>
          ) : (
            <div key={ex} className="rounded-xl border border-neutral-800 p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-base">{ex}</div>
                <div className="text-xs text-neutral-400">
                  {exItem.low}–{exItem.high} reps · {exItem.equip}{exItem.isCompound ? " • compound":""}
                </div>
              </div>

              {sug && (
                <div className="mt-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1">
                  Next time: <b>{sug.next} {units}</b>{" "}
                  <span className="text-neutral-400">(last {sug.basis.weight}{units}×{sug.basis.reps}, avg {sug.basis.avgReps})</span>
                </div>
              )}

              <div className="mt-2 grid gap-2">
                {sets.map((s, idx) => {
                  const live = liveSuggest(exItem, idx);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <label className="col-span-3 text-[11px] text-neutral-300 flex items-center gap-1">
                        <input type="checkbox" checked={!!s.failed} onChange={()=>updateSet(ex, idx, { failed: !s.failed })}/> failure
                      </label>
                      {exItem.equip === "bodyweight" || s.bw ? (
                        <button className={cx("col-span-4 px-3 py-2 rounded-lg border", s.bw ? "bg-white text-neutral-900 border-white":"bg-neutral-800 border-neutral-700")}
                                onClick={()=>updateSet(ex, idx, { bw: !s.bw })}>
                          {s.bw ? "Bodyweight" : "Use BW"}
                        </button>
                      ) : (
                        <input type="number" inputMode="decimal" placeholder={`${units}`} value={s.w}
                               onChange={(e)=>updateSet(ex, idx, { w: e.target.value })}
                               className="col-span-4 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700" />
                      )}
                      <input type="number" inputMode="numeric" placeholder="reps" value={s.r}
                             onChange={(e)=>updateSet(ex, idx, { r: e.target.value })}
                             className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700" />
                      <button onClick={()=>removeSetHere(ex, idx)} className="col-span-2 text-red-400">✕</button>

                      <div className="col-span-12 text-[11px] text-neutral-300 flex flex-wrap gap-1">
                        <button className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700" onClick={()=>setTagPicker({ex, idx})}>Tags…</button>
                        {((s.tags||[]).slice(0,5)).map(t => <span key={t} className="pill">{t}</span>)}
                        {s.tags?.length > 5 && <span className="pill">+{s.tags.length - 5} more</span>}
                      </div>
                      {live !== null && (
                        <div className="col-span-12 text-[11px] text-neutral-400">
                          Next set: <b className="text-neutral-100">{live} {units}</b>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <button onClick={()=>addSet(ex)} className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm">Add set</button>
                  <button onClick={()=>skipToday(ex)} className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm">Skip today</button>
                </div>
              </div>

              <ChartToggle ex={ex} chartDataFor={chartDataFor(data)} />
            </div>
          );
        })}
      </div>

      {tagPicker && (
        <TagPicker
          value={(draft[tagPicker.ex]?.[tagPicker.idx]?.tags) || []}
          library={data.tagsLibrary || PRESET_TAGS}
          onClose={()=>setTagPicker(null)}
          onSave={(nextTags)=>{
            const {ex, idx} = tagPicker;
            setDraft(prev=>{
              const arr = [...(prev[ex]||[])];
              const row = { ...(arr[idx] || {}) };
              row.tags = nextTags;
              arr[idx] = row;
              return { ...prev, [ex]: arr };
            });
            // expand library with any new tags
            const newOnes = nextTags.filter(t => !(data.tagsLibrary||[]).includes(t));
            if (newOnes.length) setData(prev => ({ ...prev, tagsLibrary: [...(prev.tagsLibrary||[]), ...newOnes] }));
            setTagPicker(null);
          }}
        />
      )}
    </section>
  );
}

function TagPicker({ value, library, onSave, onClose }) {
  const [sel, setSel] = useState(new Set(value || []));
  const [custom, setCustom] = useState("");
  function toggle(t) {
    const n = new Set(sel);
    n.has(t) ? n.delete(t) : n.add(t);
    setSel(n);
  }
  function addCustom() {
    const t = custom.trim();
    if (!t) return;
    setSel(new Set([...sel, t]));
    setCustom("");
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-3 z-50">
      <div className="glass-strong w-full max-w-sm p-3 rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Tags</div>
          <button className="text-neutral-400" onClick={onClose}>✕</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {library.map(t => (
            <button key={t} onClick={()=>toggle(t)} className={cx("px-2 py-1 rounded-lg border text-sm",
              sel.has(t) ? "bg-white text-neutral-900 border-white" : "bg-neutral-800 border-neutral-700")}>
              {t}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input className="input flex-1" value={custom} onChange={(e)=>setCustom(e.target.value)} placeholder="custom tag" />
          <button className="btn" onClick={addCustom}>Add</button>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={()=>onSave(Array.from(sel))}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Split ----------
function SplitView({ data, setData, setActiveSplit, createSplit, removeSplit }) {
  function addDay(splitId) {
    const name = prompt("Day name", "Day");
    if (!name) return;
    setData(prev => ({
      ...prev,
      splits: prev.splits.map(s => s.id === splitId ? { ...s, days: [...(s.days||[]), { id: uid(), name, exercises: [] }] } : s)
    }));
  }
  function addExercise(splitId, dayId) {
    const name = prompt("Exercise name");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const equip = prompt("Equip barbell|dumbbell|machine|cable|smith|bodyweight", "machine") || "machine";
    const group = prompt("Group upper|lower|push|pull|legs|core|neck|forearms", "upper") || "upper";
    const isCompound = (prompt("Compound? y/n", "n") || "n").toLowerCase().startsWith("y");
    setData(prev => ({
      ...prev,
      splits: prev.splits.map(s => s.id === splitId ? {
        ...s,
        days: s.days.map(d => d.id === dayId ? { ...d, exercises: [...(d.exercises||[]), { name, sets, low, high, equip, group, isCompound }] } : d)
      } : s)
    }));
  }
  function moveExercise(splitId, dayId, idx, dir) {
    setData(prev => ({
      ...prev,
      splits: prev.splits.map(s => s.id !== splitId ? s : {
        ...s,
        days: s.days.map(d => d.id !== dayId ? d : (() => {
          const list = [...(d.exercises||[])];
          const ni = idx + (dir === "up" ? -1 : 1);
          if (ni < 0 || ni >= list.length) return d;
          const tmp = list[idx]; list[idx] = list[ni]; list[ni] = tmp;
          return { ...d, exercises: list };
        })())
      })
    }));
  }
  function editExercise(splitId, dayId, idx) {
    setData(prev => {
      const s = prev.splits.find(x => x.id === splitId);
      const d = s.days.find(x => x.id === dayId);
      const e = { ...d.exercises[idx] };
      const name = prompt("Exercise name", e.name) || e.name;
      const sets = Number(prompt("Sets", String(e.sets)) || e.sets);
      const low = Number(prompt("Low reps", String(e.low)) || e.low);
      const high = Number(prompt("High reps", String(e.high)) || e.high);
      const equip = prompt("Equip barbell|dumbbell|machine|cable|smith|bodyweight", e.equip) || e.equip;
      const group = prompt("Group upper|lower|push|pull|legs|core|neck|forearms", e.group || "upper") || e.group || "upper";
      const isCompound = (prompt("Compound? y/n", e.isCompound ? "y" : "n") || (e.isCompound ? "y" : "n")).toLowerCase().startsWith("y");
      const newSplits = prev.splits.map(sp =>
        sp.id !== splitId ? sp : {
          ...sp,
          days: sp.days.map(dd =>
            dd.id !== dayId ? dd : {
              ...dd,
              exercises: dd.exercises.map((x, i) => i !== idx ? x : { name, sets, low, high, equip, group, isCompound })
            }
          )
        }
      );
      return { ...prev, splits: newSplits };
    });
  }
  function removeExercise(splitId, dayId, idx) {
    setData(prev => ({
      ...prev,
      splits: prev.splits.map(sp => sp.id !== splitId ? sp : {
        ...sp,
        days: sp.days.map(dd => dd.id !== dayId ? dd : { ...dd, exercises: dd.exercises.filter((_, i) => i !== idx) })
      })
    }));
  }
  function renameSplit(id) {
    const name = prompt("Split name", data.splits.find(s => s.id === id)?.name || "");
    if (!name) return;
    setData(prev => ({ ...prev, splits: prev.splits.map(s => s.id === id ? { ...s, name } : s) }));
  }
  function resetSplit(id) {
    if (!confirm("Reset this split (remove all days/exercises)?")) return;
    setData(prev => ({ ...prev, splits: prev.splits.map(s => s.id === id ? { ...s, days: [] } : s) }));
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="grid gap-3">
        {data.splits.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{s.name}</div>
              <div className="flex gap-2">
                {data.activeSplitId === s.id ? (
                  <span className="text-xs text-green-400">Active</span>
                ) : (
                  <button onClick={() => setActiveSplit(s.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                    Set active
                  </button>
                )}
                <button onClick={() => renameSplit(s.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">Rename</button>
                <button onClick={() => resetSplit(s.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">Reset</button>
                <button onClick={() => removeSplit(s.id)} className="px-2 py-1 rounded text-red-400 text-xs">Delete</button>
              </div>
            </div>

            <div className="mt-2 grid gap-2">
              {(s.days || []).map((d) => (
                <div key={d.id} className="rounded-lg border border-neutral-800 p-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{d.name}</div>
                    <div className="flex gap-2">
                      <button onClick={() => addExercise(s.id, d.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">Add exercise</button>
                      <button onClick={() => addDay(s.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">Add day</button>
                    </div>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {(d.exercises || []).map((e, i) => (
                      <li key={i} className="flex items-center justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1">
                        <span>
                          {e.name}{" "}
                          <span className="text-neutral-500">
                            ({e.sets}×{e.low}–{e.high} • {e.equip}{e.isCompound ? ", compound" : ""}{e.group ? `, ${e.group}` : ""})
                          </span>
                        </span>
                        <span className="flex gap-1">
                          <button onClick={() => moveExercise(s.id, d.id, i, "up")} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">↑</button>
                          <button onClick={() => moveExercise(s.id, d.id, i, "down")} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">↓</button>
                          <button onClick={() => editExercise(s.id, d.id, i)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">Edit</button>
                          <button onClick={() => removeExercise(s.id, d.id, i)} className="px-2 py-1 rounded text-red-400 text-xs">Remove</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button onClick={() => addDay(s.id)} className="mt-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm">Add day</button>
          </div>
        ))}
        {data.splits.length === 0 && <div className="text-neutral-500">No splits yet</div>}
      </div>
    </section>
  );
}

// ---------- History ----------
function HistoryView({ data }) {
  const activeId = data.activeSplitId;
  const items = data.sessions.filter((s) => s.splitId === activeId);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const x = q.trim().toLowerCase();
    if (!x) return items;
    return items.filter(
      (s) =>
        s.dayName.toLowerCase().includes(x) ||
        s.entries.some((e) => e.exercise.toLowerCase().includes(x))
    );
  }, [q, items]);
  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by day/exercise" className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm" />
        <div className="text-xs text-neutral-400 whitespace-nowrap">{filtered.length} sessions</div>
      </div>
      <div className="mt-3 grid gap-2">
        {activeId ? null : <div className="text-neutral-500">Pick an active split to see past sessions.</div>}
        {activeId && filtered.length === 0 && <div className="text-neutral-500">No sessions yet for this split</div>}
        {filtered.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">{s.dateISO} · {s.dayName}</div>
              <div className="text-neutral-400">{s.entries.length} exercises</div>
            </div>
            <div className="mt-2 grid gap-1 text-xs">
              {s.entries.map((e, i) => (
                <div key={i} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                  <div className="font-medium">{e.exercise}</div>
                  <div className="text-neutral-300">
                    {e.sets.map(t => `${t.failed ? "✖ " : ""}${t.w}${s.units}×${t.r}${t.tags?.length ? ` [${t.tags.join(", ")}]` : ""}`).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- PRs ----------
function PRsView({ data }) {
  const activeId = data.activeSplitId;
  const sessions = data.sessions.filter(s => s.splitId === activeId);
  const bests = {};
  for (const s of sessions) {
    for (const e of s.entries) {
      const top = bestSetByLoad(e.sets);
      if (!top) continue;
      const k = e.exercise;
      const w = +top.w || 0;
      if (!bests[k] || w > bests[k].w || (w === bests[k].w && (+top.r||0) > (bests[k].r||0))) {
        bests[k] = { w, r: +top.r||0, date: s.dateISO, units: s.units };
      }
    }
  }
  const rows = Object.keys(bests).sort().map(k => ({ exercise:k, ...bests[k] }));
  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="font-semibold mb-2">Personal Records</div>
      {rows.length === 0 ? <div className="text-neutral-500">No PRs yet.</div> : (
        <div className="grid gap-2">
          {rows.map(r => (
            <div key={r.exercise} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2 flex items-center justify-between">
              <div className="font-medium">{r.exercise}</div>
              <div className="text-sm text-neutral-300">{r.w}{r.units} × {r.r} <span className="pill ml-2">PR · {r.date}</span></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- Coach ----------
function CoachView({ units }) {
  const [messages, setMessages] = useState([{ role:"assistant", content:"Hey! I’m your SetForge Coach. Ask about training, diet, or how to use any part of the app." }]);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("training"); // training | nutrition | app
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = q.trim();
    if (!text) return;
    setMessages(m => [...m, { role:"user", content:text }]);
    setQ(""); setBusy(true);
    try {
      const reply = await chatCoach(messages.concat({role:"user", content:text}), { mode, units });
      setMessages(m => [...m, { role:"assistant", content: reply }]);
    } catch {
      setMessages(m => [...m, { role:"assistant", content: "Coach is offline. Try again later." }]);
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-0 relative overflow-hidden">
      {/* coach hero / sticker */}
      <div className="absolute right-3 bottom-3 hidden sm:block">
        <div className="coach-sticker" style={{
          backgroundImage: `url('/images/chat-coach.webp'), url('/images/chat-coach.png')`
        }} />
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Coach</div>
          <select className="input w-auto" value={mode} onChange={(e)=>setMode(e.target.value)}>
            <option value="training">Training</option>
            <option value="nutrition">Nutrition</option>
            <option value="app">App help</option>
          </select>
        </div>

        <div className="mt-3 rounded-xl bg-neutral-900 border border-neutral-800 p-3 h-80 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={cx("mb-2", m.role==="user"?"text-right":"text-left")}>
              <div className={cx("inline-block px-3 py-2 rounded-xl", m.role==="user"?"bg-white text-neutral-900":"bg-neutral-800 border border-neutral-700")}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs text-neutral-400">Coach is thinking…</div>}
        </div>

        <div className="mt-2 flex gap-2">
          <input className="input flex-1" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Ask your coach…" onKeyDown={(e)=>{ if(e.key==="Enter") send(); }} />
          <button className="btn-primary" onClick={send} disabled={busy}>Send</button>
        </div>
      </div>
    </section>
  );
}

// ---------- Charts ----------
function chartDataFor(data) {
  return function (exName) {
    const rows = [];
    for (const s of [...data.sessions].reverse()) {
      if (s.splitId !== data.activeSplitId) continue;
      const e = s.entries.find((x) => x.exercise === exName);
      if (!e) continue;
      const top = bestSetByLoad(e.sets);
      if (top) rows.push({ date: s.dateISO, weight: Number(top.w) });
    }
    return rows;
  };
}
function ChartToggle({ ex, chartDataFor }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <button onClick={() => setShow(v => !v)} className="mt-2 text-[11px] px-2 py-1 rounded bg-neutral-800 border border-neutral-700">
        {show ? "Hide chart" : "Show chart"}
      </button>
      {show && (
        <div className="mt-2 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataFor(ex)} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
              <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 10 }} />
              <YAxis stroke="#a3a3a3" tick={{ fontSize: 10 }} />
              <Tooltip wrapperStyle={{ backgroundColor: "#111", border: "1px solid #444" }}
                       labelStyle={{ color: "#ddd" }} itemStyle={{ color: "#ddd" }} />
              <Line type="monotone" dataKey="weight" dot={false} stroke="#ffffff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
