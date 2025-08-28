import React, { useEffect, useRef, useState } from "react";

export default function Timer({ initial = 90 }) {
  const [sec, setSec] = useState(initial);
  const [running, setRunning] = useState(false);
  const intRef = useRef(null);

  useEffect(() => () => clearInterval(intRef.current), []);

  function start(s = sec) {
    clearInterval(intRef.current);
    setSec(s);
    setRunning(true);
    intRef.current = setInterval(() => {
      setSec((v) => {
        if (v <= 1) { clearInterval(intRef.current); setRunning(false); return 0; }
        return v - 1;
      });
    }, 1000);
  }
  function stop() { clearInterval(intRef.current); setRunning(false); }
  function reset(to = initial) { stop(); setSec(to); }

  const mm = String(Math.floor(sec/60)).padStart(2,"0");
  const ss = String(sec%60).padStart(2,"0");

  return (
    <div className="flex items-center gap-2">
      <div className="font-mono text-sm">{mm}:{ss}</div>
      {!running ? (
        <button className="btn" onClick={() => start()} aria-label="Start rest">Start</button>
      ) : (
        <button className="btn" onClick={stop} aria-label="Stop rest">Stop</button>
      )}
      <button className="btn" onClick={() => reset()} aria-label="Reset rest">Reset</button>
    </div>
  );
}
