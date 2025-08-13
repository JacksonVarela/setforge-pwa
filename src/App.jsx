// SetForge — v5 (anime backgrounds + Coach tab + smarter logging)
// - Firebase email/password auth + email verification
// - Multi-splits with re-ordering, add/remove exercises, templates
// - Smarter paste/import (tries /api/parse first, falls back to local parser)
// - Logging: failure-aware suggestions; add/remove exercise for today; "Skip today"
// - Tags modal with working custom tags
// - Bodyweight toggle per set (no need to type 0)
// - Exercise "Desc" button (calls /api/exercise-desc)
// - AI Coach tab (Q&A + navigation help)
// - Anime background on Auth + first-run Import

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

/* ------------ Assets (put images here) ------------ */
// Upload these two files under public/images/…
// For now you can upload the same file twice (both names).
const BG_LOGIN  = "/images/bg-anime-login.png";
const BG_IMPORT = "/images/bg-anime-import.png";

/* ------------ Config & constants ------------ */
const PRESET_TAGS = [
  "tempo 3 1 1",
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
});

/* ------------ Utils ------------ */
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
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

// Equipment + category heuristics
function guessEquip(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("smith")) return "smith";
  if (n.includes("barbell") || /\bbb\b/.test(n)) return "barbell";
  if (n.includes("dumbbell") || /\bdb\b/.test(n)) return "dumbbell";
  if (n.includes("cable") || n.includes("pulldown") || n.includes("rope"))
    return "cable";
  if (
    n.includes("dip") ||
    n.includes("hanging") ||
    n.includes("push-up") ||
    n.includes("back extensions") ||
    n.includes("neck")
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
  const n = String(name || "").toLowerCase();
  if (/(squat|deadlift|romanian|rdl|leg press|split squat)/.test(n))
    return "lower_comp";
  if (/(bench|press|row|pulldown|pull-down|weighted dip|shoulder press)/.test(n))
    return "upper_comp";
  return "iso_small";
}

/* ------------ Paste/import parser (fallback) ------------ */
// headings = UPPER / LOWER / PUSH A / PULL B / LEGS / days of week etc.
function parseSplitTextLocal(raw) {
  const days = [];
  const cleaned = String(raw || "")
    .replace(/\r/g, "")
    // remove common bullet glyphs
    .replace(/[•\u2022]/g, "*");
  const lines = cleaned.split(/\n+/);
  let cur = null;

  const dayHeader =
    /^(?:\*|\d+\.)?\s*(PUSH(?:\s*[AB])?|PULL(?:\s*[AB])?|LEGS?(?:\s*[AB])?|UPPER(?:\s*\d+)?|LOWER(?:\s*\d+)?|CHEST\s*\+\s*BACK|SHOULDERS\s*\+\s*ARMS|REST|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s*$/i;

  const exLine =
    /^(?:\*|\d+\.)?\s*(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (dayHeader.test(line)) {
      cur = { id: uid(), name: line.replace(/^\*|\d+\.\s*/g, "").trim(), exercises: [] };
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

/* ------------ Math / suggestions ------------ */
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

/* ------------ Small UI helpers ------------ */
function HeroBg({ src }) {
  return (
    <div
      aria-hidden
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "saturate(1.1) brightness(0.9)",
      }}
      className="absolute inset-0 opacity-40"
    />
  );
}
function CoachBadge({ small = false }) {
  return (
    <div className={cx("rounded-xl px-3 py-1 bg-neutral-800/70 border border-neutral-700", small ? "text-[10px]" : "text-xs")}>
      🗡️ SetForge Coach
    </div>
  );
}

/* ------------ App ------------ */
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(DEFAULT_STATE());
  const [tab, setTab] = useState("log"); // log | split | history | coach
  const [units, setUnits] = useState(CONFIG.unitsDefault);
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [descModal, setDescModal] = useState({ open: false, title: "", body: "" });

  const currentSplit = useMemo(
    () => data.splits.find((s) => s.id === data.activeSplitId),
    [data]
  );
  const [selectedDayId, setSelectedDayId] = useState("");

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

  // Default day when active split changes
  useEffect(() => {
    if (currentSplit) setSelectedDayId(currentSplit.days?.[0]?.id || "");
  }, [data.activeSplitId]);

  const needsOnboarding = (data.splits?.length || 0) === 0;

  // ---- Logging state ----
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

  // per-day draft
  const initialDraft = useMemo(() => {
    const map = {};
    if (!currentDay) return map;
    (currentDay.exercises || []).forEach((ex) => {
      const m = getMeta(ex);
      map[m.name] = Array.from({ length: m.sets }).map(() => ({
        failed: false,
        bw: false, // bodyweight toggle
        w: "",
        r: "",
        tags: [],
      }));
    });
    return map;
  }, [currentDay]);
  const [draft, setDraft] = useState(initialDraft);
  const [skipMap, setSkipMap] = useState({}); // exName -> true to hide for today
  useEffect(() => {
    setDraft(initialDraft);
    setSkipMap({});
  }, [initialDraft]);

  // Suggestions — consider failure strongly
  function getHistoryFor(exName) {
    return data.sessions
      .filter((s) => s.splitId === data.activeSplitId)
      .map((s) => s.entries.find((e) => e.exercise === exName))
      .filter(Boolean);
  }
  function suggestNext(meta) {
    const histEntries = getHistoryFor(meta.name);
    if (histEntries.length === 0) return null;
    const last = histEntries[0];
    const top = bestSetByLoad(last.sets);
    if (!top) return null;

    const weight = +top.w || 0;
    const reps = +top.r || 0;
    const base = incByCategory(meta.cat, units, weight);

    const total = last.sets.length || 1;
    const failedCnt = last.sets.filter((s) => s.failed).length;
    // If no failure → more aggressive. If many failures → conservative.
    const mult = failedCnt === 0 ? 1.25 : failedCnt / total >= 0.5 ? 0.5 : 0.9;
    let delta = base * mult;

    let next = weight;
    if (failedCnt === 0 && reps >= meta.high)
      next = roundByEquip(weight + delta, meta.equip, units);
    else if (failedCnt / total >= 0.5 || reps < meta.low)
      next = roundByEquip(Math.max(0, weight - delta), meta.equip, units);
    else
      next = roundByEquip(weight, meta.equip, units);

    return { next, basis: { weight, reps, low: meta.low, high: meta.high, failedCnt, total } };
  }
  function liveSuggest(meta, idx) {
    const s = (draft[meta.name] || [])[idx];
    if (!s) return null;
    const w = +s.w || 0;
    const r = +s.r || 0;
    if (s.bw) return null; // bodyweight: skip numeric suggestion
    if (!w || !r) return null;

    const base = incByCategory(meta.cat, units, w);
    const mult = s.failed ? 0.8 : 1.15;
    const d = base * mult;

    if (s.failed || r < meta.low) return roundByEquip(Math.max(0, w - d), meta.equip, units);
    if (r >= meta.high) return roundByEquip(w + d, meta.equip, units);
    return roundByEquip(w, meta.equip, units);
  }

  function saveSession() {
    if (!currentSplit || !currentDay) {
      alert("Pick a split/day first");
      return;
    }
    const entries = (currentDay.exercises || [])
      .filter((ex) => !skipMap[ex.name])
      .map(getMeta)
      .map((m) => {
        const arr = (draft[m.name] || []).filter((s) => (+s.r || 0) > 0);
        if (!arr.length) return null;
        const sets = arr.map((s) => ({
          failed: !!s.failed,
          w: s.bw ? 0 : +s.w || 0,
          r: +s.r,
          tags: s.tags || [],
          bw: !!s.bw,
        }));
        return { exercise: m.name, sets, units };
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

    // Fire-and-forget: let serverless coach observe (optional)
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

  // ----- Split management -----
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
  function moveExercise(splitId, dayId, idx, dir) {
    setData((prev) => {
      const splits = prev.splits.map((sp) => {
        if (sp.id !== splitId) return sp;
        const days = sp.days.map((d) => {
          if (d.id !== dayId) return d;
          const arr = [...d.exercises];
          const j = idx + (dir === "up" ? -1 : 1);
          if (j < 0 || j >= arr.length) return d;
          [arr[idx], arr[j]] = [arr[j], arr[idx]];
          return { ...d, exercises: arr };
        });
        return { ...sp, days };
      });
      return { ...prev, splits };
    });
  }
  function addExercise(splitId, dayId) {
    // simple picker (no typing categories)
    const name = prompt("Exercise name");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);

    const equip = selectOption("Equipment", ["barbell","dumbbell","machine","cable","smith","bodyweight","unknown"], guessEquip(name));
    const cat   = selectOption("Category", ["upper_comp","lower_comp","iso_small"], guessCat(name));

    setData((prev) => {
      const splits = prev.splits.map((sp) => {
        if (sp.id !== splitId) return sp;
        const days = sp.days.map((d) => {
          if (d.id !== dayId) return d;
          return {
            ...d,
            exercises: [...d.exercises, { name, sets, low, high, cat, equip }],
          };
        });
        return { ...sp, days };
      });
      return { ...prev, splits };
    });
  }
  function editExercise(splitId, dayId, idx) {
    setData((prev) => {
      const sp = prev.splits.find((x) => x.id === splitId);
      const d = sp.days.find((x) => x.id === dayId);
      const e = { ...d.exercises[idx] };

      const name = prompt("Exercise name", e.name) || e.name;
      const sets = Number(prompt("Sets", String(e.sets)) || e.sets);
      const low = Number(prompt("Low reps", String(e.low)) || e.low);
      const high = Number(prompt("High reps", String(e.high)) || e.high);

      const equip = selectOption("Equipment", ["barbell","dumbbell","machine","cable","smith","bodyweight","unknown"], e.equip);
      const cat   = selectOption("Category", ["upper_comp","lower_comp","iso_small"], e.cat);

      const splits = prev.splits.map((sp2) =>
        sp2.id !== splitId
          ? sp2
          : {
              ...sp2,
              days: sp2.days.map((dd) =>
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
      return { ...prev, splits };
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
  function addDay(splitId) {
    const name = prompt("Day name", "DAY " + ((currentSplit?.days?.length || 0) + 1));
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

  // Description modal
  async function showDesc(exName) {
    try {
      const r = await fetch("/api/exercise-desc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: exName }),
      });
      const j = await r.json();
      const text = (j?.advice || "").trim() || "No description available.";
      setDescModal({ open: true, title: exName, body: text });
    } catch {
      setDescModal({ open: true, title: exName, body: "No description available." });
    }
  }

  // Import helper that tries /api/parse first
  async function applyParsedToNewSplit(name, raw) {
    let days = [];
    try {
      const r = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
      });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j?.days) && j.days.length) days = j.days;
      }
    } catch {}
    if (!days.length) days = parseSplitTextLocal(raw);
    if (!days.length) return alert("Sorry—couldn’t read that. Try headers and lines like: Name — 3 × 8–12");

    const id = uid();
    const split = {
      id,
      name: name || `Imported ${new Date().toISOString().slice(0, 10)}`,
      days: days.map((d) => ({
        id: d.id || uid(),
        name: d.name,
        exercises: (d.exercises || []).map((e) => ({
          name: e.name,
          sets: +e.sets || 3,
          low: +e.low || 8,
          high: +e.high || 12,
          cat: e.cat || guessCat(e.name),
          equip: e.equip || guessEquip(e.name),
        })),
      })),
    };
    setData((prev) => ({
      ...prev,
      splits: [...prev.splits, split],
      activeSplitId: id,
    }));
    setTab("log");
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      {/* Desc modal */}
      {descModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-neutral-900 border border-neutral-700 p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{descModal.title}</div>
              <button onClick={() => setDescModal({ open: false, title: "", body: "" })}>✕</button>
            </div>
            <div className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap">{descModal.body}</div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-screen-sm px-3 py-4 relative">
        <Header units={units} setUnits={setUnits} user={user} setTab={setTab} />

        {!user ? (
          <AuthScreen />
        ) : user && !user.emailVerified ? (
          <VerifyScreen user={user} />
        ) : (
          <>
            {/* Tabs */}
            <nav className="mt-3 flex gap-2">
              {["log","split","history","coach"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  disabled={t !== "split" && t !== "coach" && !data.activeSplitId && t !== "history"}
                  className={cx(
                    "px-3 py-2 rounded-xl text-sm",
                    tab === t
                      ? "bg-white text-neutral-900"
                      : "bg-neutral-800 border border-neutral-700",
                    (t === "log" && !data.activeSplitId) && "opacity-50"
                  )}
                >
                  {t === "log" ? "Log" : t === "split" ? "Split" : t === "history" ? "Past Sessions" : "Coach"}
                </button>
              ))}
              {needsOnboarding && (
                <button
                  onClick={() => setTab("import_first")}
                  className={cx(
                    "px-3 py-2 rounded-xl text-sm",
                    tab === "import_first"
                      ? "bg-white text-neutral-900"
                      : "bg-neutral-800 border border-neutral-700"
                  )}
                >
                  Import
                </button>
              )}
            </nav>

            {/* Onboarding card */}
            {needsOnboarding && tab !== "import_first" && (
              <div className="mt-4 rounded-2xl border border-neutral-800 p-4 relative overflow-hidden">
                <HeroBg src={BG_IMPORT} />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold mb-1">Welcome to SetForge</h2>
                    <CoachBadge small />
                  </div>
                  <p className="text-sm text-neutral-300">
                    Offline lift tracker — your data stays on device. Start by importing or building a split.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setTab("import_first")}
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
                suggestNext={suggestNext}
                liveSuggest={liveSuggest}
                saveSession={saveSession}
                skipMap={skipMap}
                setSkipMap={setSkipMap}
              />
            )}

            {tab === "split" && (
              <SplitView
                data={data}
                setData={setData}
                setActiveSplit={setActiveSplit}
                createSplit={createSplit}
                removeSplit={removeSplit}
                addExercise={addExercise}
                editExercise={editExercise}
                removeExercise={removeExercise}
                moveExercise={moveExercise}
                addDay={addDay}
              />
            )}

            {tab === "history" && <HistoryView data={data} />}

            {tab === "coach" && <CoachTab />}

            {tab === "import_first" && needsOnboarding && (
              <ImportFirstRun onUse={(name, raw) => applyParsedToNewSplit(name, raw)} />
            )}

            <footer className="text-center text-[10px] text-neutral-500 mt-6">
              Built for you. Works offline. Advice-only AI coach when online.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------ Header ------------ */
function Header({ units, setUnits, user, setTab }) {
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
        {user && (
          <>
            <button
              onClick={() => setTab("coach")}
              className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
            >
              Coach
            </button>
            <button
              onClick={() => signOut(getAuth())}
              className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}

/* ------------ Auth Screens ------------ */
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
    <section className="mt-8 rounded-2xl border border-neutral-800 p-4 relative overflow-hidden">
      <HeroBg src={BG_LOGIN} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="text-2xl font-bold">SetForge</div>
          <CoachBadge />
        </div>
        <div className="text-sm text-neutral-300 mb-2">
          Sign {mode === "signin" ? "in" : "up"} to get started
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
            className="text-xs text-neutral-400 mt-1"
          >
            {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
        <p className="text-[10px] text-neutral-400 mt-3">
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

/* ------------ Log View ------------ */
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
  suggestNext,
  liveSuggest,
  saveSession,
  skipMap,
  setSkipMap,
}) {
  if (!currentSplit)
    return <div className="mt-6 text-sm text-neutral-400">Pick a split first in the Split tab.</div>;

  const day = currentSplit.days?.find((d) => d.id === selectedDayId) || currentSplit.days?.[0];

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
  function addExerciseToday() {
    const ex = prompt("Add an exercise (just for today)");
    if (!ex) return;
    setDraft((prev) => ({ ...prev, [ex]: [{ failed: false, bw: false, w: "", r: "", tags: [] }] }));
  }
  function removeExerciseToday(ex) {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[ex];
      return next;
    });
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-400">Split</label>
          <select
            value={currentSplit.id}
            onChange={(e) => setData((prev) => ({ ...prev, activeSplitId: e.target.value }))}
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          >
            {data.splits.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <label className="text-xs text-neutral-400 ml-2">Day</label>
          <select
            value={day?.id || ""}
            onChange={(e) => setSelectedDayId(e.target.value)}
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          >
            {(currentSplit.days || []).map((d) => (
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
        </div>
        <button
          onClick={addExerciseToday}
          className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
        >
          + Add exercise (today)
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        {Object.keys(draft).map((ex) => {
          // If this exercise isn't in the split day, still render (because user added it for today)
          const meta = (day?.exercises || []).map(getMeta).find((m) => m.name === ex) || {
            name: ex,
            sets: (draft[ex] || []).length || 1,
            low: 8,
            high: 12,
            cat: "iso_small",
            equip: "unknown",
          };
          if (skipMap[ex]) return null;

          const sets = draft[ex] || [];
          const sug = suggestNext(meta);

          return (
            <div key={ex} className="rounded-xl border border-neutral-800 p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-base">{ex}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSkipMap((m) => ({ ...m, [ex]: true }))}
                    className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                  >
                    Skip today
                  </button>
                  <button
                    onClick={() => removeExerciseToday(ex)}
                    className="text-xs text-red-400"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {sug && (
                <div className="mt-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1">
                  Next time: <b>{sug.next} {meta.equip === "bodyweight" ? "" : units}</b>{" "}
                  <span className="text-neutral-400">
                    (last {sug.basis.weight}{units}×{sug.basis.reps}
                    {sug.basis.failedCnt ? ` · ${sug.basis.failedCnt} fail` : ""})
                  </span>
                </div>
              )}

              <div className="mt-2 grid gap-2">
                {sets.map((s, idx) => {
                  const live = meta.equip === "bodyweight" || s.bw ? null : liveSuggest(meta, idx);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <label className="col-span-3 text-[11px] text-neutral-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!s.failed}
                          onChange={() => updateSetFlag(setDraft, draft, ex, idx, "failed")}
                        /> failed at
                      </label>
                      <label className="col-span-2 text-[11px] text-neutral-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!s.bw}
                          onChange={() => updateSetFlag(setDraft, draft, ex, idx, "bw")}
                        /> BW
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        disabled={s.bw}
                        placeholder={s.bw ? "bodyweight" : units}
                        value={s.w}
                        onChange={(e) => updateSetField(setDraft, draft, ex, idx, "w", e.target.value)}
                        className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="reps"
                        value={s.r}
                        onChange={(e) => updateSetField(setDraft, draft, ex, idx, "r", e.target.value)}
                        className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                      />
                      <button onClick={() => removeSetHere(ex, idx)} className="col-span-1 text-red-400">
                        ✕
                      </button>

                      <div className="col-span-12">
                        <TagsModal ex={ex} idx={idx} draft={draft} setDraft={setDraft} />
                      </div>

                      {live !== null && (
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
        <button
          onClick={() => setSkipMap({})}
          className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
        >
          Unskip all
        </button>
      </div>
    </section>
  );
}

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

/* ------------ Tags Modal ------------ */
function TagsModal({ ex, idx, draft, setDraft }) {
  const [open, setOpen] = useState(false);
  const tags = draft[ex]?.[idx]?.tags || [];
  function toggle(t) {
    setDraft((prev) => {
      const arr = [...(prev[ex] || draft[ex] || [])];
      const row = { ...(arr[idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
      const has = (row.tags || []).includes(t);
      row.tags = has ? row.tags.filter((x) => x !== t) : [...(row.tags || []), t];
      arr[idx] = row;
      return { ...prev, [ex]: arr };
    });
  }
  function addCustom() {
    const t = prompt("Custom tag");
    if (!t) return;
    toggle(t.trim());
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
      >
        Tags
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-2xl bg-neutral-900 border border-neutral-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Tags — {ex} (set {idx + 1})</div>
              <button onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => toggle(t)}
                  className={cx(
                    "px-2 py-1 rounded-lg border text-xs",
                    tags.includes(t)
                      ? "bg-white text-neutral-900 border-white"
                      : "bg-neutral-800 border-neutral-700"
                  )}
                >
                  {t}
                </button>
              ))}
              <button
                onClick={addCustom}
                className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-xs"
              >
                + custom
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------ Split View ------------ */
function SplitView({
  data,
  setData,
  setActiveSplit,
  createSplit,
  removeSplit,
  addExercise,
  editExercise,
  removeExercise,
  moveExercise,
  addDay,
}) {
  const [mode, setMode] = useState("list"); // list | paste | templates
  const [paste, setPaste] = useState("");

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
  function useTemplate(t) {
    const { name, daysText } = TEMPLATES[t];
    // Use the local parser for templates (they're pre-formatted)
    const days = parseSplitTextLocal(daysText);
    const id = uid();
    const split = {
      id,
      name,
      days: days.map((d) => ({ id: d.id, name: d.name, exercises: d.exercises })),
    };
    setData((prev) => ({
      ...prev,
      splits: [...prev.splits, split],
      activeSplitId: id,
    }));
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
                onClick={() => createSplit()}
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
                                onClick={() => showDesc(e.name)}
                                className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                              >
                                Desc
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
            {data.splits.length === 0 && <div className="text-neutral-500">No splits yet</div>}
          </div>
        </>
      )}

      {mode === "paste" && (
        <div className="relative">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Paste your split</h3>
            <button onClick={() => setMode("list")} className="text-sm text-neutral-400">Back</button>
          </div>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={12}
            placeholder={`PUSH A\nIncline Barbell Press — 3 × 6–10\n...\n\nLEGS B\nRomanian Deadlift — 3 × 6–8`}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => {
                const name = prompt("Split name", "Imported Split");
                if (!name) return;
                // Lift to parent (App) via CustomEvent (simpler than prop drill here)
                window.dispatchEvent(new CustomEvent("setforge_import", { detail: { name, paste } }));
              }}
              className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
            >
              Preview & Use
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
            <button onClick={() => setMode("list")} className="text-sm text-neutral-400">Back</button>
          </div>
          <div className="mt-2 grid gap-2">
            {Object.keys(TEMPLATES).map((key) => (
              <div key={key} className="rounded-lg border border-neutral-800 p-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{TEMPLATES[key].name}</div>
                  <div className="text-xs text-neutral-400">{TEMPLATES[key].blurb}</div>
                </div>
                <button onClick={() => useTemplate(key)} className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm">
                  Use
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------ History ------------ */
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
        <div className="text-xs text-neutral-400 whitespace-nowrap">{filtered.length} sessions</div>
      </div>

      <div className="mt-3 grid gap-2">
        {!activeId && <div className="text-neutral-500">Pick an active split to see past sessions.</div>}
        {activeId && filtered.length === 0 && <div className="text-neutral-500">No sessions yet for this split</div>}
        {filtered.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-800 p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">{s.dateISO} · {s.dayName}</div>
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

/* ------------ First-run Import screen ------------ */
function ImportFirstRun({ onUse }) {
  const [text, setText] = useState("");

  // Wire up the "Preview & Use" button from SplitView paste mode
  useEffect(() => {
    const h = (e) => {
      const { name, paste } = e.detail || {};
      if (!name || !paste) return;
      onUse(name, paste);
    };
    window.addEventListener("setforge_import", h);
    return () => window.removeEventListener("setforge_import", h);
  }, [onUse]);

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4 relative overflow-hidden">
      <HeroBg src={BG_IMPORT} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Paste / Import your first split</h2>
          <CoachBadge />
        </div>
        <p className="text-sm text-neutral-300">Paste from Notes/Docs (or upload .txt). You can edit later.</p>
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
      </div>
    </section>
  );
}

/* ------------ Coach Tab ------------ */
function CoachTab() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Hey! I’m your hypertrophy-focused coach. Ask about training, exercise form, progression, or navigating the app (e.g., “how do I import a split?”)." },
  ]);

  async function ask() {
    if (!input.trim()) return;
    const q = input.trim();
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day: "general",
          units: "lb",
          session: {},
          question: q,
          recent: [],
        }),
      });
      const j = await r.json();
      const a = (j?.advice || "No answer.") + "\n";
      setMsgs((m) => [...m, { role: "assistant", content: a }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I’m offline. Try again later." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Coach</div>
        <CoachBadge small />
      </div>
      <div className="mt-3 space-y-2 max-h-[50vh] overflow-auto pr-1">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cx(
              "px-3 py-2 rounded-lg text-sm",
              m.role === "assistant" ? "bg-neutral-800 border border-neutral-700" : "bg-neutral-900 border border-neutral-800"
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
          placeholder='Ask: "progress stalled on incline DB press—what now?"'
          className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        />
        <button
          onClick={ask}
          disabled={busy}
          className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm"
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </section>
  );
}

/* ------------ Templates ------------ */
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
    name: "Arnold (Chest/Back · Shoulders/Arms · Legs ×2)",
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

/* ------------ Chart helpers ------------ */
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

/* ------------ tiny helper ------------ */
function selectOption(title, options, current) {
  const pretty = `${title}:\n${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n(Current: ${current || "unknown"})\nType number:`;
  const pick = Number(prompt(pretty, "1") || 1) - 1;
  return options[pick] || current || options[0];
}
