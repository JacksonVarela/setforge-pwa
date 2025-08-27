// src/components/PlateMath.jsx
import React, { useMemo } from "react";

function computePlates(total, units="lb", bar= (units==="kg"?20:45)) {
  const sizes = units==="kg" ? [25,20,15,10,5,2.5,1.25] : [45,35,25,10,5,2.5,1.25];
  const perSide = (Number(total||0) - bar) / 2;
  if (perSide <= 0) return { perSide: 0, stacks: [] };
  let rem = perSide;
  const out = [];
  for (const s of sizes) {
    let c = 0;
    while (rem + 1e-6 >= s) { rem -= s; c++; }
    if (c) out.push({ size: s, count: c });
  }
  return { perSide, stacks: out };
}

export default function PlateMath({ weight, units="lb", onClose }) {
  const { perSide, stacks } = useMemo(()=>computePlates(weight, units), [weight, units]);
  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center p-3 z-50">
      <div className="w-full max-w-sm bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Plates for {weight || 0}{units}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="mt-3 text-sm">
          <div className="text-neutral-300">Bar assumed {units==="kg" ? "20kg" : "45lb"}.</div>
          <div className="mt-2">Per side: <span className="font-semibold">{Math.max(0, perSide).toFixed(1)}{units}</span></div>
          {!stacks.length ? (
            <div className="mt-2 text-neutral-400">No plates needed.</div>
          ) : (
            <ul className="mt-2 grid gap-1">
              {stacks.map((x,i)=>(
                <li key={i} className="rounded-lg border border-neutral-800 p-2 flex justify-between">
                  <span>{x.size}{units}</span>
                  <span>× {x.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
