// SetForge — v5 (Auth + Multi-Splits + AI Importer + Coach + Failure-aware)
// Phone-first PWA. Offline-first (localStorage) + Firebase Auth (email verify).
// Images used: /images/bg-anime-login.png, /images/bg-anime-import.png, /images/coach-sticker.png

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

// ---------- Config ----------
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
  "partial reps",
  "rest-pause",
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

// Guess equipment & category quickly (AI parser also tries to fill these)
function guessEquip(name) {
  const n = name.toLowerCase();
  if (n.includes("smith")) return "smith_machine";
  if (n.includes("barbell") || n.includes("bb")) return "barbell";
  if (n.includes("dumbbell") || n.includes("db")) return "dumbbell";
  if (n.includes("cable") || n.includes("rope") || n.includes("pulldown"))
    return "cable";
  if (
    n.includes("dip") ||
    n.includes("hanging") ||
    n.includes("push-up") ||
    n.includes("push up") ||
    n.includes("neck") ||
    n.includes("back extension") ||
    n.includes("chin-up") ||
    n.includes("pull-up")
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
    n.includes("calf") ||
    n.includes("hack squat")
  )
    return "machine";
  return "machine";
}
function guessCat(name) {
  const n = name.toLowerCase();
  if (/(squat|deadlift|romanian|hack|leg press|rdl|split squat)/.test(n))
    return "lower_comp";
  if (/(bench|press|row|pulldown|weighted dip|shoulder press|chin-up|pull-up)/.test(n))
    return "upper_comp";
  return "iso_small";
}

// Parse plain text split (basic). We also support AI parsing via /api/parse-split
function parseSplitText(raw) {
  const days = [];
  const lines = String(raw).replace(/\r/g, "").split(/\n+/);
  let cur = null;

  const dayHeader =
    /^(?:\p{Emoji_Presentation}|\p{Emoji}\ufe0f|[\u2600-\u27BF])?\s*([A-Z][A-Z \+\&/]{2,}|Pull\s*[AB]?|Push\s*[AB]?|Legs?\s*[AB]?|Upper|Lower|Rest|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/iu;
  const exLine =
    /^(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;

  for (const rawLine of lines) {
    // remove bullets (•, -, *) and keep content
    const line = rawLine.trim().replace(/^[•\-\*\u2022]\s*/, "");
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

// Rounding by equipment
function roundByEquip(weight, equip, units) {
  const step =
    units === "kg"
      ? equip === "machine"
        ? 1
        : equip === "dumbbell"
        ? 1.25
        : equip === "barbell" || equip === "smith_machine"
        ? 2.5
        : 2.5
      : equip === "machine"
      ? CONFIG.machineStepLb
      : equip === "dumbbell"
      ? CONFIG.dumbbellStepLb
      : equip === "barbell" || equip === "smith_machine"
      ? CONFIG.barbellStepLb
      : CONFIG.bodyweightStepLb;
  return Math.round(weight / step) * step;
}

// Failure-aware increase size by category
function incByCategory(cat, units, current, failureBias = 0) {
  // failureBias: -1 (failed), 0 (neutral), +1 (no fail, crushed the set)
  const basePct =
    cat === "lower_comp"
      ? CONFIG.lowerPct
      : cat === "upper_comp"
      ? CONFIG.upperPct
      : CONFIG.isoPct;

  // bias the pct: reduce when failed, increase when not failing
  const biasPct = basePct * (failureBias > 0 ? 1.35 : failureBias < 0 ? 0.6 : 1.0);

  const raw = (+current || 0) * biasPct;
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
  const [tab, setTab] = useState("log"); // log | split | history | coach
  const [units, setUnits] = useState(CONFIG.unitsDefault);
  const [today, setToday] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [showSticker, setShowSticker] = useState(false);

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
  }, [data.activeSplitId]); // eslint-disable-line

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

  // Build the initial draft (includes split exercises)
  const baseDraft = useMemo(() => {
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

  // Allow temporary exercises only for today's session (doesn't modify split)
  const [extraExercises, setExtraExercises] = useState([]); // [{name, cat, equip, sets, low, high}]
  const [draft, setDraft] = useState(baseDraft);

  useEffect(() => {
    setExtraExercises([]);
    setDraft(baseDraft);
  }, [baseDraft]);

  // Merge extras into draft view (only if they aren’t present)
  useEffect(() => {
    if (extraExercises.length === 0) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const ex of extraExercises) {
        if (!next[ex.name]) {
          next[ex.name] = Array.from({ length: ex.sets || 1 }).map(() => ({
            failed: false,
            w: "",
            r: "",
            tags: [],
          }));
        }
      }
      return next;
    });
  }, [extraExercises]);

  // Suggestions (history scoped to active split)
  function getHistoryFor(exName) {
    return data.sessions
      .filter((s) => s.splitId === data.activeSplitId)
      .map((s) => s.entries.find((e) => e.exercise === exName))
      .filter(Boolean);
  }

  // Reservation: if equip is bodyweight, suggestions focus on reps; we still allow added load if user enters it.
  function suggestNext(meta) {
    const histEntries = getHistoryFor(meta.name);
    if (histEntries.length === 0) return null;
    const last = histEntries[0];
    const top = bestSetByLoad(last.sets);
    if (!top) return null;

    const weight = +top.w || 0;
    const reps = +top.r || 0;
    // derive bias from failure flag on best set (if any)
    const bestFailed = !!top.failed;
    const failureBias = bestFailed ? -1 : 1;

    // If user hit the top of range and didn't fail => encourage bump
    // If user failed and didn't reach low range => conservative or down
    let delta = incByCategory(meta.cat, units, weight || (meta.equip === "bodyweight" ? 100 : 0), failureBias);
    let next = weight;

    if (meta.equip === "bodyweight") {
      // For bodyweight, keep weight as-is (0) and cue reps progression implicitly
      return { next: 0, basis: { weight, reps, low: meta.low, high: meta.high }, bw: true };
    }

    if (!bestFailed && reps >= meta.high) {
      next = roundByEquip((weight || 0) + delta, meta.equip, units);
    } else if (bestFailed && reps <= meta.low) {
      // failed early -> hold or even reduce slightly
      next = roundByEquip(Math.max(0, (weight || 0) - delta), meta.equip, units);
    } else {
      next = roundByEquip(weight || 0, meta.equip, units);
    }

    return { next, basis: { weight, reps, low: meta.low, high: meta.high } };
  }

  // Live suggest per set using the entered values (and failure box)
  function liveSuggest(meta, idx) {
    const s = (draft[meta.name] || [])[idx];
    if (!s) return null;
    const w = +s.w || 0;
    const r = +s.r || 0;
    if (meta.equip === "bodyweight") return null;
    if (!w || !r) return null;

    const failureBias = s.failed ? -1 : 1;
    const d = incByCategory(meta.cat, units, w, failureBias);
    if (!s.failed && r >= meta.high) return roundByEquip(w + d, meta.equip, units);
    if (s.failed && r <= meta.low) return roundByEquip(Math.max(0, w - d), meta.equip, units);
    return roundByEquip(w, meta.equip, units);
  }

  function saveSession() {
    if (!currentSplit || !currentDay) {
      alert("Pick a split/day first");
      return;
    }

    // Gather all exercises visible today (split + extras) from the current draft
    const allExerciseNames = Object.keys(draft);

    const entries = allExerciseNames
      .map((exName) => {
        const setsArr = (draft[exName] || []).filter((s) => +s.r > 0 || (s.w === "0" || s.w === 0));
        if (!setsArr.length) return null;
        const sets = setsArr.map((s) => ({
          failed: !!s.failed,
          w: +s.w || 0, // 0 = BW allowed
          r: +s.r || 0,
          tags: s.tags || [],
        }));
        return {
          exercise: exName,
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

    // Async coach ping (advice-only). If offline/no key it's fine.
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
  function applyParsedToNewSplit(splitName, days) {
    // days: [{id?, name, exercises:[{name, sets, low, high, equip?, cat?}]}]
    const normalized = (days || []).map((d) => ({
      id: d.id || uid(),
      name: d.name || "Day",
      exercises: (d.exercises || []).map((e) => ({
        name: e.name,
        sets: e.sets || 3,
        low: e.low || 8,
        high: e.high || 12,
        equip: e.equip || guessEquip(e.name),
        cat: e.cat || guessCat(e.name),
      })),
    }));
    if (!normalized.length) {
      alert("Couldn’t parse any days. Try the AI Smart Parse or format like 'Name — 3 × 8–12'.");
      return;
    }
    const id = uid();
    const split = {
      id,
      name: splitName || `Imported ${new Date().toISOString().slice(0, 10)}`,
      days: normalized,
    };
    setData((prev) => ({
      ...prev,
      splits: [...prev.splits, split],
      activeSplitId: id,
    }));
    setTab("log");
  }

  // Show coach sticker only on login/import/coach screens (aesthetic)
  useEffect(() => {
    setShowSticker(tab === "coach" || needsOnboarding);
  }, [tab, needsOnboarding]);

  return (
    <div className="min-h-screen bg-neutral-900">
      {/* Coach sticker (optional) */}
      {showSticker && (
        <img
          src="/images/coach-sticker.png"
          alt=""
          className="coach-sticker hidden sm:block"
        />
      )}

      <div className="mx-auto w-full max-w-screen-sm px-3 py-4">
        <Header units={units} setUnits={setUnits} user={user} setTab={setTab} />

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
                  "sf-btn",
                  tab === "log" ? "sf-btn-primary" : "sf-btn-ghost",
                  !data.activeSplitId && "opacity-50"
                )}
              >
                Log
              </button>
              <button
                onClick={() => setTab("split")}
                className={cx("sf-btn", tab === "split" ? "sf-btn-primary" : "sf-btn-ghost")}
              >
                Split
              </button>
              <button
                onClick={() => setTab("history")}
                className={cx("sf-btn", tab === "history" ? "sf-btn-primary" : "sf-btn-ghost")}
              >
                Past Sessions
              </button>
              <button
                onClick={() => setTab("coach")}
                className={cx("sf-btn", tab === "coach" ? "sf-btn-primary" : "sf-btn-ghost")}
              >
                Coach
              </button>
              {needsOnboarding && (
                <button
                  onClick={() => setTab("import")}
                  className={cx("sf-btn", tab === "import" ? "sf-btn-primary" : "sf-btn-ghost")}
                >
                  Import
                </button>
              )}
            </nav>

            {/* Onboarding callout */}
            {needsOnboarding && tab !== "import" && (
              <div className="mt-4 sf-card p-4">
                <h2 className="font-semibold mb-1">Welcome to SetForge</h2>
                <p className="text-sm text-neutral-400">
                  Offline lift tracker — your data stays on device. Start by
                  importing or building a split.
                </p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setTab("import")} className="sf-btn sf-btn-primary">
                    Paste / Import
                  </button>
                  <button onClick={() => setTab("split")} className="sf-btn sf-btn-ghost">
                    Build Manually
                  </button>
                  <button onClick={() => setTab("split")} className="sf-btn sf-btn-ghost">
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
                suggestNext={suggestNext}
                liveSuggest={liveSuggest}
                saveSession={saveSession}
                extraExercises={extraExercises}
                setExtraExercises={setExtraExercises}
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

            {tab === "coach" && <CoachView />}

            {tab === "import" && needsOnboarding && (
              <ImportFirstRun onUse={(name, days) => applyParsedToNewSplit(name, days)} />
            )}

            <footer className="text-center text-[10px] text-neutral-500 mt-6">
              Built for you. Works offline. AI importer & advice-only coach when online.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Header ----------
function Header({ units, setUnits, user, setTab }) {
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
          className="sf-input"
        >
          <option value="lb">lb</option>
          <option value="kg">kg</option>
        </select>
        <button
          className="sf-btn sf-btn-ghost"
          onClick={() => setTab("import")}
          title="Quick import"
        >
          Import
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
      className="sf-btn sf-btn-ghost"
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
    <section className="mt-6 rounded-2xl overflow-hidden">
      <div className="bg-login relative">
        <div className="bg-overlay">
          <div className="max-w-screen-sm mx-auto px-3 py-8">
            <div className="text-center mb-4">
              <div className="text-3xl font-extrabold tracking-tight">SetForge</div>
              <div className="text-sm text-neutral-300">Train hard. Track smarter.</div>
            </div>
            <div className="sf-card p-4">
              <div className="grid gap-2">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="sf-input"
                />
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Password (8+ chars)"
                  className="sf-input"
                />
                <button onClick={go} disabled={busy} className="sf-btn sf-btn-primary">
                  {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>
                {msg && <div className="text-xs text-neutral-200">{msg}</div>}
                <button
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="text-xs text-neutral-300 mt-1"
                >
                  {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
                </button>
              </div>
              <p className="caption mt-3">
                Email verification required. Firebase Auth (free tier).
              </p>
            </div>
          </div>
        </div>
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
    <section className="mt-8 sf-card p-4 text-center">
      <div className="text-lg font-semibold">Verify your email</div>
      <div className="text-sm text-neutral-400">
        We sent a link to <b>{user.email}</b>. Click it, then refresh this screen.
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="sf-btn sf-btn-primary"
        >
          I verified
        </button>
        <button onClick={resend} className="sf-btn sf-btn-ghost">
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
  suggestNext,
  liveSuggest,
  saveSession,
  extraExercises,
  setExtraExercises,
}) {
  const [tagModalFor, setTagModalFor] = useState(null); // {ex, idx}

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
      [ex]: [...(prev[ex] || []), { failed: false, w: "", r: "", tags: [] }],
    }));
  }
  function removeSetHere(ex, idx) {
    setDraft((prev) => {
      const arr = [...(prev[ex] || [])];
      arr.splice(idx, 1);
      return { ...prev, [ex]: arr.length ? arr : [] };
    });
  }
  function removeExerciseToday(ex) {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[ex];
      return next;
    });
  }
  function addTempExercise() {
    const name = prompt("Exercise name (temporary for today only)");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const equip = prompt("Equip barbell|dumbbell|machine|cable|bodyweight|smith_machine", "machine") || "machine";
    const cat = prompt("Category iso_small|upper_comp|lower_comp", "iso_small") || "iso_small";
    setExtraExercises((prev) => [...prev, { name, sets, low, high, equip, cat }]);
  }

  return (
    <section className="mt-4 sf-card p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="sf-subtle">Split</label>
          <select
            value={currentSplit.id}
            onChange={(e) =>
              setData((p) => ({ ...p, activeSplitId: e.target.value }))
            }
            className="sf-input"
          >
            {data.splits.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <label className="sf-subtle ml-2">Day</label>
          <select
            value={day?.id || ""}
            onChange={(e) => setSelectedDayId(e.target.value)}
            className="sf-input"
          >
            {(currentSplit.days || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <label className="sf-subtle ml-2">Date</label>
          <input
            type="date"
            value={today}
            onChange={(e) => setToday(e.target.value)}
            className="sf-input"
          />
        </div>
        <div className="sf-subtle">Tips: use BW for bodyweight, Tags for form cues</div>
      </div>

      <div className="mt-3 grid gap-3">
        {/* Render all exercises that currently exist in draft */}
        {Object.keys(draft).length === 0 && (
          <div className="text-neutral-500">No exercises loaded yet.</div>
        )}

        {Object.keys(draft).map((ex) => {
          const exItem =
            (day?.exercises || []).find((e) => e.name === ex) ||
            extraExercises.find((e) => e.name === ex) || {
              name: ex,
              sets: draft[ex]?.length || 3,
              low: 8,
              high: 12,
              cat: "iso_small",
              equip: "machine",
            };

          const m = getMeta(exItem);
          const sets = draft[ex] || [];
          const sug = suggestNext(m);

          return (
            <div key={ex} className="rounded-xl border border-neutral-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-base">{ex}</div>
                <div className="text-xs text-neutral-400">
                  {m.low}–{m.high} reps · <span className="capitalize">{m.equip.replace('_',' ')}</span>
                </div>
              </div>

              {/* Suggestion box */}
              {sug && (
                <div className="mt-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1">
                  {sug.bw ? (
                    <>Next time (BW): aim for the top of {m.low}–{m.high} reps.</>
                  ) : (
                    <>
                      Next time: <b>{sug.next} {units}</b>{" "}
                      <span className="text-neutral-400">
                        (last {sug.basis.weight}{units}×{sug.basis.reps})
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="mt-2 grid gap-2">
                {sets.map((s, idx) => {
                  const live = liveSuggest(m, idx);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <label className="col-span-3 text-[11px] text-neutral-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!s.failed}
                          onChange={() => updateSetFlag(setDraft, draft, ex, idx, "failed")}
                        />{" "}
                        failed at
                      </label>

                      {/* Weight input (BW-friendly) */}
                      <div className="col-span-4 flex gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={m.equip === "bodyweight" ? "BW or +load" : `${units}`}
                          value={s.w}
                          onChange={(e) =>
                            updateSetField(setDraft, draft, ex, idx, "w", e.target.value)
                          }
                          className="sf-input w-full"
                        />
                        {m.equip === "bodyweight" && (
                          <button
                            onClick={() => updateSetField(setDraft, draft, ex, idx, "w", "0")}
                            className="sf-btn sf-btn-ghost"
                            title="Set as bodyweight (0 load)"
                          >
                            BW
                          </button>
                        )}
                      </div>

                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="reps"
                        value={s.r}
                        onChange={(e) => updateSetField(setDraft, draft, ex, idx, "r", e.target.value)}
                        className="col-span-3 sf-input"
                      />

                      <div className="col-span-2 flex items-center gap-2">
                        <button onClick={() => removeSetHere(ex, idx)} className="text-red-400">
                          ✕
                        </button>
                      </div>

                      {/* Controls row */}
                      <div className="col-span-12 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setTagModalFor({ ex, idx })}
                          className="sf-btn sf-btn-ghost"
                        >
                          Tags
                        </button>
                        {live !== null && (
                          <div className="sf-subtle">
                            Next set: <b className="text-neutral-100">{live} {units}</b>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="flex gap-2">
                  <button onClick={() => addSet(ex)} className="sf-btn sf-btn-ghost">
                    Add set
                  </button>
                  <button onClick={() => removeExerciseToday(ex)} className="sf-btn sf-btn-ghost">
                    Hide this exercise today
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={saveSession} className="sf-btn sf-btn-primary">
          Save session
        </button>
        <button onClick={addTempExercise} className="sf-btn sf-btn-ghost">
          + Add temporary exercise
        </button>
      </div>

      {/* Tag Modal */}
      {tagModalFor && (
        <TagModal
          ex={tagModalFor.ex}
          idx={tagModalFor.idx}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setTagModalFor(null)}
        />
      )}
    </section>
  );
}
// draft helpers
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

// ---------- Tag Modal ----------
function TagModal({ ex, idx, draft, setDraft, onClose }) {
  const [input, setInput] = useState("");
  const tags = draft?.[ex]?.[idx]?.tags || [];

  function toggle(tag) {
    setDraft((prev) => {
      const arr = [...(prev[ex] || draft[ex] || [])];
      const row = { ...(arr[idx] || { failed: false, w: "", r: "", tags: [] }) };
      const has = (row.tags || []).includes(tag);
      row.tags = has ? row.tags.filter((x) => x !== tag) : [...(row.tags || []), tag];
      arr[idx] = row;
      return { ...prev, [ex]: arr };
    });
  }
  function addCustom() {
    const t = input.trim();
    if (!t) return;
    toggle(t);
    setInput("");
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Tags for: <span className="text-neutral-300">{ex}</span></div>
          <button onClick={onClose} className="text-neutral-400">Close</button>
        </div>
        <div className="max-h-48 overflow-auto hide-scrollbar grid grid-cols-2 gap-2">
          {PRESET_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggle(t)}
                className={cx("chip", on ? "chip-on" : "chip-off")}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add custom tag"
            className="sf-input w-full"
          />
          <button onClick={addCustom} className="sf-btn sf-btn-ghost">Add</button>
        </div>
      </div>
    </div>
  );
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
  const [desc, setDesc] = useState({ open: false, text: "", ex: "" });

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
                        {
                          name,
                          sets,
                          low,
                          high,
                          cat: guessCat(name), // AI may refine later
                          equip: guessEquip(name),
                        },
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
      const equip = prompt(
        "Equip barbell|dumbbell|machine|cable|bodyweight|smith_machine",
        e.equip
      ) || e.equip;
      const cat = prompt("Category iso_small|upper_comp|lower_comp", e.cat) || e.cat;
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

  // Reorder within a day
  function moveExercise(splitId, dayId, idx, dir) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const sp = next.splits.find((s) => s.id === splitId);
      const day = sp.days.find((d) => d.id === dayId);
      const arr = day.exercises;
      const j = idx + (dir === "up" ? -1 : 1);
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return next;
    });
  }
  // Move exercise to another day
  function moveExerciseToDay(splitId, dayId, idx) {
    const targetDayName = prompt("Move to which day? Type exact name.");
    if (!targetDayName) return;
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const sp = next.splits.find((s) => s.id === splitId);
      const fromDay = sp.days.find((d) => d.id === dayId);
      const toDay = sp.days.find((d) => d.name.toLowerCase() === targetDayName.toLowerCase());
      if (!toDay) {
        alert("Day not found. Check the name.");
        return prev;
      }
      const [item] = fromDay.exercises.splice(idx, 1);
      toDay.exercises.push(item);
      return next;
    });
  }

  // AI: Describe any exercise
  async function describeExercise(name) {
    try {
      setDesc({ open: true, text: "Loading…", ex: name });
      const r = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      setDesc({ open: true, text: j?.description || "No description.", ex: name });
    } catch {
      setDesc({ open: true, text: "Could not load description.", ex: name });
    }
  }

  // AI importer: smart-parse using /api/parse-split
  async function smartParseAndAdd() {
    if (!paste.trim()) {
      alert("Paste your split text first.");
      return;
    }
    const name = prompt("Split name", "Imported Split");
    if (!name) return;
    try {
      const r = await fetch("/api/parse-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: paste }),
      });
      const j = await r.json();
      if (j?.days?.length) {
        applyParsedToNewSplit(name, j.days);
      } else {
        alert("AI parser found nothing; falling back to basic parser.");
        const days = parseSplitText(paste);
        applyParsedToNewSplit(name, days);
      }
    } catch {
      const days = parseSplitText(paste);
      applyParsedToNewSplit(name, days);
    }
  }

  function useTemplate(t) {
    const { name, daysText } = TEMPLATES[t];
    const days = parseSplitText(daysText);
    applyParsedToNewSplit(name, days);
  }

  return (
    <section className="mt-4 sf-card p-4">
      {mode === "list" && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-neutral-300">Your splits</div>
            <div className="flex gap-2">
              <button onClick={() => setMode("paste")} className="sf-btn sf-btn-primary">
                Import / Paste
              </button>
              <button onClick={() => setMode("templates")} className="sf-btn sf-btn-ghost">
                Templates
              </button>
              <button onClick={addManual} className="sf-btn sf-btn-ghost">
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
                        className="sf-btn sf-btn-ghost text-xs"
                      >
                        Set active
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const newName = prompt("Split name", s.name) || s.name;
                        setData((prev) => ({
                          ...prev,
                          splits: prev.splits.map((x) =>
                            x.id === s.id ? { ...x, name: newName } : x
                          ),
                        }));
                      }}
                      className="sf-btn sf-btn-ghost text-xs"
                    >
                      Rename
                    </button>
                    <button onClick={() => addDay(s.id)} className="sf-btn sf-btn-ghost text-xs">
                      Add day
                    </button>
                    <button onClick={() => removeSplit(s.id)} className="sf-btn text-red-400 text-xs">
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
                            className="sf-btn sf-btn-ghost text-xs"
                          >
                            Add exercise
                          </button>
                          <button onClick={() => addDay(s.id)} className="sf-btn sf-btn-ghost text-xs">
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
                            <span className="flex-1">
                              {e.name}{" "}
                              <span className="text-neutral-500">
                                ({e.sets}×{e.low}–{e.high} • {e.equip}, {e.cat})
                              </span>
                            </span>
                            <span className="flex gap-1">
                              <button
                                onClick={() => describeExercise(e.name)}
                                className="sf-btn sf-btn-ghost text-xs"
                                title="AI description"
                              >
                                Desc
                              </button>
                              <button
                                onClick={() => moveExercise(s.id, d.id, i, "up")}
                                className="sf-btn sf-btn-ghost text-xs"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveExercise(s.id, d.id, i, "down")}
                                className="sf-btn sf-btn-ghost text-xs"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => moveExerciseToDay(s.id, d.id, i)}
                                className="sf-btn sf-btn-ghost text-xs"
                                title="Move to another day by name"
                              >
                                Move
                              </button>
                              <button
                                onClick={() => editExercise(s.id, d.id, i)}
                                className="sf-btn sf-btn-ghost text-xs"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => removeExercise(s.id, d.id, i)}
                                className="sf-btn text-red-400 text-xs"
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
              </div>
            ))}
            {data.splits.length === 0 && (
              <div className="text-neutral-500">No splits yet</div>
            )}
          </div>

          {/* AI description modal */}
          {desc.open && (
            <div className="modal-backdrop" onClick={() => setDesc({ open: false, text: "", ex: "" })}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="font-semibold mb-2">
                  {desc.ex ? `How to: ${desc.ex}` : "Exercise description"}
                </div>
                <div className="text-sm text-neutral-200 whitespace-pre-wrap">
                  {desc.text || "—"}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {mode === "paste" && (
        <div className="rounded-xl overflow-hidden">
          <div className="bg-import relative">
            <div className="bg-overlay">
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Paste your split</h3>
                  <button onClick={() => setMode("list")} className="text-sm text-neutral-300">
                    Back
                  </button>
                </div>

                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={10}
                  placeholder={`PUSH A\nIncline Barbell Press — 3 × 6–10\n...\n\nPULL A\n...`}
                  className="mt-2 w-full sf-input"
                />

                <div className="mt-2 flex items-center gap-2">
                  <button onClick={smartParseAndAdd} className="sf-btn sf-btn-primary">
                    Smart parse with AI
                  </button>
                  <button
                    onClick={() => {
                      const name = prompt("Split name", "Imported Split");
                      if (!name) return;
                      const days = parseSplitText(paste);
                      applyParsedToNewSplit(name, days);
                    }}
                    className="sf-btn sf-btn-ghost"
                  >
                    Basic parse
                  </button>

                  <label className="sf-btn sf-btn-ghost cursor-pointer">
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
                <p className="caption mt-2">
                  Tip: Headings like "PUSH A", "LEGS B" or weekdays become days automatically.
                </p>
              </div>
            </div>
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
                <button onClick={() => useTemplate(key)} className="sf-btn sf-btn-primary text-sm">
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
    <section className="mt-4 sf-card p-4">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by day/exercise"
          className="w-full sf-input"
        />
        <div className="sf-subtle whitespace-nowrap">
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

// ---------- Coach View ----------
function CoachView() {
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Yo! I’m your hypertrophy coach. Ask about programming, exercise tweaks, diet basics—or say 'help' for app navigation." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const quick = [
    "Help: how to import my split",
    "Help: add a temporary exercise",
    "Best rep ranges for arms?",
    "How often should I train calves?",
    "Diet: protein per lb?",
  ];

  async function send() {
    const text = input.trim();
    if (!text) return;
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...msgs, { role: "user", content: text }] }),
      });
      const j = await r.json();
      const resp = j?.reply || "Hmm—couldn't get advice right now.";
      setMsgs((m) => [...m, { role: "assistant", content: resp }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Offline or server error—try again later." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 sf-card p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Coach</div>
        <img src="/images/coach-sticker.png" alt="" className="h-10 w-auto opacity-90" />
      </div>
      <div className="mt-2 grid gap-2 max-h-80 overflow-auto hide-scrollbar rounded-lg border border-neutral-800 p-2 bg-neutral-900">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cx(
              "text-sm rounded-lg px-3 py-2 max-w-[85%]",
              m.role === "assistant"
                ? "bg-neutral-800 border border-neutral-700 self-start"
                : "bg-white text-neutral-900 ml-auto"
            )}
          >
            {m.content}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button key={q} onClick={() => setInput(q)} className="chip chip-off">
            {q}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your coach…"
          className="sf-input w-full"
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button onClick={send} disabled={busy} className="sf-btn sf-btn-primary">
          {busy ? "…" : "Send"}
        </button>
      </div>
      <p className="caption mt-2">
        Coach uses evidence-based heuristics. For health issues, see a professional.
      </p>
    </section>
  );
}

// ---------- First-run Import screen ----------
function ImportFirstRun({ onUse }) {
  const [text, setText] = useState("");

  async function smartParse() {
    if (!text.trim()) {
      alert("Paste your split first.");
      return;
    }
    const name = prompt("Split name", "My Split");
    if (!name) return;
    try {
      const r = await fetch("/api/parse-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (j?.days?.length) {
        onUse(name, j.days);
      } else {
        const basic = parseSplitText(text);
        onUse(name, basic);
      }
    } catch {
      const basic = parseSplitText(text);
      onUse(name, basic);
    }
  }

  return (
    <section className="mt-4 rounded-2xl overflow-hidden">
      <div className="bg-import relative">
        <div className="bg-overlay">
          <div className="p-4">
            <h2 className="font-semibold">Paste / Import your first split</h2>
            <p className="text-sm text-neutral-300">
              Paste from Notes/Docs (or upload .txt). You can edit later.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="mt-2 w-full sf-input"
            />
            <div className="mt-2 flex gap-2">
              <button onClick={smartParse} className="sf-btn sf-btn-primary">
                Smart parse with AI
              </button>
              <label className="sf-btn sf-btn-ghost cursor-pointer">
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
        </div>
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
