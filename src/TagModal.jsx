import React, { useState } from "react";

export default function TagModal({ open, onClose, preset = [], value = [], onSave }) {
  const [sel, setSel] = useState(new Set(value));
  const [custom, setCustom] = useState("");

  if (!open) return null;
  const toggle = (t) => { const s = new Set(sel); s.has(t) ? s.delete(t) : s.add(t); setSel(s); };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-[90%] max-w-md rounded-2xl bg-neutral-900 border border-neutral-700 p-4">
        <div className="font-semibold mb-2">Tags</div>
        <div className="flex flex-wrap gap-2">
          {preset.map(t => (
            <button key={t}
              onClick={() => toggle(t)}
              className={`px-2 py-1 rounded-lg border ${sel.has(t) ? "bg-white text-neutral-900 border-white" : "bg-neutral-800 border-neutral-700"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={custom} onChange={e=>setCustom(e.target.value)} placeholder="custom tag"
                 className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700"/>
          <button onClick={() => { if(custom.trim()){ toggle(custom.trim()); setCustom(""); }}} className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700">Add</button>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 text-neutral-400">Cancel</button>
          <button onClick={() => onSave(Array.from(sel))} className="px-3 py-1 rounded bg-white text-neutral-900">Save</button>
        </div>
      </div>
    </div>
  );
}
