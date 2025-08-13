// src/App.jsx — SetForge v5
// - Firebase email/password auth + email verification
// - Multi-split library; AI importer via /api/parse-split
// - Failure-aware suggestions (local + /api/suggest fallback)
// - Tag modal + custom tags that actually persist
// - Add/remove/skip exercises in Log (ad-hoc without changing split)
// - Coach tab (chat) via /api/coach-chat; advice-only /api/coach after save
// - Anime backgrounds for Auth and first-run Import
// - Exercise descriptions via /api/describe
// - Offline-first localStorage per user

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

/* ---------------- constants ---------------- */
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
  "partials",
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

  // multipliers for increment when set did NOT fail vs failed
  noFailBump: 1.25, // slightly more aggressive if you did not fail
  failBump: 0.6, // more conservative if you failed
};

const DEFAULT_STATE = (units = CONFIG.unitsDefault) => ({
  units,
  activeSplitId: "",
  splits: [],
  sessions: [],
});

/* ---------------- utils ---------------- */
const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
const cx = (...a) => a.filter(Boolean).join(" ");
const lsKeyFor = (user) => `setforge_v5_${user?.uid || "guest"}`;
const save = (user, data) =>
  localStorage.setItem(lsKeyFor(user), JSON.stringify(data));
const load = (user) => {
  try {
    const raw = localStorage.getItem(lsKeyFor(user));
    return raw ? JSON.parse(raw) : DEFAULT_STATE();
  } catch {
    return DEFAULT_STATE();
  }
};

function guessEquip(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("smith")) return "smith";
  if (n.includes("barbell") || /\bbb\b/.test(n)) return "barbell";
  if (n.includes("dumbbell") || /\bdb\b/.test(n)) return "dumbbell";
  if (n.includes("cable") || n.includes("pulldown") || n.includes("rope"))
    return "cable";
  if (
    n.includes("dip") ||
    n.includes("hanging") ||
    n.includes("push-up") ||
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
  if (/(squat|deadlift|romanian|rdl|leg press|split squat)/.test(n))
    return "lower_comp";
  if (/(bench|press|row|pulldown|pull-down|weighted dip|shoulder press)/.test(n))
    return "upper_comp";
  return "iso_small";
}

function roundByEquip(weight, equip, units) {
  const step =
    units === "kg"
      ? equip === "machine"
        ? 1
        : equip === "dumbbell"
        ? 1.25
        : equip === "barbell"
        ? 2.5
        : 2.5
      : equip === "machine"
      ? CONFIG.machineStepLb
      : equip === "dumbbell"
      ? CONFIG.dumbbellStepLb
      : equip === "barbell"
      ? CONFIG.barbellStepLb
      : CONFIG.bodyweightStepLb;
  return Math.round(weight / step) * step;
}
function incByCategory(cat, units, current) {
  const pct =
    cat === "lower_comp"
      ? CONFIG.lowerPct
      : cat === "upper_comp"
      ? CONFIG.upperPct
      : CONFIG.isoPct;
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

/* ---------------- App ---------------- */
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(DEFAULT_STATE());
  const [tab, setTab] = useState("log"); // log | split | history | coach
  const [units, setUnits] = useState(CONFIG.unitsDefault);
  const [today, setToday] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [selectedDayId, setSelectedDayId] = useState("");

  const currentSplit = useMemo(
    () => data.splits.find((s) => s.id === data.activeSplitId),
    [data]
  );

  /* ---- auth state ---- */
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

  /* select default day when split changes */
  useEffect(() => {
    if (currentSplit) {
      setSelectedDayId(currentSplit.days?.[0]?.id || "");
    }
  }, [data.activeSplitId]); // eslint-disable-line

  const needsOnboarding = (data.splits?.length || 0) === 0;

  /* ---- logging state ---- */
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
    () =>
      currentSplit?.days?.find((d) => d.id === selectedDayId) ||
      currentSplit?.days?.[0],
    [currentSplit, selectedDayId]
  );

  // exercise draft per day: { [exerciseName]: [{ failed, w, r, tags, bw }] }
  const initialDraft = useMemo(() => {
    const map = {};
    if (!currentDay) return map;
    (currentDay.exercises || []).forEach((ex) => {
      const m = getMeta(ex);
      map[m.name] = Array.from({ length: m.sets }).map(() => ({
        failed: false,
        w: "",
        r: "",
        tags: [],
        bw: m.equip === "bodyweight", // quick toggle for bodyweight-only
      }));
    });
    return map;
  }, [currentDay]);

  const [draft, setDraft] = useState(initialDraft);
  const [skips, setSkips] = useState({}); // per-exercise "skip today"

  useEffect(() => {
    setDraft(initialDraft);
    setSkips({});
  }, [initialDraft]);

  const sessionVolume = useMemo(() => {
    if (!currentDay) return 0;
    return (currentDay.exercises || [])
      .map(getMeta)
      .map((m) =>
        (draft[m.name] || []).reduce(
          (s, t) => s + Math.max(0, +t.w || 0) * (+t.r || 0),
          0
        )
      )
      .reduce((a, b) => a + b, 0);
  }, [draft, currentDay]);

  /* ---- history helpers ---- */
  function getHistoryFor(exName) {
    return data.sessions
      .filter((s) => s.splitId === data.activeSplitId)
      .map((s) => s.entries.find((e) => e.exercise === exName))
      .filter(Boolean);
  }

  /* ---- failure-aware suggestions (local) ---- */
  function localSuggest(meta, idx) {
    const sets = draft[meta.name] || [];
    const s = sets[idx];
    if (!s) return null;

    const w = +s.w || 0;
    const r = +s.r || 0;
    if (!w || !r) return null;

    // base increment by category
    let d = incByCategory(meta.cat, units, w);

    // failure-aware multiplier (no failure -> larger bump)
    d *= s.failed ? CONFIG.failBump : CONFIG.noFailBump;

    if (meta.equip !== "bodyweight") {
      if (r >= meta.high) return roundByEquip(w + d, meta.equip, units);
      if (r < meta.low) return roundByEquip(Math.max(0, w - d), meta.equip, units);
      return roundByEquip(w, meta.equip, units);
    }
    // bodyweight: keep weight "bw", just suggest reps band direction
    if (r >= meta.high) return "aim more reps next time";
    if (r < meta.low) return "aim fewer reps next time";
    return "stay the course";
  }

  /* ---- save session ---- */
  function saveSession() {
    if (!currentSplit || !currentDay) {
      alert("Pick a split/day first");
      return;
    }
    const entries = (currentDay.exercises || [])
      .filter((ex) => !skips[ex.name]) // skip today if toggled
      .map(getMeta)
      .map((m) => {
        const arr = (draft[m.name] || []).filter(
          (s) =>
            // allow bw sets with r>0 even if weight blank
            ((m.equip === "bodyweight" && +s.r > 0) ||
              (s.w === "0" || s.w === 0 || +s.w > -99999)) &&
            +s.r > 0
        );
        if (!arr.length) return null;
        const sets = arr.map((s) => ({
          failed: !!s.failed,
          w: m.equip === "bodyweight" ? 0 : +s.w,
          r: +s.r,
          tags: s.tags || [],
          bw: !!s.bw,
        }));
        return {
          exercise: m.name,
          sets,
          volume: sets.reduce(
            (t, s) => t + Math.max(0, +s.w) * +s.r,
            0
          ),
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
      volume: entries.reduce((a, e) => a + e.volume, 0),
      units,
    };

    setData((prev) => ({ ...prev, sessions: [session, ...prev.sessions] }));

    // advice-only (non-blocking)
    try {
      fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day: currentDay.name,
          units,
          session,
          recent: data.sessions
            .filter((s) => s.splitId === data.activeSplitId)
            .slice(0, 6),
        }),
      });
    } catch {}
    alert("Session saved");
  }

  /* ---- split management ---- */
  function setActiveSplit(id) {
    setData((prev) => ({ ...prev, activeSplitId: id }));
  }
  function createSplit(name, days) {
    const id = uid();
    const split = {
      id,
      name: name || `Split ${(data.splits?.length || 0) + 1}`,
      days: days || [],
    };
    setData((prev) => ({
      ...prev,
      splits: [...prev.splits, split],
      activeSplitId: id,
    }));
  }
  function removeSplit(id) {
    if (!confirm("Delete this split? (sessions stay stored)")) return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.filter((s) => s.id !== id),
      activeSplitId: prev.activeSplitId === id ? "" : prev.activeSplitId,
    }));
  }

  async function applyParsedToNewSplitAI(splitName, raw) {
    try {
      const r = await fetch("/api/parse-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: String(raw || "").slice(0, 100000) }),
      });
      if (!r.ok) throw new Error("parse-split failed");
      const j = await r.json();
      const days = Array.isArray(j?.days) ? j.days : [];

      if (!days.length) throw new Error("no days returned");

      const id = uid();
      const split = {
        id,
        name: splitName || `Imported ${new Date().toISOString().slice(0, 10)}`,
        days: days.map((d) => ({
          id: d.id || uid(),
          name: d.name,
          exercises: d.exercises.map((e) => ({
            name: e.name,
            sets: e.sets,
            low: e.low,
            high: e.high,
            equip: e.equip || guessEquip(e.name),
            cat: e.cat || guessCat(e.name),
          })),
        })),
      };
      setData((prev) => ({
        ...prev,
        splits: [...prev.splits, split],
        activeSplitId: id,
      }));
      setTab("log");
    } catch (e) {
      alert(
        "Importer had trouble reading that. Try adding '— 3 × 8–12' style lines or simpler bullets."
      );
    }
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
            <nav className="mt-3 flex gap-2">
              <TabBtn
                label="Log"
                active={tab === "log"}
                onClick={() => setTab("log")}
                disabled={!data.activeSplitId}
              />
              <TabBtn
                label="Split"
                active={tab === "split"}
                onClick={() => setTab("split")}
              />
              <TabBtn
                label="Past Sessions"
                active={tab === "history"}
                onClick={() => setTab("history")}
              />
              <TabBtn
                label="Coach"
                active={tab === "coach"}
                onClick={() => setTab("coach")}
              />
            </nav>

            {/* Onboarding (first run) */}
            {needsOnboarding && (
              <OnboardCard onImport={() => setTab("split")} />
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
                skips={skips}
                setSkips={setSkips}
                units={units}
                today={today}
                setToday={setToday}
                sessionVolume={sessionVolume}
                localSuggest={localSuggest}
                saveSession={saveSession}
              />
            )}

            {tab === "split" && (
              <SplitView
                data={data}
                setData={setData}
                setActiveSplit={setActiveSplit}
                createSplit={createSplit}
                removeSplit={removeSplit}
                applyParsedToNewSplitAI={applyParsedToNewSplitAI}
              />
            )}

            {tab === "history" && <HistoryView data={data} />}

            {tab === "coach" && <CoachTab />}

            <footer className="text-center text-[10px] text-neutral-500 mt-6">
              Built for you. Works offline. Advice-only AI when online.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- UI bits ---------------- */
function TabBtn({ label, active, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "px-3 py-2 rounded-xl text-sm",
        active
          ? "bg-white text-neutral-900"
          : "bg-neutral-800 border border-neutral-700",
        disabled && "opacity-50"
      )}
    >
      {label}
    </button>
  );
}

function Header({ units, setUnits, user, setTab }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">SetForge</h1>
        <p className="text-xs text-neutral-400">
          Offline lift tracker · your data stays on device
        </p>
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

        {/* Coach avatar button to jump to Coach tab */}
        <button
          onClick={() => setTab("coach")}
          className="rounded-full overflow-hidden w-8 h-8 border border-neutral-700 hover:scale-[1.03] transition"
          title="Open Coach"
        >
          <img
            src="/images/coach-avatar.png"
            alt="Coach"
            className="w-full h-full object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        </button>

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

/* ---------------- Auth ---------------- */
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
        const cred = await createUserWithEmailAndPassword(
          getAuth(),
          email,
          pw
        );
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
    <section
      className="mt-8 rounded-2xl border border-neutral-800 p-4 relative overflow-hidden"
      style={{
        backgroundImage: "url(/images/bg-anime-login.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="backdrop-blur-sm bg-black/50 p-4 rounded-xl">
        <div className="text-center mb-3">
          <div className="text-2xl font-bold">SetForge</div>
          <div className="text-sm text-neutral-300">
            Sign {mode === "signin" ? "in" : "up"} to get started
          </div>
        </div>
        <div className="grid gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700"
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password (8+ chars)"
            className="px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700"
          />
          <button
            onClick={go}
            disabled={busy}
            className="px-3 py-2 rounded-xl bg-white text-neutral-900"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {msg && <div className="text-xs text-neutral-200">{msg}</div>}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-xs text-neutral-200 mt-1"
          >
            {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
        <p className="text-[10px] text-neutral-200 mt-3">
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

/* ---------------- Log View ---------------- */
function LogView({
  data,
  setData,
  currentSplit,
  selectedDayId,
  setSelectedDayId,
  draft,
  setDraft,
  skips,
  setSkips,
  units,
  today,
  setToday,
  sessionVolume,
  localSuggest,
  saveSession,
}) {
  const [tagModal, setTagModal] = useState(null); // { ex, idx }
  const [newTag, setNewTag] = useState("");

  if (!currentSplit)
    return (
      <div className="mt-6 text-sm text-neutral-400">
        Pick a split first in the Split tab.
      </div>
    );

  const day =
    currentSplit.days?.find((d) => d.id === selectedDayId) ||
    currentSplit.days?.[0];

  const getMeta = (i) => ({
    name: i.name,
    sets: i.sets,
    low: i.low,
    high: i.high,
    cat: i.cat,
    equip: i.equip,
  });

  function addSet(ex) {
    setDraft((prev) => ({
      ...prev,
      [ex]: [...(prev[ex] || []), { failed: false, w: "", r: "", tags: [], bw: false }],
    }));
  }
  function removeSetHere(ex, idx) {
    setDraft((prev) => {
      const arr = [...(prev[ex] || [])];
      arr.splice(idx, 1);
      return {
        ...prev,
        [ex]: arr.length ? arr : [{ failed: false, w: "", r: "", tags: [], bw: false }],
      };
    });
  }

  function addAdHocExercise() {
    const name = prompt("Exercise name (ad-hoc for today only)");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const cat = guessCat(name);
    const equip = guessEquip(name);
    // add into draft only
    setDraft((prev) => ({
      ...prev,
      [name]: Array.from({ length: sets }).map(() => ({
        failed: false,
        w: equip === "bodyweight" ? "" : "",
        r: "",
        tags: [],
        bw: equip === "bodyweight",
      })),
    }));
  }

  function toggleSkip(ex) {
    setSkips((p) => ({ ...p, [ex]: !p[ex] }));
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
        <div className="text-xs text-neutral-400">
          Session volume: <b className="text-neutral-100">{sessionVolume}</b> {units}·reps
        </div>
      </div>

      <div className="mt-3">
        <button
          onClick={addAdHocExercise}
          className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        >
          + Add exercise (today)
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        {(day?.exercises || [])
          .map(getMeta)
          .concat(
            // include any ad-hoc exercises present in draft but not defined in the day list
            Object.keys(draft)
              .filter((ex) => !(day?.exercises || []).some((e) => e.name === ex))
              .map((name) => ({
                name,
                sets: (draft[name] || []).length || 3,
                low: 8,
                high: 12,
                cat: guessCat(name),
                equip: guessEquip(name),
                adHoc: true,
              }))
          )
          .map((m) => {
            const ex = m.name;
            const sets = draft[ex] || [];

            return (
              <div key={ex} className="rounded-xl border border-neutral-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-base">{ex}</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSkip(ex)}
                      className={cx(
                        "px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs",
                        skips[ex] && "bg-neutral-700"
                      )}
                    >
                      {skips[ex] ? "Skipped" : "Skip today"}
                    </button>
                    <button
                      onClick={() => setTagModal({ ex, idx: -1 })}
                      className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                    >
                      Tags
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid gap-2">
                  {sets.map((s, idx) => {
                    const suggest = localSuggest(m, idx);
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-center"
                      >
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

                        <label className="text-[11px] text-neutral-300 flex items-center gap-1 col-span-2">
                          <input
                            type="checkbox"
                            checked={!!s.bw || m.equip === "bodyweight"}
                            disabled={m.equip === "bodyweight"}
                            onChange={() =>
                              updateSetFlag(setDraft, draft, ex, idx, "bw")
                            }
                          />
                          BW
                        </label>

                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder={m.equip === "bodyweight" || s.bw ? "bw" : `${units}`}
                          value={m.equip === "bodyweight" || s.bw ? "" : s.w}
                          onChange={(e) =>
                            updateSetField(
                              setDraft,
                              draft,
                              ex,
                              idx,
                              "w",
                              e.target.value
                            )
                          }
                          disabled={m.equip === "bodyweight" || s.bw}
                          className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="reps"
                          value={s.r}
                          onChange={(e) =>
                            updateSetField(
                              setDraft,
                              draft,
                              ex,
                              idx,
                              "r",
                              e.target.value
                            )
                          }
                          className="col-span-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                        />
                        <button
                          onClick={() => removeSetHere(ex, idx)}
                          className="col-span-2 text-red-400"
                          title="Remove set"
                        >
                          ✕
                        </button>

                        <div className="col-span-12 text-[11px] text-neutral-400">
                          {typeof suggest === "string" ? (
                            <>Next set: <b className="text-neutral-100">{suggest}</b></>
                          ) : suggest !== null ? (
                            <>
                              Next set:&nbsp;
                              <b className="text-neutral-100">
                                {suggest} {units}
                              </b>
                            </>
                          ) : null}
                        </div>
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

                {/* tiny chart */}
                <ChartToggle ex={ex} chartDataFor={chartDataFor(data)} />
              </div>
            );
          })}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={saveSession}
          className="px-4 py-2 rounded-xl bg-white text-neutral-900"
        >
          Save session
        </button>
      </div>

      {/* Tag modal (per-exercise persistent list) */}
      {tagModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-700 p-4">
            <div className="font-semibold mb-2">Tags for {tagModal.ex}</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    toggleTagField(setDraft, draft, tagModal.ex, 0, t, true /* all sets */)
                  }
                  className={cx(
                    "px-2 py-1 rounded-lg border text-sm",
                    "bg-neutral-800 border-neutral-700 hover:border-neutral-500"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Custom tag"
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
              />
              <button
                onClick={() => {
                  const t = newTag.trim();
                  if (!t) return;
                  toggleTagField(setDraft, draft, tagModal.ex, 0, t, true);
                  setNewTag("");
                }}
                className="px-3 py-2 rounded-lg bg-white text-neutral-900"
              >
                Add
              </button>
            </div>
            <div className="text-right mt-3">
              <button
                onClick={() => setTagModal(null)}
                className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* immutable helpers */
function updateSetField(setDraft, draft, ex, idx, key, val) {
  setDraft((prev) => {
    const arr = [...(prev[ex] || draft[ex] || [])];
    const row = { ...(arr[idx] || { failed: false, w: "", r: "", tags: [], bw: false }) };
    row[key] = val;
    arr[idx] = row;
    return { ...prev, [ex]: arr };
  });
}
function updateSetFlag(setDraft, draft, ex, idx, key) {
  setDraft((prev) => {
    const arr = [...(prev[ex] || draft[ex] || [])];
    const row = { ...(arr[idx] || { failed: false, w: "", r: "", tags: [], bw: false }) };
    row[key] = !row[key];
    arr[idx] = row;
    return { ...prev, [ex]: arr };
  });
}
function toggleTagField(setDraft, draft, ex, idx, tag, allSets = false) {
  setDraft((prev) => {
    const base = [...(prev[ex] || draft[ex] || [])];
    const indices = allSets ? base.map((_, i) => i) : [idx];
    indices.forEach((i) => {
      const row = { ...(base[i] || { failed: false, w: "", r: "", tags: [], bw: false }) };
      const has = (row.tags || []).includes(tag);
      row.tags = has ? row.tags.filter((x) => x !== tag) : [...(row.tags || []), tag];
      base[i] = row;
    });
    return { ...prev, [ex]: base };
  });
}

/* ---------------- Split View ---------------- */
function SplitView({
  data,
  setData,
  setActiveSplit,
  createSplit,
  removeSplit,
  applyParsedToNewSplitAI,
}) {
  const [mode, setMode] = useState("list"); // list | paste | templates
  const [paste, setPaste] = useState("");

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
        s.id === splitId
          ? { ...s, days: [...(s.days || []), { id: uid(), name, exercises: [] }] }
          : s
      ),
    }));
  }
  function addExercise(splitId, dayId) {
    const name = prompt("Exercise name");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const cat = guessCat(name);
    const equip = guessEquip(name);
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((s) =>
        s.id === splitId
          ? {
              ...s,
              days: s.days.map((d) =>
                d.id === dayId
                  ? {
                      ...d,
                      exercises: [
                        ...d.exercises,
                        { name, sets, low, high, cat, equip },
                      ],
                    }
                  : d
              ),
            }
          : s
      ),
    }));
  }
  function editExercise(splitId, dayId, idx) {
    setData((prev) => {
      const s = prev.splits.find((x) => x.id === splitId);
      const d = s.days.find((x) => x.id === dayId);
      const e = { ...d.exercises[idx] };
      const name = prompt("Exercise name", e.name) || e.name;
      const sets = Number(prompt("Sets", String(e.sets)) || e.sets);
      const low = Number(prompt("Low reps", String(e.low)) || e.low);
      const high = Number(prompt("High reps", String(e.high)) || e.high);
      const cat = guessCat(name);
      const equip = guessEquip(name);
      const newSplits = prev.splits.map((sp) =>
        sp.id !== splitId
          ? sp
          : {
              ...sp,
              days: sp.days.map((dd) =>
                dd.id !== dayId
                  ? dd
                  : {
                      ...dd,
                      exercises: dd.exercises.map((x, i) =>
                        i !== idx ? x : { name, sets, low, high, cat, equip }
                      ),
                    }
              ),
            }
      );
      return { ...prev, splits: newSplits };
    });
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
  function moveExercise(splitId, dayId, idx, dir) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const s = next.splits.find((x) => x.id === splitId);
      const d = s.days.find((x) => x.id === dayId);
      const arr = d.exercises;
      const j = idx + (dir === "up" ? -1 : 1);
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return next;
    });
  }

  async function usePaste() {
    const name = prompt("Split name", "Imported Split");
    if (!name) return;
    await applyParsedToNewSplitAI(name, paste);
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
                      onClick={() => {
                        const name = prompt(
                          "Split name",
                          data.splits.find((x) => x.id === s.id)?.name || ""
                        );
                        if (!name) return;
                        setData((prev) => ({
                          ...prev,
                          splits: prev.splits.map((ss) =>
                            ss.id === s.id ? { ...ss, name } : ss
                          ),
                        }));
                      }}
                      className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm("Reset this split (remove all days/exercises)?")) return;
                        setData((prev) => ({
                          ...prev,
                          splits: prev.splits.map((ss) =>
                            ss.id === s.id ? { ...ss, days: [] } : ss
                          ),
                        }));
                      }}
                      className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => removeSplit(s.id)}
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
                            onClick={() => addExercise(s.id, d.id)}
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
                        {d.exercises.map((e, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1"
                          >
                            <span>
                              {e.name}{" "}
                              <span className="text-neutral-500">
                                ({e.sets}×{e.low}–{e.high} • {e.equip}, {e.cat})
                              </span>
                            </span>
                            <span className="flex gap-1">
                              <button
                                onClick={() => moveExercise(s.id, d.id, i, "up")}
                                className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveExercise(s.id, d.id, i, "down")}
                                className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => editExercise(s.id, d.id, i)}
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
                          </li>
                        ))}
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
            {data.splits.length === 0 && (
              <div className="text-neutral-500">No splits yet</div>
            )}
          </div>
        </>
      )}

      {mode === "paste" && (
        <div
          className="rounded-xl p-3 border border-neutral-800"
          style={{
            backgroundImage: "url(/images/bg-anime-import.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="backdrop-blur-sm bg-black/50 p-3 rounded-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Paste your split</h3>
              <button
                onClick={() => setMode("list")}
                className="text-sm text-neutral-200"
              >
                Back
              </button>
            </div>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={10}
              placeholder={`PUSH A\nIncline Barbell Press — 3 × 6–10\n...`}
              className="mt-2 w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={usePaste}
                className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
              >
                Use this split (AI)
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
        </div>
      )}
    </section>
  );
}

/* ---------------- History ---------------- */
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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by day/exercise"
          className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        />
        <div className="text-xs text-neutral-400 whitespace-nowrap">
          {filtered.length} sessions
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {activeId ? null : (
          <div className="text-neutral-500">
            Pick an active split to see past sessions.
          </div>
        )}
        {activeId && filtered.length === 0 && (
          <div className="text-neutral-500">No sessions yet for this split</div>
        )}
        {filtered.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">
                {s.dateISO} · {s.dayName}
              </div>
              <div className="text-neutral-400">
                Vol {s.volume} {s.units}·reps
              </div>
            </div>
            <div className="mt-2 grid gap-1 text-xs">
              {s.entries.map((e, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-neutral-900 border border-neutral-800 p-2"
                >
                  <div className="font-medium">{e.exercise}</div>
                  <div className="text-neutral-300">
                    {e.sets
                      .map(
                        (t) =>
                          `${t.failed ? "✖ " : ""}${t.bw ? "bw" : t.w + s.units}×${
                            t.r
                          }${t.tags?.length ? ` [${t.tags.join(", ")}]` : ""}`
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

/* ---------------- Coach Tab (chat) ---------------- */
function CoachTab() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "I’m your hypertrophy coach. Ask about programming, technique, or how to use SetForge.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(-10), // short context
        }),
      });
      const j = await r.json();
      const reply = j?.reply || "…";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "I couldn't reach the server just now. Try again soon.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/images/coach-avatar.png"
            alt="Coach"
            className="w-7 h-7 rounded-full border border-neutral-700 object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div className="font-semibold">Coach</div>
        </div>
        <CoachBadge small />
      </div>

      <div className="mt-3 grid gap-2 max-h-[50vh] overflow-auto pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cx(
              "rounded-lg px-3 py-2",
              m.role === "assistant"
                ? "bg-neutral-800 border border-neutral-700"
                : "bg-white text-neutral-900 self-end"
            )}
          >
            {m.content}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about training or app help…"
          className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
        />
        <button
          onClick={send}
          disabled={busy}
          className="px-3 py-2 rounded-lg bg-white text-neutral-900"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </section>
  );
}
function CoachBadge({ small }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900",
        small ? "text-[10px] px-2 py-[2px]" : "text-xs px-3 py-1"
      )}
      title="Advice-only. Not medical advice."
    >
      🧠 Coach
    </span>
  );
}

/* ---------------- Import Onboarding ---------------- */
function OnboardCard({ onImport }) {
  return (
    <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <h2 className="font-semibold mb-1">Welcome to SetForge</h2>
      <p className="text-sm text-neutral-400">
        Offline lift tracker — your data stays on device. Start by importing or building a split.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onImport}
          className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
        >
          Paste / Import
        </button>
        <a
          href="#split"
          className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
          onClick={(e) => e.preventDefault()}
        >
          Templates (coming)
        </a>
      </div>
    </div>
  );
}

/* ---------------- Charts ---------------- */
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
            <LineChart
              data={chartDataFor(ex)}
              margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
            >
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
