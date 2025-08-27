// src/components/ImporterAI.jsx
import React, { useState } from "react";
import { aiParseSplit, aiExerciseInfo } from "../utils/ai";
import Busy from "./Busy";

export default function ImporterAI({ onConfirm, onCancel }) {
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState("paste"); // paste | review
  const [name, setName] = useState("Imported Split");
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function runParse() {
    if (!raw.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const out = await aiParseSplit(raw);
      const parsed = (out.days || []).map((d) => ({
        id: crypto.randomUUID(),
        name: d.name || "DAY",
        items: (d.items || d.exercises || []).map(x => {
          if (x.type === "superset") {
            return {
              type: "superset",
              name: x.name || "Superset",
              rounds: Number(x.rounds || x.sets || 3),
              items: (x.items || []).map(s => ({
                name: s.name || "",
                low: s.low === "failure" || s.high === "failure" ? "failure" : Number(s.low || 8),
                high: s.low === "failure" || s.high === "failure" ? "failure" : Number(s.high || s.low || 12),
                equip: s.equip || "",
                group: s.group || "",
                cat: s.isCompound ? "compound":"isolation"
              }))
            };
          }
          return {
            type: "exercise",
            name: x.name || "",
            sets: Number(x.sets || 3),
            low: x.low === "failure" || x.high === "failure" ? "failure" : Number(x.low || 8),
            high: x.low === "failure" || x.high === "failure" ? "failure" : Number(x.high || x.low || 12),
            equip: x.equip || "",
            group: x.group || "",
            cat: x.isCompound ? "compound":"isolation"
          };
        })
      }));
      setDays(parsed);
      setPhase("review");
    } catch (e) {
      setErr("Could not parse. Paste plain text or try again.");
    } finally {
      setBusy(false);
    }
  }

  async function enrichRow(dayIdx, itemIdx, subIdx=null) {
    const target = subIdx==null ? days[dayIdx].items[itemIdx] : days[dayIdx].items[itemIdx].items[subIdx];
    if (!target?.name) return;
    try {
      const info = await aiExerciseInfo(target.name);
      const next = structuredClone(days);
      const row = subIdx==null ? next[dayIdx].items[itemIdx] : next[dayIdx].items[itemIdx].items[subIdx];
      row.equip = row.equip || info.equip || "machine";
      row.group = row.group || info.group || "upper";
      row.cat = row.cat || (info.isCompound ? "compound":"isolation");
      setDays(next);
    } catch {}
  }

  function toSplitPayload() {
    const cleanDays = days.map(d => ({
      id: crypto.randomUUID(),
      name: d.name || "DAY",
      exercises: d.items.map(it => {
        if (it.type === "superset") {
          return {
            type: "superset",
            name: it.name || "Superset",
            rounds: Number(it.rounds || 3),
            items: (it.items || []).map(s => ({
              name: s.name,
              sets: Number(it.rounds || 3),
              low: s.low === "failure" ? "failure" : Number(s.low || 8),
              high: s.high === "failure" ? "failure" : Number(s.high || 12),
              equip: s.equip || "machine",
              cat: s.cat || "isolation",
              group: s.group || "upper",
            }))
          };
        }
        return {
          type: "exercise",
          name: it.name,
          sets: Number(it.sets || 3),
          low: it.low === "failure" ? "failure" : Number(it.low || 8),
          high: it.high === "failure" ? "failure" : Number(it.high || 12),
          equip: it.equip || "machine",
          cat: it.cat || "isolation",
          group: it.group || "upper"
        };
      })
    }));
    return { name, days: cleanDays };
  }

  if (phase === "paste") {
    return (
      <section className="rounded-2xl border border-neutral-800 p-4 anime-overlay bg-import max-h-[80vh] overflow-y-auto">
        <div className="max-w-screen-sm mx-auto">
          <h2 className="font-semibold">Import your split</h2>
          <p className="text-sm text-neutral-400">Paste text <em>or</em> upload a file. AI understands supersets.</p>
          <div className="mt-3 grid gap-2">
            <input className="input" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Split name" />
            <textarea className="input h-48" value={raw} onChange={(e)=>setRaw(e.target.value)} placeholder={`Superset: Calf Raise + Tibialis Raise — 3 × 12–15\n...`} />
            {!!err && <pre className="text-xs text-red-400 whitespace-pre-wrap">{err}</pre>}
            <div className="text-xs text-neutral-400">or upload:</div>
            <input type="file" accept=".txt,.md,.csv,.json" onChange={(e)=>{
              const f=e.target.files?.[0]; if(!f) return;
              const reader=new FileReader(); reader.onload=ev=>setRaw(String(ev.target?.result||"")); reader.readAsText(f);
            }} className="text-sm" />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={runParse} disabled={busy}>
              {busy ? <Busy text="Parsing…" /> : "AI Parse"}
            </button>
            <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-800 p-4 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Review & fix</h3>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setPhase("paste")}>Back</button>
          <button className="btn-primary" onClick={() => onConfirm(toSplitPayload())}>Use this split</button>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {days.map((d, di) => (
          <div key={d.id} className="rounded-xl border border-neutral-800 p-3">
            <input className="input" value={d.name} onChange={(e)=> {
              const next=structuredClone(days); next[di].name=e.target.value; setDays(next);
            }} />
            <div className="mt-2 grid gap-2">
              {d.items.map((it, ii) => (
                <div key={ii} className="rounded-lg bg-neutral-900 border border-neutral-800 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="input w-auto" value={it.type} onChange={(e)=>{
                      const next=structuredClone(days); next[di].items[ii].type=e.target.value; setDays(next);
                    }}>
                      <option value="exercise">Exercise</option>
                      <option value="superset">Superset</option>
                      <option value="heading">Heading</option>
                    </select>
                    {it.type!=="superset" ? (
                      <>
                        <input className="input flex-1" value={it.name} onChange={(e)=>{
                          const next=structuredClone(days); next[di].items[ii].name=e.target.value; setDays(next);
                        }} placeholder="Name"/>
                        {it.type==="exercise" && (
                          <>
                            <input className="input w-20" value={it.sets} onChange={(e)=>{
                              const n=structuredClone(days); n[di].items[ii].sets=e.target.value; setDays(n);
                            }} placeholder="sets"/>
                            <input className="input w-20" value={it.low} onChange={(e)=>{
                              const n=structuredClone(days); n[di].items[ii].low=e.target.value; setDays(n);
                            }} placeholder="low"/>
                            <input className="input w-20" value={it.high} onChange={(e)=>{
                              const n=structuredClone(days); n[di].items[ii].high=e.target.value; setDays(n);
                            }} placeholder="high"/>
                            <button className="btn" onClick={()=>enrichRow(di, ii)}>AI fill</button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <input className="input flex-1" value={it.name} onChange={(e)=>{
                          const n=structuredClone(days); n[di].items[ii].name=e.target.value; setDays(n);
                        }} placeholder="Superset name"/>
                        <input className="input w-24" value={it.rounds} onChange={(e)=>{
                          const n=structuredClone(days); n[di].items[ii].rounds=e.target.value; setDays(n);
                        }} placeholder="rounds"/>
                        <button className="btn" onClick={()=>{
                          const n=structuredClone(days); n[di].items[ii].items ||= [];
                          n[di].items[ii].items.push({ name:"", low:12, high:15, equip:"", group:"" });
                          setDays(n);
                        }}>+ Add sub</button>
                      </>
                    )}
                    <button className="btn" onClick={()=>{
                      const n=structuredClone(days); n[di].items.splice(ii,1); setDays(n);
                    }}>Remove</button>
                  </div>

                  {it.type==="superset" && (
                    <div className="mt-2 grid gap-2">
                      {(it.items||[]).map((s, si)=>(
                        <div key={si} className="rounded-md border border-neutral-800 p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="pill">{si===0?"A":"B"}</span>
                            <input className="input flex-1" value={s.name} onChange={(e)=>{
                              const n=structuredClone(days); n[di].items[ii].items[si].name=e.target.value; setDays(n);
                            }} placeholder="Sub exercise"/>
                            <input className="input w-20" value={s.low} onChange={(e)=>{
                              const n=structuredClone(days); n[di].items[ii].items[si].low=e.target.value; setDays(n);
                            }} placeholder="low"/>
                            <input className="input w-20" value={s.high} onChange={(e)=>{
                              const n=structuredClone(days); n[di].items[ii].items[si].high=e.target.value; setDays(n);
                            }} placeholder="high"/>
                            <button className="btn" onClick={()=>enrichRow(di, ii, si)}>AI fill</button>
                            <button className="btn" onClick={()=>{
                              const n=structuredClone(days); n[di].items[ii].items.splice(si,1); setDays(n);
                            }}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={()=>{
                  const n=structuredClone(days);
                  n[di].items.push({ type:"exercise", name:"", sets:3, low:8, high:12, equip:"", group:"" });
                  setDays(n);
                }}>+ Add exercise</button>
                <button className="btn" onClick={()=>{
                  const n=structuredClone(days);
                  n[di].items.push({ type:"superset", name:"Superset", rounds:3, items:[
                    { name:"", low:12, high:15, equip:"", group:"" },
                    { name:"", low:12, high:15, equip:"", group:"" }
                  ]});
                  setDays(n);
                }}>+ Add superset</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
