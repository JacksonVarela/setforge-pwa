// src/components/ImporterAI.jsx
import React, { useState } from "react";
import { aiParseSplit } from "../utils/ai";

export default function ImporterAI({ onConfirm, onCancel }) {
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState("paste");
  const [name, setName] = useState("Imported Split");
  const [days, setDays] = useState([]);

  async function runParse() {
    if (!raw.trim()) return;
    try {
      const out = await aiParseSplit(raw);
      const parsedDays = (out.days || []).map((d) => ({
        id: crypto.randomUUID(),
        name: d.name || "DAY",
        // items already filtered to exercises by API; still defensive:
        items: (d.items || d.exercises || []).map((x) => ({
          type: "exercise",
          name: x.name || "",
          sets: Number(x.sets || 3),
          low: Number(x.low || 8),
          high: Number(x.high || x.low || 12),
          superset: (typeof x.superset === "number") ? x.superset : null,
        })),
      }));
      setDays(parsedDays);
      setPhase("review");
    } catch {
      alert("Could not parse. Paste plain text or try again.");
    }
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.toLowerCase();
    if (!/(\.txt|\.md|\.csv|\.json)$/.test(ext)) {
      alert("Please upload .txt, .md, .csv, or .json. (For DOCX/PDF: paste text.)");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => setRaw(String(ev.target?.result || ""));
    reader.readAsText(f);
  }

  if (phase === "paste") {
    return (
      <section className="rounded-2xl border border-neutral-800 p-4 anime-overlay bg-import">
        <div className="max-w-screen-sm mx-auto">
          <h2 className="font-semibold">Import your split</h2>
          <p className="text-sm text-neutral-400">Paste text <em>or</em> upload a file. AI will detect days, exercises and supersets.</p>
          <div className="mt-3 grid gap-2">
            <input className="input" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Split name" />
            <textarea className="input h-48" value={raw} onChange={(e)=>setRaw(e.target.value)} placeholder={`PUSH A\nIncline Barbell Press — 3 × 6–10 (SS) Cable Fly — 3 × 12–15\n...`} />
            <div className="text-xs text-neutral-400">or upload:</div>
            <input type="file" accept=".txt,.md,.csv,.json" onChange={handleFile} className="text-sm" />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={runParse}>AI Parse</button>
            <button className="btn" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </section>
    );
  }

  // review
  return (
    <section className="rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Review & fix</h3>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setPhase("paste")}>Back</button>
          <button
            className="btn-primary"
            onClick={() => {
              const clean = days.map(d => ({
                id: crypto.randomUUID(),
                name: d.name || "DAY",
                exercises: d.items.map(x => ({
                  name: x.name,
                  sets: Number(x.sets || 3),
                  low: Number(x.low || 8),
                  high: Number(x.high || 12),
                  // carry superset group into split — used at startWorkout
                  superset: (typeof x.superset === "number") ? x.superset : null,
                }))
              }));
              onConfirm({ name, days: clean });
            }}
          >
            Use this split
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {days.map((d, di) => (
          <div key={d.id} className="rounded-xl border border-neutral-800 p-3">
            <input className="input" value={d.name} onChange={(e) => {
              const next = structuredClone(days);
              next[di].name = e.target.value;
              setDays(next);
            }} />
            <div className="mt-2 grid gap-2">
              {d.items.map((it, ii) => (
                <div key={ii} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="input flex-1" value={it.name} onChange={(e)=>{
                      const next = structuredClone(days);
                      next[di].items[ii].name = e.target.value;
                      setDays(next);
                    }} placeholder="Name"/>
                    <input className="input w-20" value={it.sets} onChange={(e)=>{
                      const next = structuredClone(days);
                      next[di].items[ii].sets = e.target.value;
                      setDays(next);
                    }} placeholder="sets"/>
                    <input className="input w-20" value={it.low} onChange={(e)=>{
                      const next = structuredClone(days);
                      next[di].items[ii].low = e.target.value;
                      setDays(next);
                    }} placeholder="low"/>
                    <input className="input w-20" value={it.high} onChange={(e)=>{
                      const next = structuredClone(days);
                      next[di].items[ii].high = e.target.value;
                      setDays(next);
                    }} placeholder="high"/>
                    <input className="input w-24" value={it.superset ?? ""} onChange={(e)=>{
                      const next = structuredClone(days);
                      const v = e.target.value.trim();
                      next[di].items[ii].superset = v === "" ? null : Number(v);
                      setDays(next);
                    }} placeholder="SS grp"/>
                    <button className="btn" onClick={()=>{
                      const next = structuredClone(days);
                      next[di].items.splice(ii,1);
                      setDays(next);
                    }}>Remove</button>
                  </div>
                </div>
              ))}
              <button className="btn" onClick={()=>{
                const next = structuredClone(days);
                next[di].items.push({ name:"", sets:3, low:8, high:12, superset:null });
                setDays(next);
              }}>+ Add exercise</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
