// src/App.jsx
// SetForge v5 — Offline-first PWA with AI helpers
// - Firebase Auth (email/pass + verification)
// - Multi-splits (create, edit, templates, reorder, safe IDs)
// - Smart import (local parser + optional AI importer)
// - Log view: add/remove exercises for today, skip per-exercise, bodyweight toggle,
//   failure-aware suggestions (heavier increment when NOT at failure), tag modal
// - AI exercise descriptions, automatic equip/category inference
// - Dedicated Coach tab (hypertrophy-first + basic navigation help)
// - Anime backgrounds on login + import, coach sticker decoration

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { initFirebaseApp } from "./firebase";

// ---- small helpers
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const cx = (...a) => a.filter(Boolean).join(" ");
const auth = getAuth();
initFirebaseApp();

// ---------- Config ----------
const EQUIP_OPTIONS = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "smith", "unknown"];
const CAT_OPTIONS = [
  { id: "upper_comp", label: "Compound (Upper)" },
  { id: "lower_comp", label: "Compound (Lower)" },
  { id: "iso_small", label: "Isolation/Small" },
];

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
  "ROM focus",
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

// ---------- Storage ----------
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
  splits: [], // [{id,name,days:[{id,name,exercises:[{id,name,sets,low,high,cat,equip}]}]}]
  sessions: [], // [{id, splitId, dateISO, dayId, dayName, entries:[{exerciseId?, exercise, sets:[{w,r,failed,bw,tags[]}], units}], units}]
});

// ---------- Heuristics ----------
function guessEquip(name) {
  const n = name.toLowerCase();
  if (n.includes("smith")) return "smith";
  if (n.includes("barbell") || /\bbb\b/.test(n)) return "barbell";
  if (n.includes("dumbbell") || /\bdb\b/.test(n)) return "dumbbell";
  if (n.includes("cable") || n.includes("rope") || n.includes("pulldown")) return "cable";
  if (/(dip|hanging|push[- ]?up|back extensions|pull[- ]?up)/.test(n)) return "bodyweight";
  if (n.includes("machine") || n.includes("leg press") || n.includes("pec deck")) return "machine";
  return "unknown";
}
function guessCat(name) {
  const n = name.toLowerCase();
  if (/(squat|deadlift|romanian|rdl|leg press|split squat|hack)/.test(n)) return "lower_comp";
  if (/(bench|press|row|pulldown|pull[- ]?up|weighted dip|ohp|shoulder press)/.test(n)) return "upper_comp";
  return "iso_small";
}

// ---------- Math ----------
function roundByEquip(weight, equip, units) {
  if (units === "kg") {
    const step = equip === "dumbbell" ? 1.25 : equip === "barbell" ? 2.5 : 1;
    return Math.round(weight / step) * step;
  }
  const step =
    equip === "dumbbell"
      ? CONFIG.dumbbellStepLb
      : equip === "barbell"
      ? CONFIG.barbellStepLb
      : equip === "bodyweight"
      ? CONFIG.bodyweightStepLb
      : CONFIG.machineStepLb;
  return Math.round(weight / step) * step;
}
function incByCategory(cat, units, current) {
  const pct = cat === "lower_comp" ? CONFIG.lowerPct : cat === "upper_comp" ? CONFIG.upperPct : CONFIG.isoPct;
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

// ---------- Parsing ----------
/** Local (fast) parser; supports "Name — 3 × 8–12" style. */
function parseSplitTextLocal(raw) {
  const days = [];
  const lines = String(raw || "").replace(/\r/g, "").split(/\n+/);
  const dayHeader =
    /^(?:\p{Emoji_Presentation}|\p{Emoji}\ufe0f|[\u2600-\u27BF])?\s*(?:DAY\s*\d+|[A-Z][A-Z ]{2,}|Pull\s*[AB]|Push\s*[AB]|Legs?\s*[AB]|Upper|Lower|Rest|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/iu;

  const exLine = /^(.*?)\s*(?:[—\-–:])\s*(\d+)\s*[x×]\s*(\d+)(?:\s*[\-–to]\s*(\d+))?\s*$/i;

  let cur = null;
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^[•\u2022*\-]+\s*/, "");
    if (!line) continue;
    if (dayHeader.test(line)) {
      cur = { id: uid(), name: line.replace(/^[\p{Emoji}\p{Emoji_Presentation}\ufe0f\s]+/u, ""), exercises: [] };
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
        id: uid(),
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

/** Optional AI parse for messy bullets/headers */
async function parseSplitTextAI(raw) {
  try {
    const r = await fetch("/api/parse-split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: String(raw || "") }),
    });
    const j = await r.json();
    // Expect {days:[{name,exercises:[{name,sets,low,high}]}]}
    const days = (j?.days || []).map((d) => ({
      id: uid(),
      name: d.name || "Day",
      exercises: (d.exercises || []).map((e) => ({
        id: uid(),
        name: e.name,
        sets: +e.sets || 3,
        low: +e.low || 8,
        high: +e.high || +e.low || 12,
        cat: guessCat(e.name),
        equip: guessEquip(e.name),
      })),
    }));
    return days;
  } catch {
    return parseSplitTextLocal(raw);
  }
}

// ---------- Suggestion via AI (server) fallback to local rule
async function getAISuggestion({ history, meta, units }) {
  try {
    const r = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, meta, units }),
    });
    const j = await r.json();
    if (j?.next != null) return j;
  } catch {}
  // local fallback (failure-aware)
  const last = history?.[0];
  if (!last) return null;
  const top = bestSetByLoad(last.sets);
  if (!top || meta.equip === "bodyweight") return null;
  const weight = +top.w || 0;
  const reps = +top.r || 0;
  const failedAny = (last.sets || []).some((s) => !!s.failed);
  const delta = incByCategory(meta.cat, units, weight);

  let next = weight;
  if (reps >= meta.high && !failedAny) next = weight + 1.5 * delta;
  else if (reps >= meta.high && failedAny) next = weight + 1.0 * delta;
  else if (reps >= meta.low && !failedAny) next = weight + 0.75 * delta;
  else if (reps < meta.low && failedAny) next = Math.max(0, weight - 0.5 * delta);
  else next = Math.max(0, weight - 0.25 * delta);

  return {
    next: roundByEquip(next, meta.equip, units),
    basis: { weight, reps, low: meta.low, high: meta.high, failedAny },
  };
}

// ---------- App ----------
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(DEFAULT_STATE());
  const [tab, setTab] = useState("log"); // log | split | history | chat
  const [units, setUnits] = useState(CONFIG.unitsDefault);
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedDayId, setSelectedDayId] = useState("");
  const [showTagModal, setShowTagModal] = useState(null); // {exId, setIndex}
  const [tagDraft, setTagDraft] = useState("");

  // auth
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u || null);
        const loaded = load(u);
        setUnits(loaded.units || CONFIG.unitsDefault);
        setData(loaded);
      }),
    []
  );
  useEffect(() => save(user, { ...data, units }), [data, units, user]);

  const currentSplit = useMemo(() => data.splits.find((s) => s.id === data.activeSplitId), [data]);
  useEffect(() => {
    if (currentSplit) setSelectedDayId(currentSplit.days?.[0]?.id || "");
  }, [data.activeSplitId]);

  const needsOnboarding = (data.splits?.length || 0) === 0;

  // ---- Derived: current day & initial draft for logging
  function getMeta(ex) {
    return {
      id: ex.id,
      name: ex.name,
      sets: ex.sets || 1,
      low: ex.low || 8,
      high: ex.high || 12,
      cat: ex.cat || "iso_small",
      equip: ex.equip || "unknown",
    };
  }
  const currentDay = useMemo(
    () => currentSplit?.days?.find((d) => d.id === selectedDayId) || currentSplit?.days?.[0],
    [currentSplit, selectedDayId]
  );

  const initialDraft = useMemo(() => {
    const map = {};
    if (!currentDay) return map;
    (currentDay.exercises || []).forEach((ex) => {
      const m = getMeta(ex);
      map[m.id] = Array.from({ length: m.sets }).map(() => ({
        failed: false,
        bw: m.equip === "bodyweight",
        w: m.equip === "bodyweight" ? 0 : "",
        r: "",
        tags: [],
      }));
    });
    return map;
  }, [currentDay]);

  const [draft, setDraft] = useState(initialDraft);
  const [skipToday, setSkipToday] = useState({}); // per exerciseId
  const [adhocToday, setAdhocToday] = useState([]); // [{id,name,sets,low,high,cat,equip}]

  useEffect(() => {
    setDraft(initialDraft);
    setSkipToday({});
    setAdhocToday([]);
  }, [initialDraft]);

  // ---- History helpers
  function historyFor(exId, exName) {
    return data.sessions
      .filter((s) => s.splitId === data.activeSplitId)
      .map((s) =>
        s.entries.find((e) => (exId ? e.exerciseId === exId : e.exercise === exName || e.exerciseId == null))
      )
      .filter(Boolean);
  }

  async function suggestNext(meta) {
    const hist = historyFor(meta.id, meta.name);
    if (!hist?.length) return null;
    const ans = await getAISuggestion({ history: hist, meta, units });
    return ans;
  }

  function liveSuggest(meta, idx) {
    const row = (draft[meta.id] || [])[idx];
    if (!row) return null;
    if (row.bw || meta.equip === "bodyweight") return null;
    const w = +row.w || 0;
    const r = +row.r || 0;
    if (!w || !r) return null;
    const d = incByCategory(meta.cat, units, w);
    const next =
      r >= meta.high ? w + d * 1.25 : r < meta.low ? Math.max(0, w - d * 0.25) : w + d * 0.75;
    return roundByEquip(next, meta.equip, units);
  }

  // ----- Save session
  async function saveSession() {
    if (!currentSplit || !currentDay) return alert("Pick a split/day first");

    const fromPlan = (currentDay.exercises || [])
      .filter((ex) => !skipToday[ex.id])
      .map(getMeta)
      .map((m) => {
        const arr = (draft[m.id] || []).filter((s) => +s.r > 0 && (s.bw || s.w === "0" || +s.w >= 0));
        if (!arr.length) return null;
        return {
          exerciseId: m.id,
          exercise: m.name,
          sets: arr.map((s) => ({ failed: !!s.failed, bw: !!s.bw, w: +s.w || 0, r: +s.r, tags: s.tags || [] })),
        };
      })
      .filter(Boolean);

    const fromAdhoc = adhocToday
      .map(getMeta)
      .map((m) => {
        const arr = (draft[m.id] || []).filter((s) => +s.r > 0 && (s.bw || s.w === "0" || +s.w >= 0));
        if (!arr.length) return null;
        return {
          exerciseId: m.id,
          exercise: m.name,
          sets: arr.map((s) => ({ failed: !!s.failed, bw: !!s.bw, w: +s.w || 0, r: +s.r, tags: s.tags || [] })),
          adhoc: true,
        };
      })
      .filter(Boolean);

    const entries = [...fromPlan, ...fromAdhoc];
    if (!entries.length) return alert("No sets to save yet");

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

    try {
      // fire-and-forget: let the AI coach learn / prep recommendations
      fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day: currentDay.name,
          units,
          session,
          recent: data.sessions.filter((s) => s.splitId === data.activeSplitId).slice(0, 6),
        }),
      });
    } catch {}
    alert("Session saved");
  }

  // ---- Split management
  function setActiveSplit(id) {
    setData((prev) => ({ ...prev, activeSplitId: id }));
  }
  function createSplit(name, days) {
    const id = uid();
    const split = { id, name: name || `Split ${(data.splits?.length || 0) + 1}`, days: days || [] };
    setData((prev) => ({ ...prev, splits: [...prev.splits, split], activeSplitId: id }));
  }
  function renameSplit(id) {
    const name = prompt("Split name", data.splits.find((s) => s.id === id)?.name || "");
    if (!name) return;
    setData((prev) => ({ ...prev, splits: prev.splits.map((s) => (s.id === id ? { ...s, name } : s)) }));
  }
  function removeSplit(id) {
    if (!confirm("Delete this split? (sessions stay stored; history filter changes)")) return;
    setData((prev) => ({
      ...prev,
      splits: prev.splits.filter((s) => s.id !== id),
      activeSplitId: prev.activeSplitId === id ? "" : prev.activeSplitId,
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
    const equip = selectOption("Equipment", EQUIP_OPTIONS, guessEquip(name));
    const cat = selectOption(
      "Category",
      CAT_OPTIONS.map((c) => c.id),
      guessCat(name)
    );

    const ex = { id: uid(), name, sets, low, high, equip, cat };
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((s) =>
        s.id !== splitId
          ? s
          : {
              ...s,
              days: s.days.map((d) => (d.id !== dayId ? d : { ...d, exercises: [...d.exercises, ex] })),
            }
      ),
    }));
  }
  function editExercise(splitId, dayId, exIndex) {
    setData((prev) => {
      const s = prev.splits.find((x) => x.id === splitId);
      const d = s.days.find((x) => x.id === dayId);
      const e = { ...d.exercises[exIndex] };

      const name = prompt("Exercise name", e.name) || e.name;
      const sets = Number(prompt("Sets", String(e.sets)) || e.sets);
      const low = Number(prompt("Low reps", String(e.low)) || e.low);
      const high = Number(prompt("High reps", String(e.high)) || e.high);
      const equip = selectOption("Equipment", EQUIP_OPTIONS, e.equip || guessEquip(name));
      const cat = selectOption(
        "Category",
        CAT_OPTIONS.map((c) => c.id),
        e.cat || guessCat(name)
      );

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
                        i !== exIndex ? x : { ...e, name, sets, low, high, equip, cat }
                      ),
                    }
              ),
            }
      );
      return { ...prev, splits: newSplits };
    });
  }
  function removeExercise(splitId, dayId, exIndex) {
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((sp) =>
        sp.id !== splitId
          ? sp
          : {
              ...sp,
              days: sp.days.map((dd) =>
                dd.id !== dayId ? dd : { ...dd, exercises: dd.exercises.filter((_, i) => i !== exIndex) }
              ),
            }
      ),
    }));
  }
  function moveExercise(splitId, dayId, exIndex, dir) {
    setData((prev) => ({
      ...prev,
      splits: prev.splits.map((sp) =>
        sp.id !== splitId
          ? sp
          : {
              ...sp,
              days: sp.days.map((dd) => {
                if (dd.id !== dayId) return dd;
                const arr = [...dd.exercises];
                const to = exIndex + (dir === "up" ? -1 : 1);
                if (to < 0 || to >= arr.length) return dd;
                const [item] = arr.splice(exIndex, 1);
                arr.splice(to, 0, item);
                return { ...dd, exercises: arr };
              }),
            }
      ),
    }));
  }

  // ---- Import helpers
  async function applyParsedToNewSplit(splitName, raw, useAI) {
    const days = useAI ? await parseSplitTextAI(raw) : parseSplitTextLocal(raw);
    if (!days.length) {
      alert("Couldn’t parse. Try the AI importer or use lines like 'Name — 3 × 8–12'.");
      return;
    }
    const id = uid();
    const split = { id, name: splitName || `Imported ${new Date().toISOString().slice(0, 10)}`, days };
    setData((prev) => ({ ...prev, splits: [...prev.splits, split], activeSplitId: id }));
    setTab("log");
  }

  // ---- UI render
  return (
    <div className="min-h-screen text-neutral-100">
      {/* Header */}
      <div className="mx-auto w-full max-w-screen-sm px-3 py-4">
        <Header units={units} setUnits={setUnits} user={user} setTab={setTab} />
      </div>

      {/* Auth / Verify */}
      {!user ? (
        <div className="fullscreen bg-login anime-overlay">
          <div className="safe-px safe-pt mx-auto w-full max-w-screen-sm">
            <AuthScreen />
            <div className="coach-sticker" />
          </div>
        </div>
      ) : user && !user.emailVerified ? (
        <div className="safe-px safe-pt mx-auto w-full max-w-screen-sm">
          <VerifyScreen user={user} />
        </div>
      ) : (
        <div className="safe-px mx-auto w-full max-w-screen-sm pb-8">
          {/* Tabs */}
          <nav className="mt-2 flex gap-2">
            {["log", "split", "history", "chat"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx(
                  "px-3 py-2 rounded-xl text-sm",
                  tab === t ? "bg-white text-neutral-900" : "bg-neutral-800 border border-neutral-700",
                  t === "log" && !data.activeSplitId && "opacity-50"
                )}
                disabled={t === "log" && !data.activeSplitId}
              >
                {t === "log" ? "Log" : t === "split" ? "Split" : t === "history" ? "Past Sessions" : "Coach"}
              </button>
            ))}
            {needsOnboarding && (
              <button
                onClick={() => setTab("split")}
                className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
              >
                Import
              </button>
            )}
          </nav>

          {/* Onboarding card */}
          {needsOnboarding && tab !== "split" && (
            <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
              <h2 className="font-semibold mb-1">Welcome to SetForge</h2>
              <p className="text-sm text-neutral-400">
                Offline lift tracker — your data stays on device. Start by importing or building a split.
              </p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setTab("split")} className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm">
                  Paste / Import
                </button>
                <button
                  onClick={() => {
                    const id = uid();
                    createSplit(`Split ${(data.splits?.length || 0) + 1}`);
                    setData((prev) => ({ ...prev, activeSplitId: id }));
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm"
                >
                  Build Manually
                </button>
              </div>
            </div>
          )}

          {/* Main panels */}
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
              skipToday={skipToday}
              setSkipToday={setSkipToday}
              adhocToday={adhocToday}
              setAdhocToday={setAdhocToday}
              setShowTagModal={setShowTagModal}
            />
          )}

          {tab === "split" && (
            <SplitView
              data={data}
              setData={setData}
              setActiveSplit={setActiveSplit}
              createSplit={createSplit}
              renameSplit={renameSplit}
              removeSplit={removeSplit}
              addDay={addDay}
              addExercise={addExercise}
              editExercise={editExercise}
              removeExercise={removeExercise}
              moveExercise={moveExercise}
              applyParsedToNewSplit={applyParsedToNewSplit}
            />
          )}

          {tab === "history" && <HistoryView data={data} />}

          {tab === "chat" && <CoachChat data={data} />}

          <footer className="text-center text-[10px] text-neutral-500 mt-6">
            Built for you. Works offline. Advice-only AI coach when online.
          </footer>
        </div>
      )}

      {/* Tag modal */}
      {showTagModal && (
        <TagModal
          isOpen
          preset={PRESET_TAGS}
          selected={(draft[showTagModal.exId]?.[showTagModal.idx]?.tags) || []}
          onClose={() => {
            setTagDraft("");
            setShowTagModal(null);
          }}
          onToggle={(tag) => {
            const { exId, idx } = showTagModal;
            setDraft((prev) => {
              const arr = [...(prev[exId] || [])];
              const row = { ...(arr[idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
              const has = (row.tags || []).includes(tag);
              row.tags = has ? row.tags.filter((x) => x !== tag) : [...(row.tags || []), tag];
              arr[idx] = row;
              return { ...prev, [exId]: arr };
            });
          }}
          tagDraft={tagDraft}
          setTagDraft={setTagDraft}
          onAddCustom={() => {
            const t = tagDraft.trim();
            if (!t) return;
            const { exId, idx } = showTagModal;
            setDraft((prev) => {
              const arr = [...(prev[exId] || [])];
              const row = { ...(arr[idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
              row.tags = [...new Set([...(row.tags || []), t])];
              arr[idx] = row;
              return { ...prev, [exId]: arr };
            });
            setTagDraft("");
          }}
        />
      )}
    </div>
  );
}

// ---------- Header ----------
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
            <button className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm" onClick={() => setTab("chat")}>
              Coach
            </button>
            <button onClick={() => signOut(getAuth())} className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-sm">
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
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
    <section className="glass-strong rounded-2xl border border-neutral-800 p-4 mx-auto max-w-md">
      <div className="text-center mb-3">
        <div className="text-2xl font-bold">SetForge</div>
        <div className="text-sm text-neutral-300">Sign {mode === "signin" ? "in" : "up"} to get started</div>
      </div>
      <div className="grid gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input" />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (8+ chars)" className="input" />
        <button onClick={go} disabled={busy} className="btn btn-primary">
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        {msg && <div className="text-xs text-neutral-200">{msg}</div>}
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
  suggestNext,
  liveSuggest,
  saveSession,
  skipToday,
  setSkipToday,
  adhocToday,
  setAdhocToday,
  setShowTagModal,
}) {
  if (!currentSplit) return <div className="mt-6 text-sm text-neutral-400">Pick a split first in the Split tab.</div>;
  const day = currentSplit.days?.find((d) => d.id === selectedDayId) || currentSplit.days?.[0];
  const getMeta = (i) => ({ id: i.id, name: i.name, sets: i.sets, low: i.low, high: i.high, cat: i.cat, equip: i.equip });

  function addSet(exId, equip) {
    setDraft((prev) => ({
      ...prev,
      [exId]: [
        ...(prev[exId] || []),
        { failed: false, bw: equip === "bodyweight", w: equip === "bodyweight" ? 0 : "", r: "", tags: [] },
      ],
    }));
  }
  function removeSetHere(exId, idx) {
    setDraft((prev) => {
      const arr = [...(prev[exId] || [])];
      arr.splice(idx, 1);
      return { ...prev, [exId]: arr.length ? arr : [{ failed: false, bw: false, w: "", r: "", tags: [] }] };
    });
  }
  function toggleSkip(exId) {
    setSkipToday((prev) => ({ ...prev, [exId]: !prev[exId] }));
  }
  function addAdhoc() {
    const name = prompt("Ad-hoc exercise (today only)");
    if (!name) return;
    const sets = Number(prompt("Sets", "3") || 3);
    const low = Number(prompt("Low reps", "8") || 8);
    const high = Number(prompt("High reps", "12") || 12);
    const equip = selectOption("Equipment", EQUIP_OPTIONS, guessEquip(name));
    const cat = selectOption(
      "Category",
      CAT_OPTIONS.map((c) => c.id),
      guessCat(name)
    );
    const ex = { id: uid(), name, sets, low, high, equip, cat };
    setAdhocToday((prev) => [...prev, ex]);
    setDraft((prev) => ({
      ...prev,
      [ex.id]: Array.from({ length: ex.sets }).map(() => ({
        failed: false,
        bw: equip === "bodyweight",
        w: equip === "bodyweight" ? 0 : "",
        r: "",
        tags: [],
      })),
    }));
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
          <button onClick={addAdhoc} className="btn text-sm">
            + Add exercise (today)
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {[...(day?.exercises || []), ...adhocToday].map((exItem) => {
          const m = getMeta(exItem);
          const exId = m.id;
          const sets = draft[exId] || [];
          return (
            <div key={exId} className="rounded-xl border border-neutral-800 p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-base">{m.name}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleSkip(exId)} className="pill">
                    {skipToday[exId] ? "Skipped" : "Skip today"}
                  </button>
                </div>
              </div>

              {!skipToday[exId] && (
                <div className="mt-2 grid gap-2">
                  {sets.map((s, idx) => {
                    const live = liveSuggest(m, idx);
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <label className="col-span-3 text-[11px] text-neutral-300 flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={!!s.failed}
                            onChange={() => updateSetFlag(setDraft, draft, exId, idx, "failed")}
                          />{" "}
                          failed at
                        </label>

                        <label className="col-span-2 text-[11px] text-neutral-300 flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={!!s.bw}
                            onChange={() => {
                              setDraft((prev) => {
                                const arr = [...(prev[exId] || [])];
                                const row = { ...(arr[idx] || { failed: false, bw: false, w: "", r: "", tags: [] }) };
                                row.bw = !row.bw;
                                if (row.bw) row.w = 0;
                                arr[idx] = row;
                                return { ...prev, [exId]: arr };
                              });
                            }}
                          />{" "}
                          BW
                        </label>

                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder={`${s.bw ? "BW" : "lb"}`}
                          value={s.bw ? 0 : s.w}
                          disabled={s.bw}
                          onChange={(e) => updateSetField(setDraft, draft, exId, idx, "w", e.target.value)}
                          className="col-span-3 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="reps"
                          value={s.r}
                          onChange={(e) => updateSetField(setDraft, draft, exId, idx, "r", e.target.value)}
                          className="col-span-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700"
                        />
                        <div className="col-span-2 flex gap-2">
                          <button onClick={() => setShowTagModal({ exId, idx })} className="btn btn-ghost text-xs">
                            Tags
                          </button>
                          <button onClick={() => removeSetHere(exId, idx)} className="text-red-400">
                            ✕
                          </button>
                        </div>
                        {live !== null && (
                          <div className="col-span-12 text-[11px] text-neutral-400">
                            Next set: <b className="text-neutral-100">{live} {/** units shown */}</b> {/** units omitted for BW */}
                            {!s.bw && <b className="text-neutral-100"> {units}</b>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => addSet(exId, m.equip)} className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm">
                    Add set
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={saveSession} className="px-4 py-2 rounded-xl bg-white text-neutral-900">
          Save session
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
    if (key === "w" && row.bw) row.bw = false;
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

// ---------- Split View ----------
function SplitView({
  data,
  setData,
  setActiveSplit,
  createSplit,
  renameSplit,
  removeSplit,
  addDay,
  addExercise,
  editExercise,
  removeExercise,
  moveExercise,
  applyParsedToNewSplit,
}) {
  const [mode, setMode] = useState("list"); // list | paste | templates | import
  const [paste, setPaste] = useState("");
  const [useAI, setUseAI] = useState(true);

  async function runImport() {
    const name = prompt("Split name", "Imported Split");
    if (!name) return;
    await applyParsedToNewSplit(name, paste, useAI);
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      {mode === "list" && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-neutral-300">Your splits</div>
            <div className="flex gap-2">
              <button onClick={() => setMode("paste")} className="px-3 py-2 rounded-xl bg-white text-neutral-900 text-sm">
                Import / Paste
              </button>
              <button onClick={() => setMode("templates")} className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm">
                Templates
              </button>
              <button
                onClick={() => {
                  const name = prompt("Split name", `Split ${data.splits.length + 1}`);
                  if (!name) return;
                  createSplit(name);
                }}
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
                      <button onClick={() => setActiveSplit(s.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                        Set active
                      </button>
                    )}
                    <button onClick={() => renameSplit(s.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                      Rename
                    </button>
                    <button onClick={() => addDay(s.id)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                      Add day
                    </button>
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
                          <li key={e.id} className="flex items-center justify-between text-sm bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1">
                            <span>
                              {e.name}{" "}
                              <span className="text-neutral-500">
                                ({e.sets}×{e.low}–{e.high} • {e.equip}, {e.cat})
                              </span>
                            </span>
                            <span className="flex gap-1">
                              <button onClick={() => moveExercise(s.id, d.id, i, "up")} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                                ↑
                              </button>
                              <button onClick={() => moveExercise(s.id, d.id, i, "down")} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                                ↓
                              </button>
                              <button onClick={() => describeExercise(e.name)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                                Desc
                              </button>
                              <button onClick={() => editExercise(s.id, d.id, i)} className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs">
                                Edit
                              </button>
                              <button onClick={() => removeExercise(s.id, d.id, i)} className="px-2 py-1 rounded text-red-400 text-xs">
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
            {data.splits.length === 0 && <div className="text-neutral-500">No splits yet</div>}
          </div>
        </>
      )}

      {mode === "paste" && (
        <div className="bg-import anime-overlay rounded-2xl p-3">
          <div className="glass-strong p-3 rounded-xl">
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
              placeholder={`PUSH A\nIncline Barbell Press — 3 × 6–10\n...`}
              className="mt-2 w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
            />
            <div className="mt-2 flex items-center gap-3">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} /> Use AI importer
              </label>
              <button onClick={runImport} className="btn btn-primary">
                Use this split
              </button>
              <label className="btn btn-ghost cursor-pointer">
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
          <div className="coach-sticker" />
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
                  onClick={() => applyParsedToNewSplit(TEMPLATES[key].name, TEMPLATES[key].daysText, false)}
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

async function describeExercise(name) {
  try {
    const r = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json();
    alert(j?.description || "No description available.");
  } catch {
    alert("Description unavailable right now.");
  }
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by day/exercise" className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm" />
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
              <div className="text-neutral-400">{s.entries.length} exercises</div>
            </div>
            <div className="mt-2 grid gap-1 text-xs">
              {s.entries.map((e, i) => (
                <div key={i} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                  <div className="font-medium">{e.exercise}</div>
                  <div className="text-neutral-300">
                    {e.sets
                      .map((t) => `${t.failed ? "✖ " : ""}${t.bw ? "BW" : t.w + s.units}×${t.r}${t.tags?.length ? ` [${t.tags.join(", ")}]` : ""}`)
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

// ---------- Coach Chat ----------
function CoachChat({ data }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hey! I’m your hypertrophy coach. Ask me about programming, form cues, exercise swaps, diet targets—or type 'help' for app tips.",
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const context = {
    activeSplit: data.splits.find((s) => s.id === data.activeSplitId)?.name || "",
    splitDays: data.splits.find((s) => s.id === data.activeSplitId)?.days?.map((d) => d.name) || [],
  };

  async function send() {
    const msg = text.trim();
    if (!msg) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, context }),
      });
      const j = await r.json();
      setMessages((m) => [...m, { role: "assistant", content: j?.reply || "(no reply)" }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Network hiccup—try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="text-sm text-neutral-300 mb-2">Hypertrophy Coach</div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 h-80 overflow-y-auto space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={cx("text-sm", m.role === "assistant" ? "text-neutral-200" : "text-neutral-100")}>
            <b className="text-neutral-400">{m.role === "assistant" ? "Coach" : "You"}:</b> {m.content}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about training, form, diet—or type 'help'"
          className="input"
        />
        <button onClick={send} disabled={busy} className="btn btn-primary">
          {busy ? "..." : "Send"}
        </button>
      </div>
      <div className="mt-2 flex gap-2 flex-wrap">
        {["Help", "Best split for arms?", "Swap for leg press", "Protein target at 180 lb?"].map((q) => (
          <button key={q} onClick={() => setText(q)} className="pill">
            {q}
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------- Tag Modal (inline) ----------
function TagModal({ isOpen, preset, selected, onToggle, onClose, tagDraft, setTagDraft, onAddCustom }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 w-full max-w-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Tags</div>
          <button onClick={onClose} className="text-neutral-400">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {preset.map((t) => (
            <button
              key={t}
              onClick={() => onToggle(t)}
              className={cx(
                "px-2 py-1 rounded-lg border text-sm",
                selected.includes(t) ? "bg-white text-neutral-900 border-white" : "bg-neutral-800 border-neutral-700"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="+ custom tag" className="input" />
          <button onClick={onAddCustom} className="btn">
            Add
          </button>
        </div>
      </div>
    </div>
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

// ---------- Small util ----------
function selectOption(label, opts, current) {
  const s = prompt(`${label}:\n${opts.join(" | ")}\n(default: ${current || opts[0]})`, current || opts[0]);
  if (!s) return current || opts[0];
  const v = s.trim().toLowerCase();
  const hit = opts.find((o) => String(o).toLowerCase() === v);
  return hit || current || opts[0];
}
