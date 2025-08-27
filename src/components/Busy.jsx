// src/components/Busy.jsx
import React from "react";
export default function Busy({ text="Working…" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
      {text}
    </span>
  );
}
