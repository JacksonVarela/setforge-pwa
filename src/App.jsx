// SetForge — Auth + Multi-Splits + Coach (v4)
// Phone-first PWA with:
// • Firebase email/password auth + email verification (free tier)
// • Multi-split library (create/import/templates). Choose Active Split; Past Sessions filter by it.
// • Smart paste/import parser (txt) inside Split. Import shown on first run, then lives in Split.
// • Logging: "failed at" checkbox BEFORE weight/reps. (No RPE, no free notes; tags only.)
// • AI Coach (advice-only) via Vercel serverless /api/coach (uses OPENAI_API_KEY). Works offline gracefully.
// • Offline-first localStorage per user; cloud not required.

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
import { initFirebaseApp } from "./firebase"; // you created this file

initFirebaseApp();
const auth = getAuth();

// --------- Config & constants ---------
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

// --------- Utils ---------
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const cx = (...a) => a.filter(Boolean).join(" ");
const lsKeyFor = (user) => `setforge_v4_${user?.uid || "guest"}`;
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

// Heuristics to guess equip/category
function guessEquip(name) {
  const n = name.toLowerCase();
  if (n.includes("barbell") || n.includes("bb")) return "barbell";
  if (n.includes("dumbbell") || n.includes("db")) return "dumbbell";
  if (n.includes("cable") || n.includes("rope") || n.includes("pulldown"))
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
  return "machine";
}
function guessCat(name) {
  const n = name.toLowerCase();
  if (/(squat|deadlift|romanian|leg press|rdl|split squat)/.test(n))
    return "lower_comp";
  if (/(bench|press|row|pulldown|weighted dip|shoulder press)/.test(n))
    return "upper_comp";
  return "iso_small";
}

// Parser for pasted text lines: "Name — 3 × 8–12"
function parseSplitText(raw) {
  const days = [];
  const lines = String(raw).replace(/\r/g, "").split(/\n+/);
  let cur = null;
  const dayHeader =
    /^(?:\p{Emoji_Presentation}|\p{Emoji}\ufe0f|[\u2600-\u27BF])?\s*([A-Z][A-Z ]{2,}|Pull\s*[AB]|Push\s*[AB]|Legs?\s*[AB]|Upper|Lower|Rest|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/iu;
  const exLine =
    /^(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/•|\u2022|\*/g, "");
    if (!line) continue;
    const dh = line.match(dayHeader);
    if (dh) {
      cur = {
        id: uid(),
        name: line.replace(/^[\p{Emoji}\p{Emoji_Presentation}\ufe0f\s]+/u, ""),
        exercises: [],
      };
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
        cur = { id: uid(), name: "Day 1", exercises: [] };
        days.push(cur);
      }
      cur.exercises.push(item);
    }
  }
  return days;
}

// Math
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
    .sort(
      (a, b) =>
        (+b.w || 0) - (+a.w || 0) || (+b.r || 0) - (+a.r || 0)
    )[0];
}

// ---------- App ----------
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(DEFAULT_STATE());
  const [tab, setTab] = useState("log");
  const [units, setUnits] = useState(CONFIG.unitsDefault);
  const [today, setToday] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
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
    if (currentSplit) {
      setSelectedDayId(currentSplit.days?.[0]?.id || "");
    }
  }, [data.activeSplitId]);

  // Show onboarding if no splits at all
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
      }));
    });
    return map;
  }, [currentDay]);
  const [draft, setDraft] = useState(initialDraft);
  useEffect(() => setDraft(initialDraft), [initialDraft]);

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

  // Suggestions
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
    const delta = incByCategory(meta.cat, units, weight);
    let next = weight;
    if (reps >= meta.high)
      next = roundByEquip(weight + delta, meta.equip, units);
    else if (reps < meta.low)
      next = roundByEquip(Math.max(0, weight - delta), meta.equip, units);
    return { next, basis: { weight, reps, low: meta.low, high: meta.high } };
  }
  function liveSuggest(meta, idx) {
    const s = (draft[meta.name] || [])[idx];
    if (!s) return null;
    const w = +s.w || 0;
    const r = +s.r || 0;
    if (!w || !r) return null;
    const d = incByCategory(meta.cat, units, w);
    if (r >= meta.high) return roundByEquip(w + d, meta.equip, units);
    if (r < meta.low) return roundByEquip(Math.max(0, w - d), meta.equip, units);
    return roundByEquip(w, meta.equip, units);
  }

  function saveSession() {
    if (!currentSplit || !currentDay) {
      alert("Pick a split/day first");
      return;
    }
    const entries = (currentDay.exercises || [])
      .map(getMeta)
      .map((m) => {
        const arr = (draft[m.name] || []).filter(
          (s) => (s.w === "0" || s.w === 0 || +s.w > -99999) && +s.r > 0
        );
        if (!arr.length) return null;
        const sets = arr.map((s) => ({
          failed: !!s.failed,
          w: +s.w,
          r: +s.r,
          tags: s.tags || [],
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

    // AI coach (advice-only). If offline or no key, it's fine.
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
    if (!confirm("Delete this split? (sessions stay stored but filtered)"))
      return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.filter((s) => s.id !== id),
      activeSplitId: prev.activeSplitId === id ? "" : prev.activeSplitId,
    }));
  }
  function applyParsedToNewSplit(splitName, raw) {
    const days = parseSplitText(raw);
    if (!days.length) {
      alert("Couldn’t parse. Use lines like 'Name — 3 × 8–12'");
      return;
    }
    const id = uid();
    const split = {
      id,
      name: splitName || `Imported ${new Date().toISOString().slice(0, 10)}`,
      days: days.map((d) => ({
        id: d.id,
        name: d.name,
        exercises: d.exercises,
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
      <div className="mx-auto w-full max-w-screen-sm px-3 py-4">
        <Header units={units} setUnits={setUnits} user={user} />

        {!user ? (
          <AuthScreen />
        ) : user && !user.emailVerified ? (
          <VerifyScreen user={user} />
        ) : (
          <>
            {/* Tabs: Import only during onboarding; later lives in Split */}
            <nav className="mt-3 flex gap-2">
              <button
                onClick={() => setTab("log")}
                disabled={!data.activeSplitId}
                className={cx(
                  "px-3 py-2 rounded-xl text-sm",
                  tab === "log"
                    ? "bg-white text-neutral-900"
                    : "bg-neutral-800 border border-neutral-700",
                  !data.activeSplitId && "opacity-50"
                )}
              >
                Log
              </button>
              <button
                onClick={() => setTab("split")}
                className={cx(
                  "px-3 py-2 rounded-xl text-sm",
                  tab === "split"
                    ? "bg-white text-neutral-900"
                    : "bg-neutral-800 border border-neutral-700"
                )}
              >
                Split
              </button>
              <button
                onClick={() => setTab("history")}
                className={cx(
                  "px-3 py-2 rounded-xl text-sm",
                  tab === "history"
                    ? "bg-white text-neutral-900"
                    : "bg-neutral-800 border border-neutral-700"
                )}
              >
                Past Sessions
              </button>
              {needsOnboarding && (
                <button
                  onClick={() => setTab("import")}
                  className={cx(
                    "px-3 py-2 rounded-xl text-sm",
                    tab === "import"
                      ? "bg-white text-neutral-900"
                      : "bg-neutral-800 border border-neutral-700"
                  )}
                >
                  Import
                </button>
              )}
            </nav>

            {/* Onboarding card when no splits yet */}
            {needsOnboarding && tab !== "import" && (
              <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
                <h2 className="font-semibold mb-1">Welcome to SetForge</h2>
                <p className="text-sm text-neutral-400">
                  Offline lift tracker — your data stays on device. Start by
                  importing or building a split.
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
                sessionVolume={sessionVolume}
                suggestNext={suggestNext}
                liveSuggest={liveSuggest}
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
                applyParsedToNewSplit={applyParsedToNewSplit}
              />
            )}

            {tab === "history" && <HistoryView data={data} />}

            {tab === "import" && needsOnboarding && (
              <ImportFirstRun
                onUse={(name, raw) => applyParsedToNewSplit(name, raw)}
              />
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

// ---------- Header ----------
function Header({ units, setUnits, user }) {
  return (
    <header className="flex items-center justify-between">
      <div>
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
    <section className="mt-8 rounded-2xl border border-neutral-800 p-4">
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
  sessionVolume,
  suggestNext,
  liveSuggest,
  saveSession,
}) {
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

  // local helpers
  function addSet(ex) {
    setDraft((prev) => ({
      ...prev,
      [ex]: [...(prev[ex] || []), { failed: false, w: "", r: "", tags: [] }],
    }));
  }
  function removeSetHere(ex, idx) {
    setDraft((prev) => {
      const arr = [...(prev[ex] || [])];
      arr.splice(idx, 1);
      return {
        ...prev,
        [ex]: arr.length
          ? arr
          : [{ failed: false, w: "", r: "", tags: [] }],
      };
    });
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
          Session volume: <b className="text-neutral-100">{sessionVolume}</b>{" "}
          {units}·reps
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {(day?.exercises || []).map((exItem) => {
          const m = getMeta(exItem);
          const ex = m.name;
          const sets = draft[ex] || [];
          const vol = sets.reduce(
            (s, t) => s + Math.max(0, +t.w || 0) * (+t.r || 0),
            0
          );
          const sug = suggestNext(m);
          return (
            <div key={ex} className="rounded-xl border border-neutral-800 p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-base">{ex}</div>
                <div className="text-xs text-neutral-400">
                  {m.low}–{m.high} reps · Vol{" "}
                  <b className="text-neutral-100">{vol}</b>
                </div>
              </div>
              {sug && (
                <div className="mt-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1">
                  Next time: <b>{sug.next} {units}</b>{" "}
                  <span className="text-neutral-400">
                    (last {sug.basis.weight}
                    {units}×{sug.basis.reps})
                  </span>
                </div>
              )}
              <div className="mt-2 grid gap-2">
                {sets.map((s, idx) => {
                  const live = liveSuggest(m, idx);
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
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder={`${units}`}
                        value={s.w}
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
                        className="col-span-4 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
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
                        className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                      />
                      <button
                        onClick={() => removeSetHere(ex, idx)}
                        className="col-span-2 text-red-400"
                      >
                        ✕
                      </button>
                      <div className="col-span-12 text-[11px] text-neutral-300 flex flex-wrap gap-1">
                        {PRESET_TAGS.map((t) => (
                          <button
                            key={t}
                            onClick={() =>
                              toggleTagField(setDraft, draft, ex, idx, t)
                            }
                            className={cx(
                              "px-2 py-1 rounded-lg border",
                              (draft[ex]?.[idx]?.tags || []).includes(t)
                                ? "bg-white text-neutral-900 border-white"
                                : "bg-neutral-800 border-neutral-700"
                            )}
                          >
                            {t}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            addCustomTagField(setDraft, draft, ex, idx)
                          }
                          className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700"
                        >
                          + custom
                        </button>
                      </div>
                      {live !== null && (
                        <div className="col-span-12 text-[11px] text-neutral-400">
                          Next set:{" "}
                          <b className="text-neutral-100">
                            {live} {units}
                          </b>
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

              {/* progress chart toggle */}
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
    </section>
  );
}
// helpers for updating nested draft immutably
function updateSetField(setDraft, draft, ex, idx, key, val) {
  setDraft((prev) => {
    const arr = [...(prev[ex] || draft[ex] || [])];
    const row = { ...(arr[idx] || { failed: false, w: "", r: "", tags: [] }) };
    row[key] = val;
    arr[idx] = row;
    return { ...prev, [ex]: arr };
  });
}
function updateSetFlag(setDraft, draft, ex, idx, key) {
  setDraft((prev) => {
    const arr = [...(prev[ex] || draft[ex] || [])];
    const row = { ...(arr[idx] || { failed: false, w: "", r: "", tags: [] }) };
    row[key] = !row[key];
    arr[idx] = row;
    return { ...prev, [ex]: arr };
  });
}
function toggleTagField(setDraft, draft, ex, idx, tag) {
  setDraft((prev) => {
    const arr = [...(prev[ex] || draft[ex] || [])];
    const row = { ...(arr[idx] || { failed: false, w: "", r: "", tags: [] }) };
    const has = (row.tags || []).includes(tag);
    row.tags = has ? row.tags.filter((x) => x !== tag) : [...(row.tags || []), tag];
    arr[idx] = row;
    return { ...prev, [ex]: arr };
  });
}
function addCustomTagField(setDraft, draft, ex, idx) {
  const t = prompt("Custom tag");
  if (!t) return;
  toggleTagField(setDraft, draft, ex, idx, t.trim());
}

// ---------- Split View ----------
function SplitView({
  data,
  setData,
  setActiveSplit,
  createSplit,
  removeSplit,
  applyParsedToNewSplit,
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
  function addExercise(splitId, dayId) {
    const name = prompt("Exercise name");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const cat = prompt("Category iso_small|upper_comp|lower_comp", "iso_small") || "iso_small";
    const equip =
      prompt("Equip barbell|dumbbell|machine|cable|bodyweight", "machine") || "machine";
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((s) =>
        s.id === splitId
          ? {
              ...s,
              days: s.days.map((d) =>
                d.id === dayId
                  ? { ...d, exercises: [...d.exercises, { name, sets, low, high, cat, equip }] }
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
      const cat = prompt("Category iso_small|upper_comp|lower_comp", e.cat) || e.cat;
      const equip = prompt("Equip barbell|dumbbell|machine|cable|bodyweight", e.equip) || e.equip;
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
              onClick={() => {
                const name = prompt("Split name", "Imported Split");
                if (!name) return;
                applyParsedToNewSplit(name, paste);
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
              <div
                key={key}
                className="rounded-lg border border-neutral-800 p-2 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{TEMPLATES[key].name}</div>
                  <div className="text-xs text-neutral-400">
                    {TEMPLATES[key].blurb}
                  </div>
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
                          `${t.failed ? "✖ " : ""}${t.w}${s.units}×${t.r}${
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

// ---------- First-run Import screen ----------
function ImportFirstRun({ onUse }) {
  const [text, setText] = useState("");
  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <h2 className="font-semibold">Paste / Import your first split</h2>
      <p className="text-sm text-neutral-400">
        Paste from Notes/Docs (or upload .txt). You can edit later.
      </p>
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
