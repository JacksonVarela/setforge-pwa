// SetForge — V5.1
// Phone-first PWA with:
// • Firebase email/password auth + email verification
// • Multi-split library (create/import/templates). Set Active Split; History filters by it.
// • Smart paste/import parser (txt). Bullets/emoji ok; headings auto-detected.
// • Log: failure-aware suggestions, bodyweight toggle, tag modal (custom tags fixed).
// • Add/remove exercises directly in Log (skip built-ins for today; add ad-hoc without touching Split).
// • Split: click-to-select Equipment/Category, reordering ↑/↓, AI description toggler.
// • Draft-safety: editing a split won’t wipe what you already typed in today’s Log.
// • Optional AI describe via /api/describe (advice-only; app still works offline).
// • Charts kept. No session “volume” display.

import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { initFirebaseApp } from "./firebase";

initFirebaseApp();
const auth = getAuth();

// ---------- Constants ----------
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

const HANDLE_TAGS = [
  "V-handle",
  "straight bar",
  "rope",
  "EZ bar",
  "single D-handle",
  "neutral-grip bar",
];

const EQUIP_OPTIONS = [
  { value: "machine", label: "Machine" },
  { value: "cable", label: "Cable" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "barbell", label: "Barbell" },
  { value: "smith_machine", label: "Smith Machine" },
  { value: "unknown", label: "Unknown" },
];

const CAT_OPTIONS = [
  { value: "upper_comp", label: "Upper Compound" },
  { value: "lower_comp", label: "Lower Compound" },
  { value: "iso_small", label: "Isolation" },
  { value: "unknown", label: "Unknown" },
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
});

// ---------- Utils ----------
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

// ---------- Guessers ----------
function guessEquip(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("smith")) return "smith_machine";
  if (n.includes("barbell") || /\bbb\b/.test(n)) return "barbell";
  if (n.includes("dumbbell") || /\bdb\b/.test(n)) return "dumbbell";
  if (n.includes("cable") || n.includes("rope") || n.includes("pulldown")) return "cable";
  if (
    n.includes("dip") ||
    n.includes("hanging") ||
    n.includes("push-up") ||
    n.includes("chin-up") ||
    n.includes("pull-up") ||
    n.includes("neck") ||
    n.includes("back extensions")
  )
    return "bodyweight";
  if (
    n.includes("machine") ||
    n.includes("pec deck") ||
    n.includes("leg press") ||
    n.includes("abduction") ||
    n.includes("adduction") ||
    n.includes("hamstring curl") ||
    n.includes("leg extension") ||
    n.includes("calf")
  )
    return "machine";
  return "unknown";
}
function guessCat(name) {
  const n = (name || "").toLowerCase();
  if (/(squat|deadlift|romanian|leg press|rdl|split squat|hack)/.test(n)) return "lower_comp";
  if (/(bench|press|row|pulldown|dip|weighted dip|shoulder press)/.test(n)) return "upper_comp";
  return "iso_small";
}

// ---------- Parsing (headings + bullets ok) ----------
function parseSplitText(raw) {
  const days = [];
  const lines = String(raw).replace(/\r/g, "").split(/\n+/);
  let cur = null;
  const dayHeader =
    /^(?:[\p{Emoji}\u2600-\u27BF]\s*)?(PUSH(?:\s*[AB])?|PULL(?:\s*[AB])?|LEGS?(?:\s*[AB])?|UPPER|LOWER|CHEST.*|BACK.*|SHOULDERS?.*|ARMS?.*|REST|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s*$/iu;

  // "Name — 3 × 8–12" OR "Name - 3x10-12" etc.
  const exLine =
    /^(?:[•\u2022\-\*\d\)\(]+\s*)?(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const dh = line.match(dayHeader);
    if (dh) {
      cur = { id: uid(), name: dh[1].toUpperCase(), exercises: [] };
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
        cat: guessCat(name),
        equip: guessEquip(name),
      };
      if (!cur) {
        cur = { id: uid(), name: "DAY 1", exercises: [] };
        days.push(cur);
      }
      cur.exercises.push(item);
    }
  }
  return days;
}

// Smarter wrapper (room for AI later)
async function smartParseSplit(raw) {
  // For now, deterministic parse; hook AI here later if you want.
  return parseSplitText(raw);
}

// ---------- Math ----------
function roundByEquip(weight, equip, units) {
  const isBarLike = equip === "barbell" || equip === "smith_machine";
  const isDb = equip === "dumbbell";
  const step =
    units === "kg"
      ? isBarLike
        ? 2.5
        : isDb
        ? 1.25
        : 1
      : isBarLike
      ? CONFIG.barbellStepLb
      : isDb
      ? CONFIG.dumbbellStepLb
      : CONFIG.machineStepLb;
  return Math.round(weight / step) * step;
}
function incByCategory(cat, units, current) {
  const pct =
    cat === "lower_comp" ? CONFIG.lowerPct : cat === "upper_comp" ? CONFIG.upperPct : CONFIG.isoPct;
  const raw = (+current || 0) * pct;
  const min =
    units === "kg"
      ? cat === "lower_comp"
        ? CONFIG.lowerMinKg
        : cat === "upper_comp"
        ? CONFIG.upperMinKg
        : CONFIG.isoMinKg
      : cat === "lower_comp"
      ? CONFIG.lowerMinLb
      : cat === "upper_comp"
      ? CONFIG.upperMinLb
      : CONFIG.isoMinLb;
  return Math.max(raw, min);
}
function bestSetByLoad(sets) {
  if (!sets || !sets.length) return null;
  return sets
    .slice()
    .sort((a, b) => (+b.w || 0) - (+a.w || 0) || (+b.r || 0) - (+a.r || 0))[0];
}

// ---------- App ----------
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(DEFAULT_STATE());
  const [tab, setTab] = useState("log");
  const [units, setUnits] = useState(CONFIG.unitsDefault);
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));

  // Log-specific local state
  const [selectedDayId, setSelectedDayId] = useState("");
  const [extras, setExtras] = useState({}); // { [dayId]: [exercise objects] }
  const [skips, setSkips] = useState({}); // { [dayId]: { [exerciseName]: true } }

  // auth state
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        const loaded = load(u);
        setUnits(loaded.units || CONFIG.unitsDefault);
        setData(loaded);
      }),
    []
  );
  useEffect(() => {
    const next = { ...data, units };
    save(user, next);
  }, [data, units, user]);

  const currentSplit = useMemo(
    () => data.splits.find((s) => s.id === data.activeSplitId),
    [data]
  );
  useEffect(() => {
    if (currentSplit) {
      setSelectedDayId(currentSplit.days?.[0]?.id || "");
    }
  }, [data.activeSplitId]);

  // Show onboarding if no splits
  const needsOnboarding = (data.splits?.length || 0) === 0;

  // ---------- Logging helpers ----------
  function getMeta(item) {
    return {
      name: item.name,
      sets: item.sets || 1,
      low: item.low || 8,
      high: item.high || 12,
      cat: item.cat || "iso_small",
      equip: item.equip || "machine",
    };
  }

  const currentDay = useMemo(
    () => currentSplit?.days?.find((d) => d.id === selectedDayId) || currentSplit?.days?.[0],
    [currentSplit, selectedDayId]
  );

  // Build exercise list for today: built-ins + ad-hoc extras, minus skips
  const dayId = currentDay?.id || "none";
  const exBuiltins = (currentDay?.exercises || []).map(getMeta);
  const exExtras = (extras[dayId] || []).map(getMeta);
  const skipMap = skips[dayId] || {};
  const exList = [...exBuiltins, ...exExtras].filter((m) => !skipMap[m.name]);

  // draft: map exercise name -> [{ failed, bw, w, r, tags }]
  const [draft, setDraft] = useState({});
  // Merge-friendly init: add missing keys/sets but never delete what user typed
  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const m of exList) {
        const cur = next[m.name] || [];
        const needed = Math.max(m.sets || 1, 1);
        if (cur.length < needed) {
          const toAdd = Array.from({ length: needed - cur.length }).map(() => ({
            failed: false,
            bw: m.equip === "bodyweight",
            w: "",
            r: "",
            tags: [],
          }));
          next[m.name] = [...cur, ...toAdd];
        } else {
          next[m.name] = cur; // keep user entries
        }
      }
      return next;
    });
  }, [dayId, exList.map((m) => m.name).join("|")]); // eslint-disable-line

  function setSkipToday(name, v) {
    setSkips((prev) => ({
      ...prev,
      [dayId]: { ...(prev[dayId] || {}), [name]: v },
    }));
  }

  function addAdHocExercise(exObj) {
    setExtras((prev) => ({
      ...prev,
      [dayId]: [ ...(prev[dayId] || []), exObj ],
    }));
    // Draft rows will be auto-created by the merge effect above
  }

  function removeAdHocExercise(name) {
    setExtras((prev) => ({
      ...prev,
      [dayId]: (prev[dayId] || []).filter((e) => e.name !== name),
    }));
    setDraft((prev) => {
      const cp = { ...prev };
      delete cp[name];
      return cp;
    });
  }

  // History
  function getHistoryFor(exName) {
    return data.sessions
      .filter((s) => s.splitId === data.activeSplitId)
      .map((s) => s.entries.find((e) => e.exercise === exName))
      .filter(Boolean);
  }

  // Failure-aware suggestion (next time)
  function suggestNext(meta) {
    const histEntries = getHistoryFor(meta.name);
    if (histEntries.length === 0) return null;
    const last = histEntries[0];
    const top = bestSetByLoad(last.sets);
    if (!top) return null;
    const weight = +top.w || 0;
    const reps = +top.r || 0;
    const hadFail = last.sets.some((s) => !!s.failed);
    const delta = incByCategory(meta.cat, units, Math.max(weight, 1));

    let next = weight;
    if (reps < meta.low) {
      // too heavy last time -> nudge down slightly
      next = roundByEquip(Math.max(0, weight - delta * 0.5), meta.equip, units);
    } else if (reps >= meta.high) {
      // solid performance
      const factor = hadFail ? 1.0 : 1.5; // if no fail, push harder
      next = roundByEquip(weight + delta * factor, meta.equip, units);
    } else {
      // mid-range reps
      const factor = hadFail ? 0.0 : 1.0;
      next = roundByEquip(weight + delta * factor, meta.equip, units);
    }
    return { next, basis: { weight, reps, low: meta.low, high: meta.high, hadFail } };
  }

  // Live per-set suggestion
  function liveSuggest(meta, idx) {
    const s = (draft[meta.name] || [])[idx];
    if (!s) return null;
    if (s.bw) return null; // bodyweight: no load suggestion
    const w = +s.w || 0;
    const r = +s.r || 0;
    if (!w || !r) return null;
    const d = incByCategory(meta.cat, units, Math.max(w, 1));
    if (s.failed) return roundByEquip(Math.max(0, w - d * 0.5), meta.equip, units);
    if (r >= meta.high) return roundByEquip(w + d * 1.5, meta.equip, units);
    if (r < meta.low) return roundByEquip(Math.max(0, w - d * 0.5), meta.equip, units);
    return roundByEquip(w + d * 1.0, meta.equip, units);
  }

  // Save session (no volume display; keeps prior structure)
  function saveSession() {
    if (!currentSplit || !currentDay) {
      alert("Pick a split/day first");
      return;
    }
    const entries = exList
      .map((m) => {
        const arr = (draft[m.name] || []).filter((s) => {
          const repsOk = +s.r > 0;
          if (m.equip === "bodyweight" || s.bw) return repsOk; // reps-only ok
          // treat blank/0 weight as OK only if reps > 0 and bodyweight flagged
          const wOk = s.bw || s.w === "0" || s.w === 0 || +s.w > -99999;
          return wOk && repsOk;
        });
        if (!arr.length) return null;
        const sets = arr.map((s) => ({
          failed: !!s.failed,
          bw: !!s.bw,
          w: s.bw ? 0 : +s.w,
          r: +s.r,
          tags: s.tags || [],
        }));
        return {
          exercise: m.name,
          sets,
        };
      })
      .filter(Boolean);

    if (!entries.length) {
      alert("No sets to save yet");
      return;
    }

    const session = {
      id: uid(),
      splitId: data.activeSplitId,
      dateISO: today,
      dayId: currentDay.id,
      dayName: currentDay.name,
      entries,
      units,
    };
    setData((prev) => ({ ...prev, sessions: [session, ...prev.sessions] }));
    alert("Session saved");
  }

  // ---------- Split management ----------
  function setActiveSplit(id) {
    setData((prev) => ({ ...prev, activeSplitId: id }));
  }
  function applyParsedToNewSplit(splitName, raw) {
    const id = uid();
    const days = parseSplitText(raw);
    if (!days.length) {
      alert("Couldn’t parse. Try lines like 'Incline DB Press — 3 × 6–10'.");
      return;
    }
    const split = { id, name: splitName || `Imported ${new Date().toISOString().slice(0, 10)}`, days };
    setData((prev) => ({
      ...prev,
      splits: [...prev.splits, split],
      activeSplitId: id,
    }));
    setTab("log");
  }

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
            <nav className="mt-3 flex gap-2">
              <button
                onClick={() => setTab("log")}
                disabled={!data.activeSplitId}
                className={cx(
                  "px-3 py-2 rounded-xl text-sm",
                  tab === "log" ? "bg-white text-neutral-900" : "bg-neutral-800 border border-neutral-700",
                  !data.activeSplitId && "opacity-50"
                )}
              >
                Log
              </button>
              <button
                onClick={() => setTab("split")}
                className={cx(
                  "px-3 py-2 rounded-xl text-sm",
                  tab === "split" ? "bg-white text-neutral-900" : "bg-neutral-800 border border-neutral-700"
                )}
              >
                Split
              </button>
              <button
                onClick={() => setTab("history")}
                className={cx(
                  "px-3 py-2 rounded-xl text-sm",
                  tab === "history" ? "bg-white text-neutral-900" : "bg-neutral-800 border border-neutral-700"
                )}
              >
                Past Sessions
              </button>
              {needsOnboarding && (
                <button
                  onClick={() => setTab("import")}
                  className={cx(
                    "px-3 py-2 rounded-xl text-sm",
                    tab === "import" ? "bg-white text-neutral-900" : "bg-neutral-800 border border-neutral-700"
                  )}
                >
                  Import
                </button>
              )}
            </nav>

            {needsOnboarding && tab !== "import" && (
              <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
                <h2 className="font-semibold mb-1">Welcome to SetForge</h2>
                <p className="text-sm text-neutral-400">
                  Offline lift tracker — your data stays on device. Start by importing or building a split.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setTab("import")}
                    className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
                  >
                    Paste / Import
                  </button>
                  <button
                    onClick={() => setTab("split")}
                    className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
                  >
                    Build Manually
                  </button>
                  <button
                    onClick={() => setTab("split")}
                    className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
                  >
                    Templates
                  </button>
                </div>
              </div>
            )}

            {tab === "log" && (
              <LogView
                data={data}
                setData={setData}
                currentSplit={currentSplit}
                selectedDayId={selectedDayId}
                setSelectedDayId={setSelectedDayId}
                draft={draft}
                setDraft={setDraft}
                units={units}
                today={today}
                setToday={setToday}
                exList={exList}
                suggestNext={suggestNext}
                liveSuggest={liveSuggest}
                saveSession={saveSession}
                setSkipToday={setSkipToday}
                addAdHocExercise={addAdHocExercise}
                removeAdHocExercise={removeAdHocExercise}
                isAdHoc={(name) => (extras[dayId] || []).some((e) => e.name === name)}
              />
            )}

            {tab === "split" && (
              <SplitView
                data={data}
                setData={setData}
                setActiveSplit={setActiveSplit}
                applyParsedToNewSplit={applyParsedToNewSplit}
              />
            )}

            {tab === "history" && <HistoryView data={data} />}

            {tab === "import" && needsOnboarding && (
              <ImportFirstRun
                onUse={async (name, raw) => {
                  const days = await smartParseSplit(raw);
                  if (!days.length) {
                    alert("Couldn’t parse. Try 'Name — 3 × 8–12'.");
                    return;
                  }
                  const id = uid();
                  const split = { id, name, days };
                  setData((prev) => ({
                    ...prev,
                    splits: [...prev.splits, split],
                    activeSplitId: id,
                  }));
                  setTab("log");
                }}
              />
            )}

            <footer className="text-center text-[10px] text-neutral-500 mt-6">
              Built for you. Works offline. Optional AI descriptions when online.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Header ----------
function Header({ units, setUnits, user }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold">SetForge</h1>
        <p className="text-xs text-neutral-400">Offline lift tracker · your data stays on device</p>
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
    <button
      onClick={() => signOut(getAuth())}
      className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
    >
      Sign out
    </button>
  );
}

// ---------- Auth Screens ----------
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
    <section className="mt-8 rounded-2xl border border-neutral-800 p-4">
      <div className="text-center mb-3">
        <div className="text-2xl font-bold">SetForge</div>
        <div className="text-sm text-neutral-400">Sign {mode === "signin" ? "in" : "up"} to get started</div>
      </div>
      <div className="grid gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
        />
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password (8+ chars)"
          className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
        />
        <button onClick={go} disabled={busy} className="px-3 py-2 rounded-xl bg-white text-neutral-900">
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        {msg && <div className="text-xs text-neutral-300">{msg}</div>}
        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-xs text-neutral-400 mt-1">
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
      <p className="text-[10px] text-neutral-500 mt-3">Email verification required. We use Firebase Auth free tier.</p>
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
        <button onClick={() => window.location.reload()} className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm">
          I verified
        </button>
        <button onClick={resend} className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm">
          Resend
        </button>
      </div>
      {sent && <div className="text-xs text-green-400 mt-2">Sent!</div>}
    </section>
  );
}

// ---------- Log View ----------
function LogView({
  data,
  setData,
  currentSplit,
  selectedDayId,
  setSelectedDayId,
  draft,
  setDraft,
  units,
  today,
  setToday,
  exList,
  suggestNext,
  liveSuggest,
  saveSession,
  setSkipToday,
  addAdHocExercise,
  removeAdHocExercise,
  isAdHoc,
}) {
  const [tagOpen, setTagOpen] = useState(null); // { ex, idx } | null
  const [exEditorOpen, setExEditorOpen] = useState(false);

  if (!currentSplit)
    return <div className="mt-6 text-sm text-neutral-400">Pick a split first in the Split tab.</div>;

  const day =
    currentSplit.days?.find((d) => d.id === selectedDayId) || currentSplit.days?.[0];

  // local helpers
  function addSet(ex) {
    setDraft((prev) => ({
      ...prev,
      [ex]: [...(prev[ex] || []), { failed: false, bw: false, w: "", r: "", tags: [] }],
    }));
  }
  function removeSetHere(ex, idx) {
    setDraft((prev) => {
      const arr = [...(prev[ex] || [])];
      arr.splice(idx, 1);
      return { ...prev, [ex]: arr.length ? arr : [{ failed: false, bw: false, w: "", r: "", tags: [] }] };
    });
  }
  function removeExerciseToday(ex) {
    if (isAdHoc(ex)) {
      removeAdHocExercise(ex);
    } else {
      setSkipToday(ex, true);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-400">Split</label>
          <select
            value={currentSplit.id}
            onChange={(e) =>
              setData((prev) => ({ ...prev, activeSplitId: e.target.value }))
            }
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          >
            {data.splits.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-neutral-400 ml-2">Day</label>
          <select
            value={day?.id || ""}
            onChange={(e) => setSelectedDayId(e.target.value)}
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          >
            {(currentSplit.days || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-neutral-400 ml-2">Date</label>
          <input
            type="date"
            value={today}
            onChange={(e) => setToday(e.target.value)}
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setExEditorOpen(true)}
            className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
            title="Add an exercise just for today"
          >
            + Add exercise (today)
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {exList.map((m) => {
          const ex = m.name;
          const sets = draft[ex] || [];
          const sug = suggestNext(m);
          return (
            <div key={ex} className="rounded-xl border border-neutral-800 p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-base">{ex}</div>
                <div className="flex items-center gap-2">
                  {sug && (
                    <div className="text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1">
                      Next time: <b>{sug.next} {units}</b>
                      <span className="text-neutral-400">
                        {"  "}
                        (last {sug.basis.weight}{units}×{sug.basis.reps}
                        {sug.basis.hadFail ? ", fail" : ""})
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => removeExerciseToday(ex)}
                    className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                  >
                    {isAdHoc(ex) ? "Remove" : "Skip today"}
                  </button>
                </div>
              </div>

              <div className="mt-2 grid gap-2">
                {sets.map((s, idx) => {
                  const live = liveSuggest(m, idx);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <label className="col-span-3 text-[11px] text-neutral-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!s.failed}
                          onChange={() =>
                            updateSetFlag(setDraft, draft, ex, idx, "failed")
                          }
                        />{" "}
                        failed at
                      </label>

                      <label className="col-span-2 text-[11px] text-neutral-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!s.bw || m.equip === "bodyweight"}
                          onChange={() =>
                            updateSetFlag(setDraft, draft, ex, idx, "bw")
                          }
                        />{" "}
                        BW
                      </label>

                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder={`${units}`}
                        value={s.bw || m.equip === "bodyweight" ? "" : s.w}
                        onChange={(e) =>
                          updateSetField(setDraft, draft, ex, idx, "w", e.target.value)
                        }
                        disabled={s.bw || m.equip === "bodyweight"}
                        className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="reps"
                        value={s.r}
                        onChange={(e) =>
                          updateSetField(setDraft, draft, ex, idx, "r", e.target.value)
                        }
                        className="col-span-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                      />

                      <div className="col-span-2 flex gap-1 justify-end">
                        <button
                          onClick={() => setTagOpen({ ex, idx })}
                          className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                        >
                          Tags
                        </button>
                        <button
                          onClick={() => removeSetHere(ex, idx)}
                          className="text-red-400 px-2 py-1 text-xs"
                        >
                          ✕
                        </button>
                      </div>

                      {live !== null && !s.bw && (
                        <div className="col-span-12 text-[11px] text-neutral-400">
                          Next set: <b className="text-neutral-100">{live} {units}</b>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={() => addSet(ex)}
                  className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
                >
                  Add set
                </button>
              </div>

              <ChartToggle ex={ex} chartDataFor={chartDataFor(data)} />
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={saveSession} className="px-4 py-2 rounded-xl bg-white text-neutral-900">
          Save session
        </button>
      </div>

      {/* Add ad-hoc exercise modal */}
      <ExerciseEditor
        open={exEditorOpen}
        initial={{ __mode: "add", name: "", sets: 3, low: 8, high: 12, equip: "unknown", cat: "unknown" }}
        onCancel={() => setExEditorOpen(false)}
        onSave={(payload) => {
          addAdHocExercise(payload);
          setExEditorOpen(false);
        }}
      />

      {/* Tag modal */}
      {tagOpen && (
        <TagModal
          preset={[...PRESET_TAGS, ...HANDLE_TAGS]}
          value={(draft[tagOpen.ex]?.[tagOpen.idx]?.tags) || []}
          onClose={() => setTagOpen(null)}
          onSave={(nextTags) => {
            setDraft((prev) => {
              const arr = [...(prev[tagOpen.ex] || [])];
              const row = { ...(arr[tagOpen.idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
              row.tags = nextTags;
              arr[tagOpen.idx] = row;
              return { ...prev, [tagOpen.ex]: arr };
            });
            setTagOpen(null);
          }}
        />
      )}
    </section>
  );
}

// helpers for nested draft updates
function updateSetField(setDraft, draft, ex, idx, key, val) {
  setDraft((prev) => {
    const arr = [...(prev[ex] || draft[ex] || [])];
    const row = { ...(arr[idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
    row[key] = val;
    arr[idx] = row;
    return { ...prev, [ex]: arr };
  });
}
function updateSetFlag(setDraft, draft, ex, idx, key) {
  setDraft((prev) => {
    const arr = [...(prev[ex] || draft[ex] || [])];
    const row = { ...(arr[idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
    row[key] = !row[key];
    arr[idx] = row;
    return { ...prev, [ex]: arr };
  });
}

// ---------- Tag Modal ----------
function TagModal({ preset, value, onClose, onSave }) {
  const [selected, setSelected] = useState(new Set(value || []));
  const [custom, setCustom] = useState("");

  function toggle(t) {
    const s = new Set(selected);
    if (s.has(t)) s.delete(t);
    else s.add(t);
    setSelected(s);
  }
  function addCustom() {
    const t = custom.trim();
    if (!t) return;
    toggle(t);
    setCustom("");
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="w-[90%] max-w-md rounded-2xl bg-neutral-900 border border-neutral-700 p-4">
        <div className="font-semibold text-lg mb-2">Tags</div>
        <div className="flex gap-2 mb-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Add custom tag..."
            className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          />
          <button onClick={addCustom} className="px-3 py-2 rounded-lg bg-white text-neutral-900 text-sm">
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2 max-h-56 overflow-auto">
          {preset.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={cx(
                "px-2 py-1 rounded-lg border text-sm",
                selected.has(t) ? "bg-white text-neutral-900 border-white" : "bg-neutral-800 border-neutral-700"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-neutral-400">
            Cancel
          </button>
          <button
            onClick={() => onSave(Array.from(selected))}
            className="px-3 py-2 rounded-lg bg-white text-neutral-900 text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Exercise Editor (click-to-select, no typing codes) ----------
function ExerciseEditor({ open, initial, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [sets, setSets] = useState(initial?.sets ?? 3);
  const [low, setLow] = useState(initial?.low ?? 8);
  const [high, setHigh] = useState(initial?.high ?? 12);
  const [equip, setEquip] = useState(initial?.equip || "unknown");
  const [cat, setCat] = useState(initial?.cat || "unknown");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || "");
    setSets(initial?.sets ?? 3);
    setLow(initial?.low ?? 8);
    setHigh(initial?.high ?? 12);
    setEquip(initial?.equip || "unknown");
    setCat(initial?.cat || "unknown");
  }, [open, initial]);

  if (!open) return null;

  function autofill() {
    setEquip(guessEquip(name) || "unknown");
    setCat(guessCat(name) || "unknown");
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="w-[90%] max-w-md rounded-2xl bg-neutral-900 border border-neutral-700 p-4">
        <div className="font-semibold text-lg mb-2">
          {initial?.__mode === "edit" ? "Edit Exercise" : "Add Exercise"}
        </div>

        <div className="grid gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Exercise name (e.g., Incline DB Press)"
            className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              value={sets}
              onChange={(e) => setSets(Number(e.target.value || 0))}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
              placeholder="Sets"
            />
            <input
              type="number"
              value={low}
              onChange={(e) => setLow(Number(e.target.value || 0))}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
              placeholder="Low"
            />
            <input
              type="number"
              value={high}
              onChange={(e) => setHigh(Number(e.target.value || 0))}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
              placeholder="High"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={equip}
              onChange={(e) => setEquip(e.target.value)}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
              title="Equipment"
            >
              {EQUIP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
              title="Category"
            >
              {CAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-between mt-1">
            <button
              onClick={autofill}
              disabled={!name}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
              title="Use smart guesses from the exercise name"
            >
              Auto-fill from name
            </button>

            <div className="flex gap-2">
              <button onClick={onCancel} className="px-3 py-2 text-sm text-neutral-400">
                Cancel
              </button>
              <button
                onClick={() =>
                  onSave({
                    name: name.trim(),
                    sets: Number(sets) || 1,
                    low: Number(low) || 8,
                    high: Number(high) || Number(low) || 12,
                    equip,
                    cat,
                  })
                }
                disabled={!name}
                className="px-3 py-2 rounded-lg bg-white text-neutral-900 text-sm"
              >
                Save
              </button>
            </div>
          </div>

          <p className="text-[11px] text-neutral-500 mt-1">Unknown is fine—AI can’t know every variation.</p>
        </div>
      </div>
    </div>
  );
}

// ---------- Split View (click-to-edit + reorder + AI desc) ----------
function SplitView({ data, setData, setActiveSplit, applyParsedToNewSplit }) {
  const [mode, setMode] = useState("list"); // list | paste | templates
  const [paste, setPaste] = useState("");
  const [editor, setEditor] = useState({
    open: false,
    splitId: "",
    dayId: "",
    idx: -1, // -1 = add
    initial: null,
  });
  const [descMap, setDescMap] = useState({}); // `${splitId}:${dayId}:${idx}` -> text/null/undefined

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
    const name = prompt("Day name", "Day");
    if (!name) return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((s) =>
        s.id === splitId
          ? { ...s, days: [...(s.days || []), { id: uid(), name, exercises: [] }] }
          : s
      ),
    }));
  }
  function openAddExercise(splitId, dayId) {
    setEditor({
      open: true,
      splitId,
      dayId,
      idx: -1,
      initial: { __mode: "add", name: "", sets: 3, low: 8, high: 12, equip: "unknown", cat: "unknown" },
    });
  }
  function openEditExercise(splitId, dayId, idx, e) {
    setEditor({ open: true, splitId, dayId, idx, initial: { __mode: "edit", ...e } });
  }
  function saveExercise(payload) {
    const { splitId, dayId, idx } = editor;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((sp) =>
        sp.id !== splitId
          ? sp
          : {
              ...sp,
              days: sp.days.map((dd) =>
                dd.id !== dayId
                  ? dd
                  : {
                      ...dd,
                      exercises:
                        idx === -1
                          ? [...dd.exercises, payload]
                          : dd.exercises.map((x, i) => (i === idx ? payload : x)),
                    }
              ),
            }
      ),
    }));
    setEditor({ open: false, splitId: "", dayId: "", idx: -1, initial: null });
  }
  function removeExercise(splitId, dayId, idx) {
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((sp) =>
        sp.id !== splitId
          ? sp
          : {
              ...sp,
              days: sp.days.map((dd) =>
                dd.id !== dayId
                  ? dd
                  : { ...dd, exercises: dd.exercises.filter((_, i) => i !== idx) }
              ),
            }
      ),
    }));
  }
  function renameSplit(id) {
    const name = prompt("Split name", data.splits.find((s) => s.id === id)?.name || "");
    if (!name) return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((s) => (s.id === id ? { ...s, name } : s)),
    }));
  }
  function resetSplit(id) {
    if (!confirm("Reset this split (remove all days/exercises)?")) return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((s) => (s.id === id ? { ...s, days: [] } : s)),
    }));
  }
  function moveEx(splitId, dayId, idx, dir) {
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((sp) =>
        sp.id !== splitId
          ? sp
          : {
              ...sp,
              days: sp.days.map((dd) =>
                dd.id !== dayId
                  ? dd
                  : (() => {
                      const arr = [...dd.exercises];
                      const j = idx + (dir === "up" ? -1 : 1);
                      if (j < 0 || j >= arr.length) return dd;
                      [arr[idx], arr[j]] = [arr[j], arr[idx]];
                      return { ...dd, exercises: arr };
                    })()
              ),
            }
      ),
    }));
  }
  async function toggleDesc(splitId, dayId, idx, eName) {
    const key = `${splitId}:${dayId}:${idx}`;
    if (descMap[key] === undefined) {
      try {
        const r = await fetch("/api/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exercise: eName }),
        });
        const j = await r.json();
        setDescMap((m) => ({ ...m, [key]: j?.text || "Unknown" }));
      } catch {
        setDescMap((m) => ({ ...m, [key]: "Unknown" }));
      }
    } else {
      setDescMap((m) => {
        const cp = { ...m };
        cp[key] = cp[key] === null ? "Unknown" : null;
        return cp;
      });
    }
  }

  function useTemplate(t) {
    const { name, daysText } = TEMPLATES[t];
    applyParsedToNewSplit(name, daysText);
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      {mode === "list" && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-neutral-300">Your splits</div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("paste")}
                className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
              >
                Import / Paste
              </button>
              <button
                onClick={() => setMode("templates")}
                className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
              >
                Templates
              </button>
              <button
                onClick={addManual}
                className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
              >
                Build manually
              </button>
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
                      <button
                        onClick={() => setActiveSplit(s.id)}
                        className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                      >
                        Set active
                      </button>
                    )}
                    <button
                      onClick={() => renameSplit(s.id)}
                      className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => resetSplit(s.id)}
                      className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm("Delete this split? (Past sessions stay)")) return;
                        setData((prev) => ({
                          ...prev,
                          splits: prev.splits.filter((x) => x.id !== s.id),
                          activeSplitId: prev.activeSplitId === s.id ? "" : prev.activeSplitId,
                        }));
                      }}
                      className="px-2 py-1 rounded text-red-400 text-xs"
                    >
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
                          <button
                            onClick={() => openAddExercise(s.id, d.id)}
                            className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                          >
                            Add exercise
                          </button>
                          <button
                            onClick={() => addDay(s.id)}
                            className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                          >
                            Add day
                          </button>
                        </div>
                      </div>

                      <ul className="mt-1 space-y-1">
                        {d.exercises.map((e, i) => {
                          const key = `${s.id}:${d.id}:${i}`;
                          const desc = descMap[key];
                          const show = desc !== undefined && desc !== null;
                          return (
                            <li key={i} className="text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1">
                              <div className="flex items-center justify-between">
                                <span>
                                  {e.name}{" "}
                                  <span className="text-neutral-500">
                                    ({e.sets}×{e.low}–{e.high} • {e.equip || "unknown"},{" "}
                                    {e.cat || "unknown"})
                                  </span>
                                </span>
                                <span className="flex gap-1">
                                  <button
                                    onClick={() => moveEx(s.id, d.id, i, "up")}
                                    className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    onClick={() => moveEx(s.id, d.id, i, "down")}
                                    className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    onClick={() => toggleDesc(s.id, d.id, i, e.name)}
                                    className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                                    title="Show description (AI)"
                                  >
                                    {show ? "Hide" : "Desc"}
                                  </button>
                                  <button
                                    onClick={() => openEditExercise(s.id, d.id, i, e)}
                                    className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => removeExercise(s.id, d.id, i)}
                                    className="px-2 py-1 rounded text-red-400 text-xs"
                                  >
                                    Remove
                                  </button>
                                </span>
                              </div>
                              {show && (
                                <div className="mt-1 text-xs text-neutral-300 whitespace-pre-wrap">
                                  {desc || "Unknown"}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => addDay(s.id)}
                  className="mt-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
                >
                  Add day
                </button>
              </div>
            ))}
            {data.splits.length === 0 && <div className="text-neutral-500">No splits yet</div>}
          </div>
        </>
      )}

      {mode === "paste" && (
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Paste your split</h3>
            <button onClick={() => setMode("list")} className="text-sm text-neutral-400">
              Back
            </button>
          </div>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={10}
            placeholder={`PUSH A\nIncline Barbell Press — 3 × 6–10\n...`}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={async () => {
                const name = prompt("Split name", "Imported Split");
                if (!name) return;
                const days = await smartParseSplit(paste);
                if (!days.length) {
                  alert("Couldn’t parse. Try 'Name — 3 × 8–12'.");
                  return;
                }
                const id = uid();
                const split = { id, name, days };
                setData((prev) => ({
                  ...prev,
                  splits: [...prev.splits, split],
                  activeSplitId: id,
                }));
                setMode("list");
              }}
              className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
            >
              Use this split
            </button>
            <label className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm cursor-pointer">
              Upload .txt
              <input
                type="file"
                accept="text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => setPaste(String(r.result));
                  r.readAsText(f);
                }}
              />
            </label>
          </div>
        </div>
      )}

      {mode === "templates" && (
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Templates</h3>
            <button onClick={() => setMode("list")} className="text-sm text-neutral-400">
              Back
            </button>
          </div>
          <div className="mt-2 grid gap-2">
            {Object.keys(TEMPLATES).map((key) => (
              <div key={key} className="rounded-lg border border-neutral-800 p-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{TEMPLATES[key].name}</div>
                  <div className="text-xs text-neutral-400">{TEMPLATES[key].blurb}</div>
                </div>
                <button
                  onClick={() => useTemplate(key)}
                  className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ExerciseEditor
        open={editor.open}
        initial={editor.initial}
        onCancel={() => setEditor({ open: false, splitId: "", dayId: "", idx: -1, initial: null })}
        onSave={saveExercise}
      />
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
      (s) => s.dayName.toLowerCase().includes(x) || s.entries.some((e) => e.exercise.toLowerCase().includes(x))
    );
  }, [q, items]);
  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by day/exercise"
          className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        />
        <div className="text-xs text-neutral-400 whitespace-nowrap">{filtered.length} sessions</div>
      </div>
      <div className="mt-3 grid gap-2">
        {activeId ? null : <div className="text-neutral-500">Pick an active split to see past sessions.</div>}
        {activeId && filtered.length === 0 && <div className="text-neutral-500">No sessions yet for this split</div>}
        {filtered.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">
                {s.dateISO} · {s.dayName}
              </div>
            </div>
            <div className="mt-2 grid gap-1 text-xs">
              {s.entries.map((e, i) => (
                <div key={i} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                  <div className="font-medium">{e.exercise}</div>
                  <div className="text-neutral-300">
                    {e.sets
                      .map((t) =>
                        `${t.failed ? "✖ " : ""}${t.bw ? "BW" : t.w + s.units}×${t.r}${
                          t.tags?.length ? ` [${t.tags.join(", ")}]` : ""
                        }`
                      )
                      .join(", ")}
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

// ---------- First-run Import ----------
function ImportFirstRun({ onUse }) {
  const [text, setText] = useState("");
  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <h2 className="font-semibold">Paste / Import your first split</h2>
      <p className="text-sm text-neutral-400">Paste from Notes/Docs (or upload .txt). You can edit later.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="mt-2 w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            const name = prompt("Split name", "My Split");
            if (!name) return;
            onUse(name, text);
          }}
          className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
        >
          Use this split
        </button>
        <label className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm cursor-pointer">
          Upload .txt
          <input
            type="file"
            accept="text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => setText(String(r.result));
              r.readAsText(f);
            }}
          />
        </label>
      </div>
    </section>
  );
}

// ---------- Templates ----------
const TEMPLATES = {
  ppl6: {
    name: "6-Day Push/Pull/Legs",
    blurb: "Arms/Delts priority, balanced volume.",
    daysText: `PUSH A
Cross Cable Y-Raises — 2 × 15
Overhead Rope Triceps Extensions — 3 × 10–12
Cable Lateral Raises — 3 × 12–15
Seated DB Shoulder Press — 3 × 6–10
Flat DB Press — 3 × 6–10

PULL A
Incline DB Curls — 3 × 8–12
Face Pulls — 2 × 12–15
Barbell Bent-Over Row — 3 × 6–10
Straight-Arm Lat Pulldown — 2 × 10–12
Dumbbell Shrugs — 3 × 12–15

LEGS A
Seated Hamstring Curls — 4 × 10–12
Back Squats — 3 × 6–8
Bulgarian Split Squats — 2 × 8–10
Leg Extensions — 2 × 10–12
Standing Calf Raises — 4 × 15

PULL B
EZ-Bar Preacher Curls — 3 × 8–12
Close-Grip Cable Row — 3 × 8–10
Neutral-Grip Pulldown — 2 × 8–10
Reverse Pec Deck — 3 × 15

PUSH B
Cross Cable Y-Raises — 2 × 15
Overhead Rope Extensions — 2 × 10–12
Dumbbell Lateral Raises — 3 × 12–15
Seated Machine Shoulder Press — 3 × 6–10
Incline Barbell Press — 3 × 6–10
Weighted Dips — 3 × 6–10

LEGS B
Lying Hamstring Curls — 4 × 10–12
Romanian Deadlifts — 3 × 8
Leg Press (High Foot) — 3 × 8–10
Seated Calf Raises — 4 × 15`,
  },
  ul4: {
    name: "4-Day Upper / Lower",
    blurb: "Classic high-stimulus plan.",
    daysText: `UPPER 1
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
Hack Squat or Leg Press — 3 × 8–10
Standing Calf Raise — 4 × 12–15`,
  },
  arnold: {
    name: "Arnold Split (Chest/Back · Shoulders/Arms · Legs ×2)",
    blurb: "Classic volume, aesthetics focus.",
    daysText: `CHEST + BACK
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
Standing Calf Raise — 4 × 12–15`,
  },
  ulppl5: {
    name: "5-Day Upper/Lower + PPL",
    blurb: "Hybrid for frequency & recovery.",
    daysText: `UPPER
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
Calves — 4 × 15`,
  },
};

// ---------- Chart helpers ----------
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
      <button
        onClick={() => setShow((v) => !v)}
        className="mt-2 text-[11px] px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
      >
        {show ? "Hide chart" : "Show chart"}
      </button>
      {show && (
        <div className="mt-2 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataFor(ex)} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
              <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 10 }} />
              <YAxis stroke="#a3a3a3" tick={{ fontSize: 10 }} />
              <Tooltip
                wrapperStyle={{ backgroundColor: "#111", border: "1px solid #444" }}
                labelStyle={{ color: "#ddd" }}
                itemStyle={{ color: "#ddd" }}
              />
              <Line type="monotone" dataKey="weight" dot={false} stroke="#ffffff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
