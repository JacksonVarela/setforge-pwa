import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, CartesianGrid } from "recharts";

const LS_KEY = "setforge_baki_v1";

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

const defaultData = {
  units: CONFIG.unitsDefault,
  split: [
    {
      id: "pullA",
      name: "Pull A · Long Head Biceps Back Traps",
      exercises: [
        { name: "Cross Cable Y-Raises", sets: 2, low: 15, high: 15, cat: "iso_small", equip: "cable" },
        { name: "Incline Dumbbell Curls", sets: 3, low: 8, high: 12, cat: "iso_small", equip: "dumbbell" },
        { name: "Face Pulls", sets: 2, low: 12, high: 15, cat: "iso_small", equip: "cable" },
        { name: "Barbell Bent-Over Row", sets: 3, low: 6, high: 10, cat: "upper_comp", equip: "barbell" },
        { name: "Straight-Arm Lat Pulldown", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "cable" },
        { name: "Dumbbell Shrugs", sets: 3, low: 12, high: 15, cat: "upper_comp", equip: "dumbbell" },
        { name: "Barbell Wrist Curls", sets: 2, low: 20, high: 20, cat: "iso_small", equip: "barbell" },
        { name: "Reverse EZ-Bar Curls", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "barbell" },
        { name: "Neck Curls (Front)", sets: 3, low: 15, high: 15, cat: "iso_small", equip: "bodyweight" },
      ],
    },
    {
      id: "pushA",
      name: "Push A · Triceps Shoulders Chest Abs",
      exercises: [
        { name: "Cable External Rotations", sets: 2, low: 15, high: 15, cat: "iso_small", equip: "cable" },
        { name: "Overhead Rope Triceps Extensions", sets: 3, low: 10, high: 12, cat: "iso_small", equip: "cable" },
        { name: "Reverse-Grip Pushdowns", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "cable" },
        { name: "Cable Lateral Raises", sets: 3, low: 12, high: 15, cat: "iso_small", equip: "cable" },
        { name: "Seated Dumbbell Shoulder Press", sets: 3, low: 6, high: 10, cat: "upper_comp", equip: "dumbbell" },
        { name: "Flat Dumbbell Press", sets: 3, low: 6, high: 10, cat: "upper_comp", equip: "dumbbell" },
        { name: "Abduction Machine", sets: 3, low: 15, high: 15, cat: "iso_small", equip: "machine" },
        { name: "Hanging Leg Raises", sets: 3, low: 12, high: 15, cat: "iso_small", equip: "bodyweight" },
        { name: "Weighted Rope Crunches", sets: 3, low: 15, high: 20, cat: "iso_small", equip: "cable" },
        { name: "Hanging Knee Raise with Twist", sets: 4, low: 12, high: 15, cat: "iso_small", equip: "bodyweight" },
      ],
    },
    {
      id: "legsA",
      name: "Legs A · Quads Hams Arms Calves Adductors",
      exercises: [
        { name: "EZ-Bar Spider Curls", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "barbell" },
        { name: "Skull-Crushers", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "barbell" },
        { name: "Seated Hamstring Curls", sets: 4, low: 10, high: 12, cat: "lower_comp", equip: "machine" },
        { name: "Back Squats", sets: 3, low: 6, high: 8, cat: "lower_comp", equip: "barbell" },
        { name: "Bulgarian Split Squats", sets: 2, low: 8, high: 10, cat: "lower_comp", equip: "dumbbell" },
        { name: "Leg Extensions", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "machine" },
        { name: "Standing Calf Raises", sets: 4, low: 15, high: 15, cat: "iso_small", equip: "machine" },
        { name: "Adduction Machine", sets: 3, low: 15, high: 15, cat: "iso_small", equip: "machine" },
        { name: "Behind-the-Back Barbell Wrist Curls", sets: 2, low: 20, high: 20, cat: "iso_small", equip: "barbell" },
        { name: "Reverse DB Curls", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "dumbbell" },
      ],
    },
    {
      id: "pullB",
      name: "Pull B · Short Head Biceps Lats Rear Delts Neck",
      exercises: [
        { name: "Banded or Cable External Rotations", sets: 2, low: 15, high: 15, cat: "iso_small", equip: "cable" },
        { name: "EZ-Bar Preacher Curls", sets: 3, low: 8, high: 12, cat: "iso_small", equip: "barbell" },
        { name: "Cable Row (Close-Grip)", sets: 3, low: 8, high: 10, cat: "upper_comp", equip: "cable" },
        { name: "Neutral-Grip Pulldown", sets: 2, low: 8, high: 10, cat: "upper_comp", equip: "cable" },
        { name: "45° Back Extensions", sets: 3, low: 15, high: 15, cat: "lower_comp", equip: "bodyweight" },
        { name: "Reverse Pec Deck", sets: 3, low: 15, high: 15, cat: "iso_small", equip: "machine" },
        { name: "Seated DB Wrist Curls", sets: 2, low: 20, high: 25, cat: "iso_small", equip: "dumbbell" },
        { name: "Reverse Wrist Curls", sets: 2, low: 15, high: 20, cat: "iso_small", equip: "dumbbell" },
        { name: "Neck Extensions (Back)", sets: 3, low: 15, high: 15, cat: "iso_small", equip: "bodyweight" },
      ],
    },
    {
      id: "pushB",
      name: "Push B · Shoulders Chest Triceps Abs",
      exercises: [
        { name: "Cross Cable Y-Raises", sets: 2, low: 15, high: 15, cat: "iso_small", equip: "cable" },
        { name: "Overhead Rope Extensions", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "cable" },
        { name: "Skull Crushers", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "barbell" },
        { name: "Dumbbell Lateral Raises", sets: 3, low: 12, high: 15, cat: "iso_small", equip: "dumbbell" },
        { name: "Seated Machine Shoulder Press", sets: 3, low: 6, high: 10, cat: "upper_comp", equip: "machine" },
        { name: "Incline Barbell Press", sets: 3, low: 6, high: 10, cat: "upper_comp", equip: "barbell" },
        { name: "Weighted Dips", sets: 3, low: 6, high: 10, cat: "upper_comp", equip: "bodyweight" },
        { name: "Hanging Leg Raises", sets: 3, low: 12, high: 15, cat: "iso_small", equip: "bodyweight" },
        { name: "Weighted Rope Crunches", sets: 3, low: 15, high: 20, cat: "iso_small", equip: "cable" },
        { name: "Hanging Knee Raise with Twist", sets: 4, low: 12, high: 15, cat: "iso_small", equip: "bodyweight" },
      ],
    },
    {
      id: "legsB",
      name: "Legs B · Glutes Hams Biceps Calves Abductors",
      exercises: [
        { name: "BTB Cable Curls", sets: 2, low: 10, high: 12, cat: "iso_small", equip: "cable" },
        { name: "Lying Hamstring Curls", sets: 4, low: 10, high: 12, cat: "lower_comp", equip: "machine" },
        { name: "Romanian Deadlifts", sets: 3, low: 8, high: 8, cat: "lower_comp", equip: "barbell" },
        { name: "Leg Press (High Foot)", sets: 3, low: 8, high: 10, cat: "lower_comp", equip: "machine" },
        { name: "Seated Calf Raises", sets: 4, low: 15, high: 15, cat: "iso_small", equip: "machine" },
        { name: "Abduction Machine", sets: 3, low: 15, high: 15, cat: "iso_small", equip: "machine" },
        { name: "Adduction Machine", sets: 3, low: 15, high: 15, cat: "iso_small", equip: "machine" },
      ],
    },
  ],
  sessions: [],
};

function loadData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw);
    return { ...defaultData, ...parsed };
  } catch {
    return defaultData;
  }
}

function saveData(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function classNames(...args) {
  return args.filter(Boolean).join(" ");
}

export default function App() {
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState("log");
  const [selectedDayId, setSelectedDayId] = useState(data.split[0]?.id || "");
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [units, setUnits] = useState(data.units || CONFIG.unitsDefault);

  useEffect(() => { setData(prev => ({ ...prev, units })); }, [units]);
  useEffect(() => { saveData(data); }, [data]);

  const currentDay = useMemo(() => data.split.find(d => d.id === selectedDayId) || data.split[0], [data.split, selectedDayId]);

  function getExerciseMeta(item){
    if (!item) return { name: "", sets: 1, low: 8, high: 12, cat: "iso_small", equip: "machine" };
    if (typeof item === "string") return { name: item, sets: 1, low: 8, high: 12, cat: "iso_small", equip: "machine" };
    return { name: item.name, sets: item.sets ?? 1, low: item.low ?? 8, high: item.high ?? 12, cat: item.cat ?? "iso_small", equip: item.equip ?? "machine" };
  }

  // Draft logging per exercise
  const initialDraft = useMemo(() => {
    const map = {};
    (currentDay?.exercises || []).forEach((ex) => {
      const m = getExerciseMeta(ex);
      map[m.name] = Array.from({ length: m.sets }).map(() => ({ w: "", r: "", rpe: "", note: "", fail: false }));
    });
    return map;
  }, [currentDay]);
  const [draft, setDraft] = useState(initialDraft);
  useEffect(() => setDraft(initialDraft), [initialDraft]);

  function updateSet(exercise, idx, field, value) {
    setDraft(prev => {
      const arr = prev[exercise] ? [...prev[exercise]] : [];
      const row = { ...(arr[idx] || { w: "", r: "", rpe: "", note: "", fail: false }) };
      row[field] = value;
      arr[idx] = row;
      return { ...prev, [exercise]: arr };
    });
  }
  function toggleFail(exercise, idx) {
    setDraft(prev => {
      const arr = prev[exercise] ? [...prev[exercise]] : [];
      const row = { ...(arr[idx] || { w: "", r: "", rpe: "", note: "", fail: false }) };
      row.fail = !row.fail;
      arr[idx] = row;
      return { ...prev, [exercise]: arr };
    });
  }
  function addSet(exercise) { setDraft(prev => ({ ...prev, [exercise]: [...(prev[exercise] || []), { w: "", r: "", rpe: "", note: "", fail: false }] })); }
  function removeSet(exercise, idx) {
    setDraft(prev => {
      const arr = [...(prev[exercise] || [])];
      arr.splice(idx, 1);
      return { ...prev, [exercise]: arr.length ? arr : [{ w: "", r: "", rpe: "", note: "", fail: false }] };
    });
  }

  // Helpers
  function roundByEquip(weight, equip){
    const step = units === "kg" ? (equip === "machine" ? 1 : equip === "dumbbell" ? 1.25 : equip === "barbell" ? 2.5 : 2.5) :
                                   (equip === "machine" ? CONFIG.machineStepLb : equip === "dumbbell" ? CONFIG.dumbbellStepLb : equip === "barbell" ? CONFIG.barbellStepLb : CONFIG.bodyweightStepLb);
    return Math.round(weight / step) * step;
  }

  function incByCategory(cat, current){
    const pct = cat === "lower_comp" ? CONFIG.lowerPct : cat === "upper_comp" ? CONFIG.upperPct : CONFIG.isoPct;
    const raw = (Number(current) || 0) * pct;
    let min = units === "kg" ? (cat === "lower_comp" ? CONFIG.lowerMinKg : cat === "upper_comp" ? CONFIG.upperMinKg : CONFIG.isoMinKg)
                              : (cat === "lower_comp" ? CONFIG.lowerMinLb : cat === "upper_comp" ? CONFIG.upperMinLb : CONFIG.isoMinLb);
    return Math.max(raw, min);
  }

  function bestSetByLoad(sets){
    if (!sets || !sets.length) return null;
    return sets.slice().sort((a,b)=>{
      const wa = Number(a.w)||0, wb = Number(b.w)||0;
      if (wb !== wa) return wb - wa;
      const ra = Number(a.r)||0, rb = Number(b.r)||0;
      return rb - ra;
    })[0];
  }

  function getExerciseHistory(name) {
    const out = [];
    for (const s of data.sessions) {
      for (const e of s.entries) {
        if (e.exercise === name) out.push({ dateISO: s.dateISO, units: s.units, volume: e.volume, sets: e.sets, dayName: s.dayName });
      }
    }
    return out;
  }

  function calcExerciseVolume(exercise) {
    const sets = draft[exercise] || [];
    return sets.reduce((sum, s) => sum + (Number(s.w) || 0) * (Number(s.r) || 0), 0);
  }

  const sessionVolume = useMemo(() => {
    const names = (currentDay?.exercises || []).map(getExerciseMeta).map(m=>m.name);
    return names.reduce((sum, ex) => sum + calcExerciseVolume(ex), 0);
  }, [draft, currentDay]);

  function suggestNextLoad(exMeta){
    const { name, low, high, cat, equip } = exMeta;
    const hist = getExerciseHistory(name);
    if (!hist.length) return null;
    const last = hist[0];
    const top = bestSetByLoad(last.sets);
    if (!top) return null;
    const weight = Number(top.w)||0;
    const reps = Number(top.r)||0;

    let delta = incByCategory(cat, weight);
    let next = weight;
    let action = "keep";
    if (reps >= high) { action = "up"; next = roundByEquip(weight + delta, equip); }
    else if (reps < low) { action = "down"; next = roundByEquip(Math.max(0, weight - delta), equip); }

    return { next, action, basis: { weight, reps, low, high, delta, equip } };
  }

  function liveSetSuggestion(exMeta, setIdx){
    const { name, low, high, cat, equip } = exMeta;
    const sets = draft[name] || [];
    const lastEntered = sets[setIdx];
    if (!lastEntered) return null;
    const w = Number(lastEntered.w)||0;
    const r = Number(lastEntered.r)||0;
    if (!w || !r) return null;
    const delta = incByCategory(cat, w);
    if (r >= high) return roundByEquip(w + delta, equip);
    if (r < low) return roundByEquip(Math.max(0, w - delta), equip);
    return roundByEquip(w, equip);
  }

  function saveSession() {
    const metas = (currentDay?.exercises || []).map(getExerciseMeta);
    const entries = metas.map(ex => {
      const sets = (draft[ex.name] || []).filter(s => (s.w === 0 || s.w === "0" || Number(s.w) > -99999) && Number(s.r) > 0);
      const cleaned = sets.map(s => ({ w: Number(s.w), r: Number(s.r), rpe: s.rpe, note: s.note, fail: !!s.fail }));
      return {
        exercise: ex.name,
        sets: cleaned,
        volume: cleaned.reduce((t, s) => t + Math.max(0, Number(s.w)) * Number(s.r), 0),
      };
    }).filter(ent => ent.sets.length > 0);

    if (!entries.length) {
      alert("No sets to save. Add at least one work set.");
      return;
    }

    const session = {
      id: uid(),
      dateISO: today,
      dayId: currentDay.id,
      dayName: currentDay.name,
      entries,
      volume: entries.reduce((s, e) => s + e.volume, 0),
      units,
    };

    setData(prev => ({ ...prev, sessions: [session, ...prev.sessions] }));
    alert("Session saved");
  }

  function clearAll() {
    if (!confirm("Reset all data including sessions and split")) return;
    setData(defaultData);
    setUnits(defaultData.units);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `setforge_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setData(parsed);
        setUnits(parsed.units || CONFIG.unitsDefault);
        alert("Import complete");
      } catch {
        alert("Invalid file");
      }
    };
    reader.readAsText(file);
  }

  function addExerciseToDay(dayId) {
    const name = prompt("Exercise name");
    if (!name) return;
    const sets = Number(prompt("Planned sets", "3") || 3);
    const low = Number(prompt("Low end reps", "8") || 8);
    const high = Number(prompt("High end reps", "12") || 12);
    const cat = prompt("Category iso_small | upper_comp | lower_comp", "iso_small") || "iso_small";
    const equip = prompt("Equip barbell | dumbbell | machine | cable | bodyweight", "machine") || "machine";
    setData(prev => ({
      ...prev,
      split: prev.split.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, { name, sets, low, high, cat, equip }] } : d),
    }));
  }

  function renameDay(dayId) {
    const name = prompt("Day name", data.split.find(d => d.id === dayId)?.name || "");
    if (!name) return;
    setData(prev => ({ ...prev, split: prev.split.map(d => d.id === dayId ? { ...d, name } : d) }));
  }

  function deleteExercise(dayId, exName) {
    if (!confirm(`Remove ${exName} from day`)) return;
    setData(prev => ({
      ...prev,
      split: prev.split.map(d => d.id === dayId ? { ...d, exercises: d.exercises.filter(e => getExerciseMeta(e).name !== exName) } : d),
    }));
  }

  function addDay() {
    const name = prompt("New day name");
    if (!name) return;
    const id = uid();
    setData(prev => ({ ...prev, split: [...prev.split, { id, name, exercises: [] }] }));
    setSelectedDayId(id);
  }

  function deleteDay(dayId) {
    if (!confirm("Delete this day from the split")) return;
    setData(prev => ({ ...prev, split: prev.split.filter(d => d.id !== dayId) }));
    setSelectedDayId(prev => {
      const first = data.split.find(d => d.id !== dayId)?.id || "";
      return first;
    });
  }

  function chartDataFor(exName){
    const rows = [];
    for (const s of [...data.sessions].reverse()) {
      const e = s.entries.find(x => x.exercise === exName);
      if (!e) continue;
      const top = bestSetByLoad(e.sets);
      if (top) rows.push({ date: s.dateISO, weight: Number(top.w) });
    }
    return rows;
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">SetForge</h1>
            <p className="text-sm text-neutral-400">Split based logging, offline first, your data stays on device.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={units} onChange={e => setUnits(e.target.value)} className="border border-neutral-700 bg-neutral-800 rounded-xl px-3 py-2">
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
            <button onClick={exportJSON} className="px-3 py-2 rounded-xl bg-white text-neutral-900">Export</button>
            <label className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 cursor-pointer">
              Import
              <input type="file" accept="application/json" onChange={handleImport} className="hidden" />
            </label>
            <button onClick={clearAll} className="px-3 py-2 rounded-xl bg-red-600 text-white">Reset</button>
          </div>
        </header>

        <nav className="flex gap-2 mb-4">
          {[
            { id: "log", label: "Log" },
            { id: "split", label: "Split" },
            { id: "sessions", label: "Sessions" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={classNames("px-4 py-2 rounded-xl", tab === t.id ? "bg-white text-neutral-900" : "bg-neutral-800 border border-neutral-700")}>{t.label}</button>
          ))}
        </nav>

        {tab === "log" && (
          <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 md:p-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex gap-2 items-center">
                <label className="text-sm text-neutral-400">Day</label>
                <select value={selectedDayId} onChange={e => setSelectedDayId(e.target.value)} className="border border-neutral-700 bg-neutral-800 rounded-xl px-3 py-2">
                  {data.split.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <label className="text-sm text-neutral-400 ml-2">Date</label>
                <input type="date" value={today} onChange={e => setToday(e.target.value)} className="border border-neutral-700 bg-neutral-800 rounded-xl px-3 py-2" />
              </div>
              <div className="text-sm text-neutral-400">Session volume: <strong className="text-neutral-100">{sessionVolume}</strong> {units}·reps</div>
            </div>

            <div className="mt-4 grid gap-4">
              {(currentDay?.exercises || []).map((exItem) => {
                const meta = getExerciseMeta(exItem);
                const ex = meta.name;
                const sets = draft[ex] || [];
                const volume = calcExerciseVolume(ex);
                const history = getExerciseHistory(ex);
                const suggest = suggestNextLoad(meta);
                const [showChart, setShowChart] = useState(false);

                return (
                  <div key={ex} className="border border-neutral-800 rounded-2xl p-3 bg-neutral-900">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <h3 className="font-semibold text-lg">{ex}</h3>
                      <div className="text-sm text-neutral-400">
                        Target reps: <strong className="text-neutral-100">{meta.low}–{meta.high}</strong>
                        <span className="ml-3">Volume: <strong className="text-neutral-100">{volume}</strong> {units}·reps</span>
                      </div>
                    </div>

                    {suggest && (
                      <div className="mt-1 text-sm border border-neutral-800 rounded-xl px-3 py-2 bg-neutral-800 text-neutral-200">
                        Next time suggestion: <strong>{suggest.next} {units}</strong>
                        <span className="ml-2 text-neutral-400">(last best set {suggest.basis.weight}{units} × {suggest.basis.reps})</span>
                      </div>
                    )}

                    <div className="mt-2 grid gap-2">
                      {sets.map((s, idx) => {
                        const live = liveSetSuggestion(meta, idx);
                        return (
                          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                            <input type="number" inputMode="decimal" placeholder={`${units}`} value={s.w} onChange={e => updateSet(ex, idx, "w", e.target.value)} className="col-span-2 border border-neutral-700 bg-neutral-800 rounded-xl px-3 py-2" />
                            <input type="number" inputMode="numeric" placeholder="reps" value={s.r} onChange={e => updateSet(ex, idx, "r", e.target.value)} className="col-span-2 border border-neutral-700 bg-neutral-800 rounded-xl px-3 py-2" />
                            <input type="number" inputMode="decimal" placeholder="RPE" value={s.rpe} onChange={e => updateSet(ex, idx, "rpe", e.target.value)} className="col-span-2 border border-neutral-700 bg-neutral-800 rounded-xl px-3 py-2" />
                            <input type="text" placeholder="note" value={s.note} onChange={e => updateSet(ex, idx, "note", e.target.value)} className="col-span-4 border border-neutral-700 bg-neutral-800 rounded-xl px-3 py-2" />
                            <label className="col-span-1 text-xs text-neutral-300 flex items-center gap-1">
                              <input type="checkbox" checked={!!s.fail} onChange={() => toggleFail(ex, idx)} />
                              fail
                            </label>
                            <button onClick={() => removeSet(ex, idx)} className="col-span-1 text-red-400">✕</button>
                            {live !== null && (
                              <div className="col-span-12 text-xs text-neutral-400">Next set suggestion: <span className="text-neutral-100">{live} {units}</span></div>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <button onClick={() => addSet(ex)} className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700">Add set</button>
                        <div className="flex flex-wrap gap-1 items-center text-xs">
                          {PRESET_TAGS.map(t => (
                            <button key={t} onClick={() => updateSet(ex, (draft[ex]?.length||1)-1, "note", ((draft[ex]?.slice(-1)[0]?.note)||"") + ( ((draft[ex]?.slice(-1)[0]?.note)||"") ? "; " : "") + t)} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded-lg">{t}</button>
                          ))}
                          <CustomTagAdder onAdd={(tag)=> updateSet(ex, (draft[ex]?.length||1)-1, "note", ((draft[ex]?.slice(-1)[0]?.note)||"") + ( ((draft[ex]?.slice(-1)[0]?.note)||"") ? "; " : "") + tag)} />
                        </div>
                      </div>
                    </div>

                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-neutral-300">Recent history</summary>
                      <div className="mt-2 text-sm">
                        {history.length === 0 && <div className="text-neutral-500">No history yet</div>}
                        {history.slice(0, 5).map((h, i) => (
                          <div key={i} className="flex items-center justify-between py-1 border-b border-neutral-800 last:border-none text-neutral-300">
                            <div>{h.dateISO} · {h.dayName}</div>
                            <div>Vol {h.volume} {h.units}·reps</div>
                          </div>
                        ))}
                      </div>
                    </details>

                    <ChartToggle ex={ex} chartDataFor={chartDataFor} />
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={saveSession} className="px-4 py-2 rounded-xl bg-white text-neutral-900">Save session</button>
            </div>
          </section>
        )}

        {tab === "split" && (
          <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 md:p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={addDay} className="px-3 py-2 rounded-xl bg-white text-neutral-900">Add day</button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {data.split.map(d => (
                <div key={d.id} className="border border-neutral-800 rounded-2xl p-4 bg-neutral-900">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">{d.name}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => renameDay(d.id)} className="px-3 py-1 rounded-xl bg-neutral-800 border border-neutral-700">Rename</button>
                      <button onClick={() => deleteDay(d.id)} className="px-3 py-1 rounded-xl bg-red-600 text-white">Delete</button>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {d.exercises.map(ex => {
                      const m = getExerciseMeta(ex);
                      return (
                        <li key={m.name} className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2">
                          <span>{m.name} <span className="text-xs text-neutral-400">({m.sets} sets {m.low}–{m.high} reps)</span></span>
                          <button onClick={() => deleteExercise(d.id, m.name)} className="text-red-400">Remove</button>
                        </li>
                      );
                    })}
                  </ul>
                  <button onClick={() => addExerciseToDay(d.id)} className="mt-3 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700">Add exercise</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "sessions" && (
          <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 md:p-6 shadow-sm">
            <SessionsView data={data} />
          </section>
        )}

        <footer className="text-center text-xs text-neutral-500 mt-8">
          Built for Baki, SetForge keeps everything local.
        </footer>
      </div>
    </div>
  );
}

function ChartToggle({ ex, chartDataFor }){
  const [showChart, setShowChart] = useState(false);
  return (
    <>
      <button onClick={() => setShowChart(v => !v)} className="mt-2 text-xs px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700">{showChart ? "Hide chart" : "Show chart"}</button>
      {showChart && (
        <div className="mt-2 h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataFor(ex)} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
              <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 10 }} />
              <YAxis stroke="#a3a3a3" tick={{ fontSize: 10 }} />
              <Tooltip wrapperStyle={{ backgroundColor: "#111", border: "1px solid #444" }} labelStyle={{ color: "#ddd" }} itemStyle={{ color: "#ddd" }} />
              <Line type="monotone" dataKey="weight" dot={false} stroke="#ffffff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

function CustomTagAdder({ onAdd }){
  const [val, setVal] = useState("");
  return (
    <span className="flex items-center gap-1">
      <input value={val} onChange={e=>setVal(e.target.value)} placeholder="custom tag" className="border border-neutral-700 bg-neutral-800 rounded-xl px-2 py-1" />
      <button onClick={()=>{ if(val.trim()){ onAdd(val.trim()); setVal(""); } }} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded-lg">Add</button>
    </span>
  );
}

function SessionsView({ data }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.sessions;
    return data.sessions.filter(s => s.dayName.toLowerCase().includes(q) || s.entries.some(e => e.exercise.toLowerCase().includes(q)));
  }, [query, data.sessions]);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by day or exercise" className="border border-neutral-700 bg-neutral-800 rounded-xl px-3 py-2 w-full md:w-80" />
        <div className="text-sm text-neutral-400">Total sessions: {data.sessions.length}</div>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && <div className="text-neutral-500">No sessions yet</div>}
        {filtered.map(s => (
          <div key={s.id} className="border border-neutral-800 rounded-2xl p-3 bg-neutral-900">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="font-semibold">{s.dateISO} · {s.dayName}</div>
              <div className="text-sm text-neutral-400">Volume {s.volume} {s.units}·reps</div>
            </div>
            <div className="mt-2 grid gap-2">
              {s.entries.map((e, i) => (
                <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-2">
                  <div className="font-medium">{e.exercise}</div>
                  <div className="text-sm text-neutral-300">Sets: {e.sets.map((t, j) => `${t.w}${s.units}x${t.r}${t.rpe ? ` RPE ${t.rpe}`: ""}${t.fail ? " fail" : ""}`).join(", ")}</div>
                  {e.sets.some(t => t.note) ? (
                    <div className="text-xs text-neutral-400 mt-1">Notes: {e.sets.filter(t => t.note).map(t => t.note).join(" | ")}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
