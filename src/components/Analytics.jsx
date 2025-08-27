// src/components/Analytics.jsx
import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Helper: week key YYYY-Www
function weekKey(iso) {
  const d = new Date(iso + "T00:00:00");
  const firstThursday = new Date(d.getFullYear(),0,1);
  while (firstThursday.getDay() !== 4) firstThursday.setDate(firstThursday.getDate()+1);
  const diff = d - firstThursday;
  const week = Math.floor(diff / (7*24*3600*1000)) + 1;
  const y = d.getFullYear();
  return `${y}-W${String(week).padStart(2,"0")}`;
}

export default function Analytics({ sessions = [], split, units = "lb" }) {
  // Map exercise -> group from split for volume calc
  const exToGroup = useMemo(() => {
    const map = {};
    if (split?.days) {
      split.days.forEach(d => d.exercises.forEach(x => { map[x.name] = x.group || "other"; }));
    }
    return map;
  }, [split]);

  // Weekly set counts
  const weekly = useMemo(() => {
    const bucket = {};
    sessions.forEach(s => {
      const wk = weekKey(s.date || new Date().toISOString().slice(0,10));
      bucket[wk] = bucket[wk] || 0;
      (s.entries || []).forEach(e => bucket[wk] += (e.sets || []).length);
    });
    const keys = Object.keys(bucket).sort().slice(-8);
    return keys.map(k => ({ week: k, sets: bucket[k] }));
  }, [sessions]);

  // Recent PRs (max weight per exercise)
  const prs = useMemo(() => {
    const best = {};
    sessions.slice().reverse().forEach(s => {
      (s.entries || []).forEach(e => {
        const maxSet = (e.sets || []).reduce((m, x) => Math.max(m, Number(x.weight)||0), 0);
        if (!best[e.name] || maxSet > best[e.name].weight) {
          best[e.name] = { exercise: e.name, weight: maxSet, date: s.date };
        }
      });
    });
    return Object.values(best).filter(x => x.weight>0).sort((a,b)=>b.weight-a.weight).slice(0,8);
  }, [sessions]);

  return (
    <section className="grid gap-4">
      <div className="rounded-2xl border border-neutral-800 p-3">
        <div className="font-semibold mb-2">Weekly sets (last 8 weeks)</div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly}>
              <XAxis dataKey="week" hide />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="sets" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 p-3">
        <div className="font-semibold mb-2">Recent PRs</div>
        {!prs.length ? (
          <div className="text-neutral-400 text-sm">No PRs yet. Log some sessions.</div>
        ) : (
          <ul className="text-sm text-neutral-300 grid gap-1">
            {prs.map((p,i)=>(
              <li key={i} className="flex justify-between">
                <span>{p.exercise}</span>
                <span className="text-neutral-400">{p.weight}{units} • {p.date}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
