// SetForge — V5
// Phone-first PWA with:
// • Firebase email/password auth + email verification
// • Multi-splits (create/import/templates), choose Active Split
// • Logging: failure flag, bodyweight toggle, tags (modal), add/remove one-off exercise for today
// • Suggestions: failure-aware + offline fallback; AI refinement via /api/suggest when online
// • Exercise description (AI) + attachment selector (saved as tag "attach:<name>")
// • Smarter import parsing (bullets/headings) tries /api/parse-split then regex fallback
// • No volume number anywhere (removed)
// • Anime-styled black/red background on auth/import

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

// ---------- UI helpers ----------
const cx = (...a) => a.filter(Boolean).join(" ");

// ---------- Style helpers (anime bg) ----------
const animeBg = {
  background:
    "radial-gradient(1200px 600px at 100% -10%, rgba(255,0,0,0.08), transparent 50%)," +
    "radial-gradient(800px 400px at -10% 110%, rgba(255,0,0,0.06), transparent 50%)," +
    "linear-gradient(180deg, #0a0a0a, #0a0a0a)",
};

// ---------- Config ----------
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
const ATTACHMENTS = [
  "None",
  "Straight bar",
  "EZ bar",
  "Rope",
  "Single D-handle",
  "Dual D-handles",
  "V-handle",
  "Lat bar (wide)",
  "Lat bar (medium)",
  "Cambered row bar",
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

// ---------- Local storage ----------
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
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

// ---------- Heuristics ----------
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

// ---------- Parsing ----------
function regexParseSplit(raw) {
  // Accept bullets w/o numbers; detect headings & exercises
  const days = [];
  const lines = String(raw || "").replace(/\r/g, "").split(/\n+/);
  let cur = null;
  const isHeading = (s) =>
    /^(?:\p{Emoji_Presentation}|\p{Emoji}\ufe0f|[\u2600-\u27BF])?\s*(push\s*[ab]?|pull\s*[ab]?|legs?\s*[ab]?|upper\s*\d*|lower\s*\d*|rest|day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/iu.test(
      s.trim()
    );
  const exLine =
    /^(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^[•\-\*]\s*/, "");
    if (!line) continue;
    if (isHeading(line)) {
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
async function smartParseSplit(text) {
  // Try AI parser first; fall back to regex if API not available or returns nothing
  try {
    const r = await fetch("/api/parse-split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const j = await r.json();
    if (Array.isArray(j.days) && j.days.length) {
      // Convert to the same internal structure we use elsewhere
      return j.days.map((d) => ({
        id: uid(),
        name: d.name,
        exercises: (d.exercises || []).map((e) => ({
          name: e.name,
          sets: +e.sets || 3,
          low: +e.low || 8,
          high: +e.high || +e.low || 12,
          cat: guessCat(e.name),
          equip: guessEquip(e.name),
        })),
      }));
    }
  } catch {}
  return regexParseSplit(text);
}

// ---------- Math ----------
function roundByEquip(weight, equip, units) {
  const step =
    units === "kg"
      ? equip === "barbell"
        ? 2.5
        : equip === "dumbbell"
        ? 1.25
        : 1
      : equip === "barbell"
      ? CONFIG.barbellStepLb
      : equip === "dumbbell"
      ? CONFIG.dumbbellStepLb
      : CONFIG.machineStepLb;
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

// ---------- Tag Modal (inline component) ----------
function TagModal({ open, onClose, preset = [], value = [], onSave }) {
  const [sel, setSel] = useState(new Set(value));
  const [custom, setCustom] = useState("");
  useEffect(() => setSel(new Set(value)), [open]); // reset each open

  if (!open) return null;
  const toggle = (t) => {
    const s = new Set(sel);
    s.has(t) ? s.delete(t) : s.add(t);
    setSel(s);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-[90%] max-w-md rounded-2xl bg-neutral-900 border border-neutral-700 p-4">
        <div className="font-semibold mb-2">Tags</div>
        <div className="flex flex-wrap gap-2">
          {preset.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={cx(
                "px-2 py-1 rounded-lg border",
                sel.has(t)
                  ? "bg-white text-neutral-900 border-white"
                  : "bg-neutral-800 border-neutral-700"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="custom tag"
            className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
          />
          <button
            onClick={() => {
              if (custom.trim()) {
                toggle(custom.trim());
                setCustom("");
              }
            }}
            className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700"
          >
            Add
          </button>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 text-neutral-400">
            Cancel
          </button>
          <button
            onClick={() => onSave(Array.from(sel))}
            className="px-3 py-1 rounded bg-white text-neutral-900"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
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
  const [selectedDayId, setSelectedDayId] = useState("");

  // auth
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
  useEffect(() => save(user, { ...data, units }), [data, units, user]);

  // derived
  const currentSplit = useMemo(
    () => data.splits.find((s) => s.id === data.activeSplitId),
    [data]
  );
  useEffect(() => {
    if (currentSplit) setSelectedDayId(currentSplit.days?.[0]?.id || "");
  }, [data.activeSplitId]);

  const needsOnboarding = (data.splits?.length || 0) === 0;

  // For rendering anime BG on auth/import screens
  const wrapClass = "mx-auto w-full max-w-screen-sm px-3 py-4";

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      <div className={wrapClass}>
        <Header units={units} setUnits={setUnits} user={user} />

        {!user ? (
          <AuthScreen animeBg={animeBg} />
        ) : user && !user.emailVerified ? (
          <VerifyScreen user={user} />
        ) : (
          <>
            {/* Tabs */}
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

            {/* Onboarding card */}
            {needsOnboarding && tab !== "import" && (
              <div className="mt-4 rounded-2xl border border-neutral-800 p-4" style={animeBg}>
                <h2 className="font-semibold mb-1">Welcome to SetForge</h2>
                <p className="text-sm text-neutral-300">
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
                units={units}
                today={today}
                setToday={setToday}
              />
            )}

            {tab === "split" && (
              <SplitView
                data={data}
                setData={setData}
                setActiveSplit={(id) =>
                  setData((prev) => ({ ...prev, activeSplitId: id }))
                }
                applyParsedToNewSplit={async (splitName, raw) => {
                  const days = await smartParseSplit(raw);
                  if (!days.length) {
                    alert("Couldn’t parse. Use lines like 'Name — 3 × 8–12'");
                    return;
                  }
                  const id = uid();
                  const split = {
                    id,
                    name:
                      splitName ||
                      `Imported ${new Date().toISOString().slice(0, 10)}`,
                    days,
                  };
                  setData((prev) => ({
                    ...prev,
                    splits: [...prev.splits, split],
                    activeSplitId: id,
                  }));
                }}
              />
            )}

            {tab === "history" && <HistoryView data={data} />}

            {tab === "import" && needsOnboarding && (
              <ImportFirstRun
                animeBg={animeBg}
                onUse={async (name, raw) => {
                  const days = await smartParseSplit(raw);
                  if (!days.length) {
                    alert("Couldn’t parse. Try adding sets like '3 × 8–12'.");
                    return;
                  }
                  const id = uid();
                  const split = { id, name: name || "My Split", days };
                  setData((prev) => ({
                    ...prev,
                    splits: [...prev.splits, split],
                    activeSplitId: id,
                  }));
                  // auto-jump to log
                }}
              />
            )}

            <footer className="text-center text-[10px] text-neutral-500 mt-6">
              Built for you. Works offline. AI refinements when online.
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
function AuthScreen({ animeBg }) {
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
    <section className="mt-8 rounded-2xl border border-neutral-800 p-4" style={animeBg}>
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
        Email verification required. Firebase Auth free tier.
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
  units,
  today,
  setToday,
}) {
  const [draft, setDraft] = useState({});
  const [tagPick, setTagPick] = useState({
    open: false,
    ex: "",
    idx: 0,
    current: [],
  });
  const [sugMap, setSugMap] = useState({}); // AI suggestions cache per exercise

  if (!currentSplit)
    return (
      <div className="mt-6 text-sm text-neutral-400">
        Pick a split first in the Split tab.
      </div>
    );

  const day =
    currentSplit.days?.find((d) => d.id === selectedDayId) ||
    currentSplit.days?.[0];

  const metaFor = (i) => ({
    name: i.name,
    sets: i.sets || 1,
    low: i.low || 8,
    high: i.high || 12,
    cat: i.cat || "iso_small",
    equip: i.equip || "machine",
  });

  // Build skeleton for the selected day; MERGE into current draft (don't wipe)
  useEffect(() => {
    if (!day) return;
    setDraft((prev) => {
      const next = { ...prev };
      (day.exercises || []).forEach((ex) => {
        if (!next[ex.name]) {
          const sets = metaFor(ex).sets;
          next[ex.name] = Array.from({ length: sets }).map(() => ({
            failed: false,
            bw: false,
            w: "",
            r: "",
            tags: [],
          }));
        }
      });
      return next;
    });
  }, [day?.id]);

  // Build list of exercises to render: union of (day.exercises + one-offs in draft)
  const dayExNames = new Set((day?.exercises || []).map((e) => e.name));
  const renderOrder = [
    ...(day?.exercises || []).map((e) => e.name),
    ...Object.keys(draft).filter((n) => !dayExNames.has(n)), // one-offs
  ];

  // Helpers for history & suggestions
  function getHistoryFor(exName) {
    return data.sessions
      .filter((s) => s.splitId === data.activeSplitId)
      .map((s) => s.entries.find((e) => e.exercise === exName))
      .filter(Boolean);
  }
  function baseSuggest(meta) {
    const hist = getHistoryFor(meta.name);
    if (!hist.length) return null;
    const last = hist[0];
    const top = bestSetByLoad(last.sets);
    if (!top) return null;
    const weight = +top.w || 0;
    const reps = +top.r || 0;

    // failure-aware multiplier
    const failedRate =
      (last.sets || []).filter((s) => s.failed).length /
      Math.max(1, (last.sets || []).length);
    const mult = failedRate > 0.5 ? 0.5 : failedRate === 0 ? 1.25 : 1.0;

    const deltaRaw = incByCategory(meta.cat, units, weight) * mult;
    let next = weight;
    if (reps >= meta.high)
      next = roundByEquip(weight + deltaRaw, meta.equip, units);
    else if (reps < meta.low)
      next = roundByEquip(Math.max(0, weight - deltaRaw), meta.equip, units);
    else next = roundByEquip(weight, meta.equip, units);
    return { next, basis: { weight, reps, low: meta.low, high: meta.high } };
  }
  // Fire AI refinement in background (per day change)
  useEffect(() => {
    let cancelled = false;
    async function go() {
      const map = {};
      for (const name of (day?.exercises || []).map((e) => e.name)) {
        const ex = (day.exercises || []).find((x) => x.name === name);
        const meta = metaFor(ex);
        const hist = getHistoryFor(name);
        if (!hist.length) continue;

        // start with base suggestion
        const base = baseSuggest(meta);
        map[name] = base?.next;

        // Ask server AI (if available)
        try {
          const r = await fetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exName: meta.name,
              meta: {
                cat: meta.cat,
                high: meta.high,
                low: meta.low,
                equip: meta.equip,
              },
              history: hist.slice(0, 8),
              units,
            }),
          });
          const j = await r.json();
          if (!cancelled && typeof j?.next === "number") {
            map[name] = j.next;
            setSugMap((prev) => ({ ...prev, [name]: j.next }));
          }
        } catch {
          // ignore; keep base
          if (!cancelled && base) {
            setSugMap((prev) => ({ ...prev, [name]: base.next }));
          }
        }
      }
      if (!cancelled) setSugMap(map);
    }
    go();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.id, units, data.activeSplitId]);

  function liveSuggest(meta, idx) {
    const s = (draft[meta.name] || [])[idx];
    if (!s || s.bw) return null; // bodyweight → no weight suggestion
    const w = +s.w || 0;
    const r = +s.r || 0;
    if (!w || !r) return null;
    // live: boost if not failed, reduce if failed
    const d = incByCategory(meta.cat, units, w) * (s.failed ? 0.5 : 1.25);
    if (r >= meta.high) return roundByEquip(w + d, meta.equip, units);
    if (r < meta.low) return roundByEquip(Math.max(0, w - d), meta.equip, units);
    return roundByEquip(w, meta.equip, units);
  }

  function saveSession() {
    if (!currentSplit || !day) {
      alert("Pick a split/day first");
      return;
    }
    // Entries from all visible exercises in draft (including one-offs)
    const entries = renderOrder
      .map((name) => {
        const baseMeta =
          (day.exercises || []).find((e) => e.name === name) ||
          // one-off meta guess
          { name, sets: (draft[name] || []).length || 1, low: 8, high: 12, cat: guessCat(name), equip: guessEquip(name) };
        const sets = (draft[name] || [])
          .filter((s) => (s.bw || s.w === "0" || s.w === 0 || +s.w > -99999) && +s.r > 0)
          .map((s) => ({
            failed: !!s.failed,
            bw: !!s.bw,
            w: s.bw ? 0 : +s.w,
            r: +s.r,
            tags: s.tags || [],
          }));
        if (!sets.length) return null;
        return { exercise: name, sets, meta: { low: baseMeta.low, high: baseMeta.high } };
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
      dayId: day.id,
      dayName: day.name,
      entries,
      units,
    };
    setData((prev) => ({ ...prev, sessions: [session, ...prev.sessions] }));
    alert("Session saved");
  }

  // draft helpers
  function updateSetField(ex, idx, key, val) {
    setDraft((prev) => {
      const arr = [...(prev[ex] || [])];
      const row = { ...(arr[idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
      row[key] = val;
      arr[idx] = row;
      return { ...prev, [ex]: arr };
    });
  }
  function toggleFlag(ex, idx, key) {
    setDraft((prev) => {
      const arr = [...(prev[ex] || [])];
      const row = { ...(arr[idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
      row[key] = !row[key];
      if (key === "bw" && row.bw) row.w = ""; // clear weight when BW checked
      arr[idx] = row;
      return { ...prev, [ex]: arr };
    });
  }
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
      return { ...prev, [ex]: arr.length ? arr : [] };
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
      </div>

      {/* one-off add */}
      <div className="mt-3">
        <button
          onClick={() => {
            const name = prompt("Exercise name (one-off today)");
            if (!name) return;
            const sets = Number(prompt("Sets", "3") || 3);
            setDraft((prev) => ({
              ...prev,
              [name]: Array.from({ length: sets }).map(() => ({
                failed: false,
                bw: false,
                w: "",
                r: "",
                tags: [],
              })),
            }));
          }}
          className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
        >
          + Add exercise for today
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        {renderOrder.map((exName) => {
          // meta: derive from day if present, else guess
          const dayMeta =
            (day?.exercises || []).find((e) => e.name === exName) || {
              name: exName,
              sets: (draft[exName] || []).length || 1,
              low: 8,
              high: 12,
              cat: guessCat(exName),
              equip: guessEquip(exName),
            };
          const m = {
            name: dayMeta.name,
            sets: dayMeta.sets,
            low: dayMeta.low,
            high: dayMeta.high,
            cat: dayMeta.cat,
            equip: dayMeta.equip,
          };
          const sets = draft[exName] || [];
          const nextSug = sugMap[exName]; // AI or base

          return (
            <div key={exName} className="rounded-xl border border-neutral-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-base">{exName}</div>
                <div className="flex items-center gap-2">
                  {/* Attachment selector → stored as tag "attach:<name>" on first set */}
                  <select
                    onChange={(e) => {
                      const att = e.target.value;
                      setDraft((prev) => {
                        const arr = prev[exName] || [];
                        if (!arr.length) return prev;
                        const row = { ...(arr[0] || {}) };
                        const rest = (row.tags || []).filter((t) => !t.startsWith("attach:"));
                        row.tags = att === "None" ? rest : [...rest, `attach:${att}`];
                        const out = [...arr];
                        out[0] = row;
                        return { ...prev, [exName]: out };
                      });
                    }}
                    className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                  >
                    {ATTACHMENTS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>

                  {/* Description (AI) */}
                  <button
                    onClick={async () => {
                      try {
                        const r = await fetch("/api/describe", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ exercise: exName }),
                        });
                        const j = await r.json();
                        if (j.text) alert(j.text);
                      } catch {}
                    }}
                    className="text-xs underline"
                  >
                    description
                  </button>

                  {/* Remove entire exercise for today */}
                  <button
                    onClick={() =>
                      setDraft((prev) => {
                        const cp = { ...prev };
                        delete cp[exName];
                        return cp;
                      })
                    }
                    className="text-xs text-red-400"
                    title="Remove this exercise (today)"
                  >
                    Remove today
                  </button>
                </div>
              </div>

              {/* Next time suggestion (compact) */}
              {typeof nextSug === "number" && !isNaN(nextSug) && (
                <div className="mt-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1">
                  Next time: <b>{nextSug} {units}</b>
                </div>
              )}

              {/* Sets */}
              <div className="mt-2 grid gap-2">
                {sets.map((s, idx) => {
                  const live = liveSuggest(m, idx);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <label className="col-span-3 text-[11px] text-neutral-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!s.failed}
                          onChange={() => toggleFlag(exName, idx, "failed")}
                        />{" "}
                        failed
                      </label>

                      <label className="col-span-2 text-[11px] text-neutral-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!s.bw}
                          onChange={() => toggleFlag(exName, idx, "bw")}
                        />{" "}
                        BW
                      </label>

                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder={`${units}`}
                        value={s.w}
                        disabled={!!s.bw}
                        onChange={(e) => updateSetField(exName, idx, "w", e.target.value)}
                        className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="reps"
                        value={s.r}
                        onChange={(e) => updateSetField(exName, idx, "r", e.target.value)}
                        className="col-span-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                      />
                      <button
                        onClick={() => removeSetHere(exName, idx)}
                        className="col-span-2 text-red-400"
                      >
                        ✕
                      </button>

                      {/* Tags button (modal) */}
                      <div className="col-span-12">
                        <button
                          onClick={() =>
                            setTagPick({
                              open: true,
                              ex: exName,
                              idx,
                              current: s.tags || [],
                            })
                          }
                          className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs"
                        >
                          Tags
                        </button>
                        {live !== null && (
                          <span className="ml-2 text-[11px] text-neutral-400">
                            Next set: <b className="text-neutral-100">{live} {units}</b>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => addSet(exName)}
                  className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
                >
                  Add set
                </button>
              </div>

              {/* progress chart toggle */}
              <ChartToggle ex={exName} chartDataFor={chartDataFor(data)} />
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

      {/* Tag Modal */}
      <TagModal
        open={tagPick.open}
        value={tagPick.current}
        preset={PRESET_TAGS}
        onClose={() => setTagPick((v) => ({ ...v, open: false }))}
        onSave={(list) => {
          setDraft((prev) => {
            const arr = [...(prev[tagPick.ex] || [])];
            const row = {
              ...(arr[tagPick.idx] || {
                failed: false,
                bw: false,
                w: "",
                r: "",
                tags: [],
              }),
            };
            row.tags = list;
            arr[tagPick.idx] = row;
            return { ...prev, [tagPick.ex]: arr };
          });
          setTagPick((v) => ({ ...v, open: false }));
        }}
      />
    </section>
  );
}

// ---------- Split View ----------
function SplitView({ data, setData, setActiveSplit, applyParsedToNewSplit }) {
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
    const equip = prompt("Equip barbell|dumbbell|machine|cable|bodyweight", "machine") || "machine";
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

  // Move exercise ↑/↓
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
                          activeSplitId:
                            prev.activeSplitId === s.id ? "" : prev.activeSplitId,
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
            <button
              onClick={() => setMode("list")}
              className="text-sm text-neutral-400"
            >
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
                // AI-first parse with fallback
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
              {/* no volume */}
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
function ImportFirstRun({ onUse, animeBg }) {
  const [text, setText] = useState("");
  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4" style={animeBg}>
      <h2 className="font-semibold">Paste / Import your first split</h2>
      <p className="text-sm text-neutral-300">
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
              <Line
                type="monotone"
                dataKey="weight"
                dot={false}
                stroke="#ffffff"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
