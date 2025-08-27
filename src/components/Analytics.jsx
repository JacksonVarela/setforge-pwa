// src/components/Analytics.jsx
import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { aiExerciseInfo } from "../utils/ai";

function weekKey(dISO){ return dISO.slice(0,7); } // YYYY-MM

export default function Analytics({ sessions = [], split = null, units = "lb" }) {
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichCount, setEnrichCount] = useState(0);

  const vol = useMemo(() => {
    // naive: each working set = 1 "set" toward group
    const acc = {};
    for (const s of sessions) {
      const w = weekKey(s.date || "");
      acc[w] ||= {};
      for (const e of (s.entries||[])) {
        // handle single exercise entries only; supersets counted per child below
        if (e.type === "superset" && Array.isArray(e.items)) {
          for (const sub of e.items) {
            const g = (sub.group || "other").toLowerCase();
            acc[w][g] = (acc[w][g] || 0) + (sub.sets?.length || e.rounds || 0);
          }
        } else {
          const g = (e.group || "other").toLowerCase();
          acc[w][g] = (acc[w][g] || 0) + (e.sets?.length || 0);
        }
      }
    }
    // flatten
    const keys = Array.from(new Set(Object.values(acc).flatMap(x=>Object.keys(x))));
    return Object.entries(acc).map(([wk, groups]) => ({
      week: wk, ...Object.fromEntries(keys.map(k=>[k, groups[k]||0]))
    }));
  }, [sessions]);

  async function enrichGroups() {
    if (!split) return;
    setEnrichBusy(true);
    let changed = 0;
    // enrich split exercises missing group/equip
    const days = split.days?.map(d => {
      const items = d.exercises?.map(it => {
        if (it.type === "superset") {
          const sub = it.items?.map(s => ({...s}));
          return { ...it, items: sub };
        }
        return { ...it };
      });
      return { ...d, exercises: items };
    }) || [];

    for (const d of days) {
      for (const it of (d.exercises||[])) {
        if (it.type === "superset") {
          for (const sub of (it.items||[])) {
            if (!sub.group || !sub.equip) {
              const info = await aiExerciseInfo(sub.name);
              if (info.group && !sub.group) { sub.group = info.group; changed++; }
              if (info.equip && !sub.equip) { sub.equip = info.equip; changed++; }
            }
          }
        } else {
          if (!it.group || !it.equip) {
            const info = await aiExerciseInfo(it.name);
            if (info.group && !it.group) { it.group = info.group; changed++; }
            if (info.equip && !it.equip) { it.equip = info.equip; changed++; }
          }
        }
      }
    }
    setEnrichBusy(false);
    setEnrichCount(changed);
    alert(changed ? `AI filled ${changed} missing fields. Close and reopen this tab to see volume grouped more accurately.` : "Everything already looks enriched.");
  }

  // choose top 6 groups to chart
  const groups = useMemo(()=>{
    const set = new Set();
    for (const row of vol) for (const k of Object.keys(row)) if (k!=="week") set.add(k);
    return Array.from(set).slice(0,6);
  }, [vol]);

  return (
    <section className="rounded-2xl border border-neutral-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Weekly volume (sets per muscle group)</div>
        <button className="btn" onClick={enrichGroups} disabled={enrichBusy}>
          {enrichBusy ? "Enriching…" : "AI fix groups"}
        </button>
      </div>
      <div className="mt-3 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={vol}>
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip />
            {groups.map((g, i) => (
              <Bar key={g} dataKey={g} stackId="a" fill={`hsl(${(i*70)%360},70%,55%)`} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-neutral-400">
        Each working set counts as 1. Use “AI fix groups” to infer missing exercise groups for more accurate aggregation.
      </div>
    </section>
  );
}
