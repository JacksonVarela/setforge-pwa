import React, { useState } from "react";
import { aiParseSplit, aiExerciseInfo } from "../utils/ai";

export default function ImporterAI({ onConfirm, onCancel }) {
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState("paste"); // paste | review
  const [name, setName] = useState("Imported Split");
  const [days, setDays] = useState([]); // [{id,name,items:[{type:'heading'|'exercise',...}]}]

  async function runParse() {
    if (!raw.trim()) return;
    try {
      const out = await aiParseSplit(raw);
      const parsedDays = (out.days || []).map((d) => ({
        id: crypto.randomUUID(),
        name: d.name || "DAY",
        items: (d.items || d.exercises || []).map(x => ({
          type: x.type || "exercise",
          name: x.name || "",
          sets: Number(x.sets ?? 3),
          low: (x.low === "failure" ? "failure" : Number(x.low ?? 8)),
          high: (x.high === "failure" ? "failure" : Number(x.high ?? x.low ?? 12)),
          equip: x.equip || "",
          group: x.group || "",
          isCompound: !!x.isCompound,
          attachments: x.attachments || []
        }))
      }));
      setDays(parsedDays);
      setPhase("review");
    } catch {
      alert("Could not parse. Paste plain text or try again.");
    }
  }

  async function enrichRow(dayIdx, itemIdx) {
    const it = days[dayIdx].items[itemIdx];
    if (!it || it.type !== "exercise" || !it.name) return;
    try {
      const info = await aiExerciseInfo(it.name);
      const next = structuredClone(days);
      const row = next[dayIdx].items[itemIdx];
      row.equip = row.equip || info.equip || "machine";
      row.group = row.group || info.group || "upper";
      row.isCompound = (row.isCompound ?? info.isCompound) ?? false;
      row.attachments = row.attachments?.length ? row.attachments : (info.attachments || []);
      setDays(next);
    } catch {}
  }

  if (phase === "paste") {
    return (
      <section className="rounded-2xl border border-neutral-800 p-4 anime-overlay bg-import">
        <div className="max-w-screen-sm mx-auto">
          <h2 className="font-semibold">Paste / Import your split</h2>
          <p className="text-sm text-neutral-400">Free-form text is fine. AI will detect days & exercises.</p>
          <input className="input mt-2" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Split name" />
          <textarea className="input mt-2 h-48" value={raw} onChange={(e)=>setRaw(e.target.value)} placeholder={`PUSH A\nIncline Barbell Press — 3 × 6–10\n...`} />
          <div className="mt-2 flex gap-2">
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
                exercises: d.items
                  .filter(x => x.type !== "heading")
                  .map(x => ({
                    name: x.name,
                    sets: Number(x.sets || 3),
                    low: x.low,
                    high: x.high,
                    equip: x.equip || "machine",
                    cat: x.isCompound ? "compound" : "isolation",
                    group: x.group || "upper",
                    attachments: x.attachments || []
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
            <div className="flex items-center gap-2">
              <input className="input" value={d.name} onChange={(e) => {
                const next = structuredClone(days);
                next[di].name = e.target.value;
                setDays(next);
              }} />
            </div>
            <div className="mt-2 grid gap-2">
              {d.items.map((it, ii) => (
                <div key={ii} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="input w-auto"
                      value={it.type}
                      onChange={(e)=>{
                        const next = structuredClone(days);
                        next[di].items[ii].type = e.target.value;
                        setDays(next);
                      }}
                    >
                      <option value="exercise">Exercise</option>
                      <option value="heading">Heading</option>
                    </select>

                    <input className="input flex-1" value={it.name} onChange={(e)=>{
                      const next = structuredClone(days);
                      next[di].items[ii].name = e.target.value;
                      setDays(next);
                    }} placeholder="Name"/>

                    {it.type === "exercise" && (
                      <>
                        <input className="input w-20" value={it.sets} onChange={(e)=>{
                          const next = structuredClone(days);
                          next[di].items[ii].sets = e.target.value;
                          setDays(next);
                        }} placeholder="sets"/>

                        <input className="input w-24" value={it.low} onChange={(e)=>{
                          const next = structuredClone(days);
                          next[di].items[ii].low = e.target.value;
                          setDays(next);
                        }} placeholder="low"/>

                        <input className="input w-24" value={it.high} onChange={(e)=>{
                          const next = structuredClone(days);
                          next[di].items[ii].high = e.target.value;
                          setDays(next);
                        }} placeholder="high"/>

                        <select className="input w-auto" value={it.equip} onChange={(e)=>{
                          const next = structuredClone(days);
                          next[di].items[ii].equip = e.target.value;
                          setDays(next);
                        }}>
                          <option value="">equip…</option>
                          <option>barbell</option><option>dumbbell</option><option>machine</option><option>cable</option><option>smith</option><option>bodyweight</option>
                        </select>

                        <select className="input w-auto" value={it.group} onChange={(e)=>{
                          const next = structuredClone(days);
                          next[di].items[ii].group = e.target.value;
                          setDays(next);
                        }}>
                          <option value="">group…</option>
                          <option>upper</option><option>lower</option><option>push</option><option>pull</option><option>legs</option><option>core</option><option>neck</option><option>forearms</option>
                        </select>

                        <select className="input w-auto" value={it.isCompound ? "compound" : "isolation"} onChange={(e)=>{
                          const next = structuredClone(days);
                          next[di].items[ii].isCompound = e.target.value === "compound";
                          setDays(next);
                        }}>
                          <option value="isolation">isolation</option>
                          <option value="compound">compound</option>
                        </select>

                        <button className="btn" onClick={() => enrichRow(di, ii)}>AI fill</button>
                      </>
                    )}

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
                next[di].items.push({ type:"exercise", name:"", sets:3, low:8, high:12, equip:"machine", group:"upper", isCompound:false, attachments:[] });
                setDays(next);
              }}>+ Add item</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
