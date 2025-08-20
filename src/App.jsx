// SetForge — V5 core
import React, { useEffect, useMemo, useState } from "react";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { initFirebaseApp } from "./firebase";
import CoachChat from "./components/CoachChat";

initFirebaseApp();
const auth = getAuth();

/* -------------------------
   Config / helpers
------------------------- */
const PRESET_TAGS = [
  "slow eccentric",
  "paused 2s",
  "straps",
  "elbows tucked",
  "wide grip",
  "knees out",
  "brace hard",
  "full ROM",
];

const CONFIG = {
  unitsDefault: "lb",
  stepsLb: { barbell: 5, dumbbell: 2.5, machine: 1, bodyweight: 5, cable: 1, smith: 5 },
  stepsKg: { barbell: 2.5, dumbbell: 1.25, machine: 1, bodyweight: 2.5, cable: 1, smith: 2.5 },
  isoPct: 0.015,
  upperPct: 0.0225,
  lowerPct: 0.035,
  isoMin: { lb: 2, kg: 1 },
  upperMin: { lb: 2.5, kg: 1.25 },
  lowerMin: { lb: 5, kg: 2.5 },
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const cx = (...a) => a.filter(Boolean).join(" ");
const lsKeyFor = (user) => `setforge_v5_${user?.uid || "guest"}`;
const save = (user, data) => localStorage.setItem(lsKeyFor(user), JSON.stringify(data));
const load = (user) => {
  try {
    const raw = localStorage.getItem(lsKeyFor(user));
    return raw ? JSON.parse(raw) : DEFAULT_STATE();
  } catch {
    return DEFAULT_STATE();
  }
};

const DEFAULT_STATE = (units = CONFIG.unitsDefault) => ({
  units,
  activeSplitId: "",
  splits: [],
  sessions: [],
});

/* -------------------------
   Guessers / parsing
------------------------- */
function guessEquip(name) {
  const n = name.toLowerCase();
  if (n.includes("smith")) return "smith";
  if (n.includes("barbell") || /\bbb\b/.test(n)) return "barbell";
  if (n.includes("dumbbell") || /\bdb\b/.test(n)) return "dumbbell";
  if (n.includes("cable") || n.includes("pulldown") || n.includes("rope")) return "cable";
  if (n.includes("hanging") || n.includes("push-up") || n.includes("dip")) return "bodyweight";
  if (n.includes("machine") || n.includes("leg press") || n.includes("pec deck")) return "machine";
  return "machine";
}
function guessGroup(name) {
  const n = name.toLowerCase();
  if (/(squat|deadlift|leg press|rdl|split squat|hamstring|quad|calf)/.test(n)) return "lower";
  if (/(bench|press|row|pulldown|pullup|curl|triceps|lateral|shoulder|chest|back)/.test(n)) return "upper";
  if (/(abs|core|crunch|leg raise|plank)/.test(n)) return "core";
  if (/(neck)/.test(n)) return "neck";
  if (/(forearm|wrist)/.test(n)) return "forearms";
  return "upper";
}
function isCompound(name) {
  const n = name.toLowerCase();
  return /(squat|deadlift|bench|row|press|pulldown|pullup|dip)/.test(n);
}

// Parse “free-form” split text. Headings become days, bullet/lines become exercises.
// Accepts lines like: "Incline DB Press — 3 × 6–10"
function parseSplitText(raw) {
  const lines = String(raw || "").replace(/\r/g, "").split(/\n+/);
  const days = [];
  let cur = null;
  const heading = /^([A-Za-z].{0,40})$/;
  const exLine = /^(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[\s•*\-\d.)]+/, "").trim();
    if (!line) continue;

    // “Day-like” headings: short line, no ×, no digits looks like a title
    if (!/×|x|\d/.test(line) && heading.test(line)) {
      cur = { id: uid(), name: line.toUpperCase(), exercises: [] };
      days.push(cur);
      continue;
    }

    const m = line.match(exLine);
    if (m) {
      const name = m[1].trim();
      const sets = +m[2];
      const low = +m[3];
      const high = +(m[4] || m[3]);
      const item = {
        name,
        sets,
        low,
        high,
        equip: guessEquip(name),
        group: guessGroup(name),
        cat: isCompound(name) ? "compound" : "isolation",
      };
      if (!cur) {
        cur = { id: uid(), name: "DAY 1", exercises: [] };
        days.push(cur);
      }
      cur.exercises.push(item);
    } else {
      // If we fail to parse, treat as exercise with default 3x8–12
      if (!cur) {
        cur = { id: uid(), name: "DAY 1", exercises: [] };
        days.push(cur);
      }
      cur.exercises.push({
        name: line,
        sets: 3,
        low: 8,
        high: 12,
        equip: guessEquip(line),
        group: guessGroup(line),
        cat: isCompound(line) ? "compound" : "isolation",
      });
    }
  }
  return days;
}

/* -------------------------
   Math / suggestions
------------------------- */
function roundByEquip(weight, equip, units) {
  const step = (units === "kg" ? CONFIG.stepsKg : CONFIG.stepsLb)[equip] || (units === "kg" ? 1 : 2.5);
  return Math.round((+weight || 0) / step) * step;
}
function incByCategory(cat, units, current) {
  const pct = cat === "compound" ? CONFIG.upperPct : CONFIG.isoPct;
  // crude tweak: lower body compound bumps more
  const lowerBoost = cat === "compound" ? 1.0 : 1.0;
  const raw = (+current || 0) * pct * lowerBoost;
  const mins = cat === "compound" ? CONFIG.upperMin : CONFIG.isoMin;
  return Math.max(raw, mins[units]);
}

/* ============ APP ============ */
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(DEFAULT_STATE());
  const [tab, setTab] = useState("split"); // split | log | sessions | templates | import | coach
  const [units, setUnits] = useState(CONFIG.unitsDefault);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    const loaded = load(u);
    setUnits(loaded.units || CONFIG.unitsDefault);
    setData(loaded);
  }), []);

  useEffect(() => save(user, { ...data, units }), [user, data, units]);

  const activeSplit = useMemo(
    () => data.splits.find((s) => s.id === data.activeSplitId),
    [data]
  );

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      <div className="mx-auto w-full max-w-screen-sm px-3 py-4">
        <Header units={units} setUnits={setUnits} user={user} />

        {!user ? (
          <AuthScreen />
        ) : user && !user.emailVerified ? (
          <VerifyScreen user={user} />
        ) : (
          <>
            {/* Tabs */}
            <nav className="mt-3 grid grid-cols-5 gap-2">
              <NavBtn label="Split" onClick={() => setTab("split")} active={tab === "split"} />
              <NavBtn label="Log" onClick={() => setTab("log")} active={tab === "log"} disabled={!data.activeSplitId}/>
              <NavBtn label="Sessions" onClick={() => setTab("sessions")} active={tab === "sessions"} />
              <NavBtn label="Templates" onClick={() => setTab("templates")} active={tab === "templates"} />
              <NavBtn label="Import" onClick={() => setTab("import")} active={tab === "import"} />
            </nav>

            <div className="mt-4" />

            {tab === "split" && (
              <SplitTab
                data={data}
                setData={setData}
              />
            )}

            {tab === "log" && (
              <LogTab
                data={data}
                setData={setData}
                units={units}
              />
            )}

            {tab === "sessions" && <SessionsTab data={data} />}

            {tab === "templates" && (
              <TemplatesTab
                data={data}
                setData={setData}
              />
            )}

            {tab === "import" && (
              <ImportTab
                onUse={(name, raw) => {
                  const days = parseSplitText(raw);
                  if (!days.length) return alert("Couldn’t parse your text. Try simpler lines like: Name — 3 × 8–12");
                  const id = uid();
                  setData((prev) => ({
                    ...prev,
                    splits: [...prev.splits, { id, name, days }],
                    activeSplitId: id,
                  }));
                }}
              />
            )}

            {tab === "coach" && (
              <CoachChat units={units} />
            )}

            <footer className="text-center text-[10px] text-neutral-500 mt-6">
              Works offline · Advice-only AI when online
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------
   Header / Auth
------------------------- */
function Header({ units, setUnits, user }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold">SetForge</h1>
        <p className="text-xs text-neutral-400">Offline lift tracker</p>
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
        <button onClick={() => window.location.pathname = "/"} className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm" onMouseDown={(e)=>e.preventDefault()} onClickCapture={() => {}}>
          {/* spacer to keep layout stable */}
        </button>
        {user ? (
          <button
            onClick={() => signOut(getAuth())}
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function go() {
    setBusy(true);
    setMsg("");
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fullscreen bg-login anime-overlay relative rounded-2xl border border-neutral-800 p-4 flex items-center">
      {/* bottom-right sticker, non-blocking */}
      <div className="coach-sticker" />
      <div className="glass-strong w-full max-w-sm mx-auto p-4">
        <div className="text-center mb-3">
          <div className="text-2xl font-bold">SetForge</div>
          <div className="text-sm text-neutral-400">
            Sign {mode === "signin" ? "in" : "up"} to get started
          </div>
        </div>
        <div className="grid gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="input"
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password (8+ chars)"
            className="input"
          />
          <button onClick={go} disabled={busy} className="btn-primary">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {msg && <div className="text-xs text-neutral-300">{msg}</div>}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-xs text-neutral-400 mt-1"
          >
            {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
        <p className="text-[10px] text-neutral-500 mt-3">
          Email verification required. We use Firebase Auth free tier.
        </p>
      </div>
    </section>
  );
}

function VerifyScreen({ user }) {
  const [sent, setSent] = useState(false);
  async function resend() {
    try {
      await sendEmailVerification(user);
      setSent(true);
    } catch {}
  }
  return (
    <section className="mt-8 rounded-2xl border border-neutral-800 p-4 text-center">
      <div className="text-lg font-semibold">Verify your email</div>
      <div className="text-sm text-neutral-400">
        We sent a link to <b>{user.email}</b>. Click it, then refresh this screen.
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
        >
          I verified
        </button>
        <button
          onClick={resend}
          className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
        >
          Resend
        </button>
      </div>
      {sent && <div className="text-xs text-green-400 mt-2">Sent!</div>}
    </section>
  );
}

function NavBtn({ label, onClick, active, disabled }) {
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
      {label}
    </button>
  );
}

/* -------------------------
   Split tab
------------------------- */
function SplitTab({ data, setData }) {
  function addManual() {
    const name = prompt("Split name", `Split ${data.splits.length + 1}`);
    if (!name) return;
    const id = uid();
    setData((prev) => ({
      ...prev,
      splits: [...prev.splits, { id, name, days: [] }],
      activeSplitId: id,
    }));
  }

  function addDay(splitId) {
    const name = prompt("Day name", "DAY");
    if (!name) return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((s) =>
        s.id === splitId ? { ...s, days: [...(s.days || []), { id: uid(), name, exercises: [] }] } : s
      ),
    }));
  }

  function addExercise(splitId, dayId) {
    const name = prompt("Exercise name");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const equip = prompt("Equip barbell|dumbbell|machine|cable|smith|bodyweight", guessEquip(name)) || guessEquip(name);
    const cat = isCompound(name) ? "compound" : "isolation";
    const group = guessGroup(name);
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((s) =>
        s.id === splitId
          ? {
              ...s,
              days: s.days.map((d) =>
                d.id === dayId
                  ? { ...d, exercises: [...d.exercises, { name, sets, low, high, equip, cat, group }] }
                  : d
              ),
            }
          : s
      ),
    }));
  }

  function removeSplit(id) {
    if (!confirm("Delete this split? Sessions remain in history.")) return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.filter((s) => s.id !== id),
      activeSplitId: prev.activeSplitId === id ? "" : prev.activeSplitId,
    }));
  }

  function setActive(id) {
    if (data.activeSplitId && data.activeSplitId !== id) {
      const currentName = data.splits.find((s) => s.id === data.activeSplitId)?.name || "current split";
      const nextName = data.splits.find((s) => s.id === id)?.name || "new split";
      const ok = confirm(`Switch active split?\nCurrent: ${currentName}\nNew: ${nextName}`);
      if (!ok) return;
    }
    setData((prev) => ({ ...prev, activeSplitId: id }));
  }

  return (
    <section className="rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-neutral-300">Your splits</div>
        <div className="flex gap-2">
          <button onClick={addManual} className="btn">Build manually</button>
          <button onClick={() => window.scrollTo({ top: 0 })} className="btn" onMouseDown={(e)=>e.preventDefault()} />
        </div>
      </div>
      <div className="grid gap-3">
        {data.splits.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{s.name}</div>
              <div className="flex gap-2">
                {data.activeSplitId === s.id ? (
                  <span className="text-xs text-green-400">Active</span>
                ) : (
                  <button onClick={() => setActive(s.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                    Set active
                  </button>
                )}
                <button onClick={() => removeSplit(s.id)} className="px-2 py-1 rounded text-red-400 text-xs">
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-2 grid gap-2">
              {(s.days || []).map((d) => (
                <div key={d.id} className="rounded-lg border border-neutral-800 p-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{d.name}</div>
                    <div className="flex gap-2">
                      <button onClick={() => addExercise(s.id, d.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                        Add exercise
                      </button>
                    </div>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {d.exercises.map((e, i) => (
                      <li key={i} className="flex items-center justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1">
                        <span>
                          {e.name}{" "}
                          <span className="text-neutral-500">
                            ({e.sets}×{e.low}–{e.high} • {e.equip}, {e.cat})
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <button onClick={() => addDay(s.id)} className="mt-2 btn">Add day</button>
          </div>
        ))}
        {data.splits.length === 0 && <div className="text-neutral-500">No splits yet</div>}
      </div>
    </section>
  );
}

/* -------------------------
   Log tab (working)
------------------------- */
function LogTab({ data, setData, units }) {
  const split = data.splits.find((s) => s.id === data.activeSplitId);
  const [dayId, setDayId] = useState(split?.days?.[0]?.id || "");
  useEffect(() => setDayId(split?.days?.[0]?.id || ""), [split?.id]);

  const day = split?.days?.find((d) => d.id === dayId);
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));

  // Build draft sets for today (including “for today only” ad hoc exercises)
  const baseExercises = day?.exercises || [];
  const [extraToday, setExtraToday] = useState([]); // [{name,sets,low,high,equip,cat,group,bodyweight?}]
  const allExercises = [...baseExercises, ...extraToday];

  const initialDraft = useMemo(() => {
    const map = {};
    for (const ex of allExercises) {
      map[ex.name] = Array.from({ length: ex.sets || 1 }).map(() => ({
        failed: false,
        w: ex.bodyweight ? "BW" : "",
        r: "",
        tags: [],
      }));
    }
    return map;
  }, [dayId, allExercises]);
  const [draft, setDraft] = useState(initialDraft);
  useEffect(() => setDraft(initialDraft), [initialDraft]);

  function addTodayExercise() {
    const name = prompt("Exercise name");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const equip = prompt("Equip barbell|dumbbell|machine|cable|smith|bodyweight", guessEquip(name)) || guessEquip(name);
    const cat = isCompound(name) ? "compound" : "isolation";
    const group = guessGroup(name);
    const bodyweight = equip === "bodyweight";
    setExtraToday((x) => [...x, { name, sets, low, high, equip, cat, group, bodyweight }]);
  }

  function removeTodayExercise(name) {
    setExtraToday((xs) => xs.filter((x) => x.name !== name));
    setDraft((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function toggleTag(exName, setIdx, tag) {
    setDraft((prev) => {
      const arr = [...(prev[exName] || [])];
      const row = { ...(arr[setIdx] || { failed: false, w: "", r: "", tags: [] }) };
      const has = (row.tags || []).includes(tag);
      row.tags = has ? row.tags.filter((t) => t !== tag) : [...(row.tags || []), tag];
      arr[setIdx] = row;
      return { ...prev, [exName]: arr };
    });
  }

  function updateField(exName, idx, key, val) {
    setDraft((prev) => {
      const arr = [...(prev[exName] || [])];
      const row = { ...(arr[idx] || { failed: false, w: "", r: "", tags: [] }) };
      row[key] = val;
      arr[idx] = row;
      return { ...prev, [exName]: arr };
    });
  }

  // Suggestions — uses last session for this exercise and failure weighting
  function getLastTop(exName) {
    for (const s of data.sessions) {
      const e = s.entries.find((x) => x.exercise === exName);
      if (e) {
        const top = [...e.sets].sort((a, b) => (+b.w || 0) - (+a.w || 0) || (+b.r || 0) - (+a.r || 0))[0];
        if (top) return { ...top, units: s.units };
      }
    }
    return null;
  }
  function suggestNext(ex) {
    const last = getLastTop(ex.name);
    if (!last) return null;
    const lastW = +last.w || 0;
    const lastR = +last.r || 0;
    const bump = incByCategory(ex.cat, units, lastW);
    // failure weighting: if failure flagged previously and at/over high → bump more
    const failureBoost = last.failed && lastR >= ex.high ? 1.35 : 1.0;
    // if under range and failed → keep weight or drop slightly
    const underAndFailed = last.failed && lastR < ex.low;

    let nextW = lastW;
    if (underAndFailed) {
      nextW = roundByEquip(Math.max(0, lastW - bump * 0.5), ex.equip, units);
    } else if (lastR >= ex.high) {
      nextW = roundByEquip(lastW + bump * failureBoost, ex.equip, units);
    } else if (lastR < ex.low) {
      nextW = roundByEquip(Math.max(0, lastW - bump * 0.5), ex.equip, units);
    }

    return { next: nextW, lastW, lastR };
  }

  function saveSession() {
    if (!split || !day) return alert("Pick a split/day first.");

    const entries = allExercises.map((ex) => {
      const sets = (draft[ex.name] || [])
        .filter((s) => {
          if (ex.equip === "bodyweight" || String(s.w).toUpperCase() === "BW") {
            return +s.r > 0;
          }
          return (String(s.w).trim() !== "" && +s.r > 0);
        })
        .map((s) => ({
          failed: !!s.failed,
          w: String(s.w).toUpperCase() === "BW" || ex.equip === "bodyweight" ? 0 : +s.w,
          r: +s.r,
          tags: s.tags || [],
          bodyweight: ex.equip === "bodyweight" || String(s.w).toUpperCase() === "BW",
        }));

      if (!sets.length) return null;

      const volume = sets.reduce((t, s) => t + Math.max(0, +s.w) * +s.r, 0);
      return { exercise: ex.name, sets, volume, equip: ex.equip };
    }).filter(Boolean);

    if (!entries.length) return alert("No sets entered.");

    const session = {
      id: uid(),
      splitId: split.id,
      dateISO: today,
      dayId: day.id,
      dayName: day.name,
      entries,
      volume: entries.reduce((a, e) => a + e.volume, 0),
      units,
    };

    setData((prev) => ({ ...prev, sessions: [session, ...prev.sessions] }));
    alert("Session saved.");
  }

  if (!split) {
    return <div className="text-neutral-400">Pick or create a split first.</div>;
  }

  return (
    <section className="rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-neutral-400">Split</label>
        <select
          value={split.id}
          onChange={(e) => setData((p) => ({ ...p, activeSplitId: e.target.value }))}
          className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        >
          {data.splits.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <label className="text-xs text-neutral-400 ml-2">Day</label>
        <select
          value={dayId}
          onChange={(e) => setDayId(e.target.value)}
          className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        >
          {(split.days || []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <label className="text-xs text-neutral-400 ml-2">Date</label>
        <input
          type="date"
          value={today}
          onChange={(e) => setToday(e.target.value)}
          className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        />

        <button onClick={addTodayExercise} className="ml-auto btn">
          + Add exercise (today only)
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        {allExercises.map((ex) => {
          const sets = draft[ex.name] || [];
          const sug = suggestNext(ex);
          const isExtra = extraToday.some((x) => x.name === ex.name);

          return (
            <div key={ex.name} className="rounded-xl border border-neutral-800 p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-base">{ex.name}</div>
                <div className="text-xs text-neutral-400">
                  {ex.low}–{ex.high} reps • {ex.equip} • {ex.cat}
                </div>
              </div>

              {sug && (
                <div className="mt-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1">
                  Next time: <b>{sug.next} {ex.equip === "bodyweight" ? "" : units}</b>
                  <span className="text-neutral-400"> (last {sug.lastW}{ex.equip === "bodyweight" ? "" : units}×{sug.lastR})</span>
                </div>
              )}

              <div className="mt-2 grid gap-2">
                {sets.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <label className="col-span-3 text-[11px] text-neutral-300 flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!!s.failed}
                        onChange={() => updateField(ex.name, idx, "failed", !s.failed)}
                      />
                      failed
                    </label>

                    {/* weight */}
                    {ex.equip === "bodyweight" || String(s.w).toUpperCase() === "BW" ? (
                      <div className="col-span-4 text-[12px] text-neutral-400">bodyweight</div>
                    ) : (
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder={units}
                        value={s.w}
                        onChange={(e) => updateField(ex.name, idx, "w", e.target.value)}
                        className="col-span-4 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                      />
                    )}

                    {/* reps */}
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="reps"
                      value={s.r}
                      onChange={(e) => updateField(ex.name, idx, "r", e.target.value)}
                      className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                    />

                    {/* tags compact popover */}
                    <TagsCompact
                      selected={s.tags || []}
                      onToggle={(t) => toggleTag(ex.name, idx, t)}
                    />

                    {/* delete set */}
                    <button
                      onClick={() => {
                        setDraft((prev) => {
                          const arr = [...(prev[ex.name] || [])];
                          arr.splice(idx, 1);
                          return { ...prev, [ex.name]: arr.length ? arr : [{ failed: false, w: ex.equip === "bodyweight" ? "BW" : "", r: "", tags: [] }] };
                        });
                      }}
                      className="col-span-1 text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => {
                    setDraft((prev) => ({
                      ...prev,
                      [ex.name]: [
                        ...(prev[ex.name] || []),
                        { failed: false, w: ex.equip === "bodyweight" ? "BW" : "", r: "", tags: [] },
                      ],
                    }));
                  }}
                  className="btn"
                >
                  + Add set
                </button>
              </div>

              {isExtra && (
                <div className="mt-2">
                  <button onClick={() => removeTodayExercise(ex.name)} className="text-xs text-red-400">
                    Remove from today
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={saveSession} className="btn-primary">Save session</button>
        <button onClick={() => window.location.hash = "#coach"} className="btn" onMouseDown={(e)=>e.preventDefault()} onClickCapture={() => {}}>
          {/* anchor noop */}
        </button>
      </div>
    </section>
  );
}

function TagsCompact({ selected, onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="col-span-1 relative">
      <button className="pill" onClick={() => setOpen((v) => !v)}>tags</button>
      {open && (
        <div className="absolute z-10 right-0 mt-1 w-52 rounded-lg border border-neutral-800 bg-neutral-900 p-2 grid gap-1">
          {PRESET_TAGS.map((t) => {
            const on = selected.includes(t);
            return (
              <button
                key={t}
                onClick={() => onToggle(t)}
                className={cx(
                  "text-left px-2 py-1 rounded border text-sm",
                  on ? "bg-white text-neutral-900 border-white" : "bg-neutral-800 border-neutral-700"
                )}
              >
                {t}
              </button>
            );
          })}
          <button
            onClick={() => {
              const t = prompt("Custom tag");
              if (t) onToggle(t.trim());
            }}
            className="text-left px-2 py-1 rounded border text-sm bg-neutral-800 border-neutral-700"
          >
            + custom
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------
   Sessions tab
------------------------- */
function SessionsTab({ data }) {
  const items = data.sessions;
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
    <section className="rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by day/exercise"
          className="input"
        />
        <div className="text-xs text-neutral-400 whitespace-nowrap">{filtered.length} sessions</div>
      </div>
      <div className="mt-3 grid gap-2">
        {filtered.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">
                {s.dateISO} · {s.dayName}
              </div>
              <div className="text-neutral-400">Vol {s.volume} {s.units}·reps</div>
            </div>
            <div className="mt-2 grid gap-1 text-xs">
              {s.entries.map((e, i) => (
                <div key={i} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                  <div className="font-medium">{e.exercise}</div>
                  <div className="text-neutral-300">
                    {e.sets.map((t, k) =>
                      `${t.failed ? "✖ " : ""}${t.bodyweight ? "BW" : t.w + s.units}×${t.r}${
                        t.tags?.length ? ` [${t.tags.join(", ")}]` : ""
                      }`
                    ).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-neutral-500">No sessions yet</div>}
      </div>
    </section>
  );
}

/* -------------------------
   Templates tab (expanded + confirm)
------------------------- */
const TEMPLATES = {
  ppl6: {
    name: "Push/Pull/Legs (6-day)",
    blurb: "High frequency, balanced volume.",
    text: `PUSH A
Incline DB Press — 3 × 6–10
Seated DB Shoulder Press — 3 × 6–10
Cable Lateral Raise — 3 × 12–15
Overhead Rope Triceps Extension — 3 × 10–12

PULL A
Barbell Row — 3 × 6–10
Lat Pulldown — 3 × 8–10
Face Pull — 2 × 12–15
Incline DB Curl — 3 × 8–12

LEGS A
Back Squat — 3 × 5–8
Romanian Deadlift — 3 × 6–8
Leg Press — 3 × 10–12
Standing Calf Raise — 4 × 12–15

PUSH B
Machine Shoulder Press — 3 × 6–10
Flat DB Press — 3 × 6–10
Lateral Raise — 3 × 12–15
Pushdown — 3 × 10–12

PULL B
Chest-Supported Row — 3 × 8–10
Neutral-Grip Pulldown — 3 × 8–10
Reverse Pec Deck — 3 × 12–15
EZ-Bar Curl — 3 × 8–12

LEGS B
Front Squat — 3 × 5–8
Lying Leg Curl — 3 × 10–12
Hack Squat — 3 × 8–10
Seated Calf Raise — 4 × 12–15`
  },
  ul4: {
    name: "Upper / Lower (4-day)",
    blurb: "Classic strength-hypertrophy mix.",
    text: `UPPER 1
Barbell Bench Press — 3 × 5–8
One-Arm DB Row — 3 × 8–12
Overhead Press — 3 × 6–10
Cable Lateral Raise — 3 × 12–15
EZ-Bar Curl — 2 × 10–12

LOWER 1
Back Squat — 3 × 5–8
Romanian Deadlift — 3 × 6–8
Leg Press — 3 × 10–12
Seated Calf Raise — 4 × 12–15

UPPER 2
Incline DB Press — 3 × 6–10
Lat Pulldown — 3 × 8–10
Machine Shoulder Press — 3 × 6–10
Face Pull — 2 × 12–15
Cable Curl — 2 × 10–12

LOWER 2
Front Squat — 3 × 5–8
Lying Leg Curl — 3 × 10–12
Hack Squat — 3 × 8–10
Standing Calf Raise — 4 × 12–15`
  },
  fullbody3: {
    name: "Full-Body (3-day)",
    blurb: "Efficient, all-round hypertrophy.",
    text: `DAY 1
Back Squat — 3 × 5–8
Flat DB Press — 3 × 6–10
Lat Pulldown — 3 × 8–10
Lateral Raise — 3 × 12–15
Rope Pushdown — 2 × 10–12

DAY 2
Romanian Deadlift — 3 × 6–8
Incline DB Press — 3 × 6–10
Chest-Supported Row — 3 × 8–10
DB Curl — 2 × 10–12
Calf Raise — 4 × 12–15

DAY 3
Front Squat — 3 × 5–8
Machine Shoulder Press — 3 × 6–10
Neutral-Grip Pulldown — 3 × 8–10
Cable Row — 3 × 8–10
Face Pull — 2 × 12–15`
  },
  arnold: {
    name: "Arnold Split (6-day)",
    blurb: "Classic volume, aesthetics focus.",
    text: `CHEST + BACK
Incline Barbell Press — 4 × 6–10
Flat DB Fly — 3 × 10–12
Barbell Row — 4 × 6–10
Pullover — 3 × 10–12

SHOULDERS + ARMS
Seated DB Press — 4 × 6–10
Lateral Raise — 4 × 12–15
Barbell Curl — 3 × 8–12
Skull Crushers — 3 × 8–12

LEGS A
Back Squat — 4 × 6–10
Romanian Deadlift — 3 × 6–8
Leg Extension — 3 × 10–12
Seated Calf Raise — 4 × 12–15

LEGS B
Front Squat — 4 × 6–10
Lying Leg Curl — 3 × 10–12
Leg Press — 3 × 10–12
Standing Calf Raise — 4 × 12–15`
  },
  ppl5: {
    name: "PPL + UL (5-day hybrid)",
    blurb: "Frequency & recovery balanced.",
    text: `UPPER
Incline Bench — 3 × 6–10
Cable Row — 3 × 8–10
Lateral Raise — 3 × 12–15
Curl — 2 × 10–12
Pushdown — 2 × 10–12

LOWER
Back Squat — 3 × 5–8
Leg Press — 3 × 8–10
Ham Curl — 3 × 10–12
Calf Raise — 4 × 12–15

PUSH
DB Shoulder Press — 3 × 6–10
Chest Press — 3 × 6–10
Lateral Raise — 3 × 12–15

PULL
Pulldown — 3 × 8–10
Row — 3 × 8–10
Rear Delt Fly — 3 × 12–15

LEGS
RDL — 3 × 6–8
Leg Press — 3 × 10
Calves — 4 × 15`
  }
};

function TemplatesTab({ data, setData }) {
  function useTemplate(key) {
    const t = TEMPLATES[key];
    if (!t) return;
    const days = parseSplitText(t.text);
    const id = uid();

    if (data.activeSplitId) {
      const currentName = data.splits.find((s) => s.id === data.activeSplitId)?.name || "current split";
      const ok = confirm(`Create and switch to "${t.name}"?\nYour ${currentName} will remain saved.`);
      if (!ok) return;
    }

    setData((prev) => ({
      ...prev,
      splits: [...prev.splits, { id, name: t.name, days }],
      activeSplitId: id,
    }));
    alert(`Template "${t.name}" added as a new split and set active.`);
  }

  return (
    <section className="rounded-2xl border border-neutral-800 p-4">
      <h3 className="font-semibold mb-2">Templates</h3>
      <div className="grid gap-2">
        {Object.keys(TEMPLATES).map((k) => (
          <div key={k} className="rounded-lg border border-neutral-800 p-2 flex items-center justify-between">
            <div>
              <div className="font-medium">{TEMPLATES[k].name}</div>
              <div className="text-xs text-neutral-400">{TEMPLATES[k].blurb}</div>
            </div>
            <button className="btn-primary" onClick={() => useTemplate(k)}>Use</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------
   Import tab (paste + file)
------------------------- */
function ImportTab({ onUse }) {
  const [text, setText] = useState("");

  function fromFile(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ""));
    r.readAsText(f);
  }

  return (
    <section className="rounded-2xl border border-neutral-800 p-4 bg-import anime-overlay">
      <div className="glass-strong p-3">
        <h2 className="font-semibold">Paste / Import your split</h2>
        <p className="text-sm text-neutral-400">Free-form text is fine. AI-style parsing of headings and exercises.</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="mt-2 w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          placeholder={`PUSH A\nIncline DB Press — 3 × 6–10\n...`}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => {
              const name = prompt("Split name", "Imported Split");
              if (!name) return;
              onUse(name, text);
            }}
            className="btn-primary"
          >
            Use this split
          </button>

          <label className="btn cursor-pointer">
            Upload .txt
            <input
              type="file"
              accept=".txt,.md"
              className="hidden"
              onChange={(e) => fromFile(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
