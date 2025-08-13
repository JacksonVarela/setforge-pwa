// src/TagModal.jsx
import React, { useEffect, useState } from "react";

export default function TagModal({ open, onClose, onSave, preset = [], initial = [] }) {
  const [sel, setSel] = useState(new Set(initial));
  const [custom, setCustom] = useState("");

  useEffect(() => {
    setSel(new Set(initial));
  }, [initial, open]);

  if (!open) return null;

  const toggle = (t) => {
    const next = new Set(sel);
    next.has(t) ? next.delete(t) : next.add(t);
    setSel(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-700 p-4">
        <div className="text-sm font-semibold mb-2">Tags</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {preset.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={`px-2 py-1 rounded-lg border text-xs ${
                sel.has(t) ? "bg-white text-neutral-900 border-white" : "bg-neutral-800 border-neutral-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Add custom tag"
            className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm"
          />
          <button
            onClick={() => {
              const t = custom.trim();
              if (!t) return;
              setSel(new Set([...sel, t]));
              setCustom("");
            }}
            className="px-3 py-2 rounded-lg bg-white text-neutral-900 text-sm"
          >
            Add
          </button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm">
            Cancel
          </button>
          <button
            onClick={() => onSave(Array.from(sel))}
            className="px-3 py-2 rounded-lg bg-white text-neutral-900 text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
