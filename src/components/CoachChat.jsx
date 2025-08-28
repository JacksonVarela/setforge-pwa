// src/components/CoachChat.jsx
import React, { useEffect, useRef, useState } from "react";
import { coachChatSend } from "../utils/ai";

// Tiny localStorage hook
function useLocalState(key, initial) {
  const [val, setVal] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

export default function CoachChat({ units = "lb", day = "" }) {
  const [messages, setMessages] = useLocalState("sf.chat", [
    { role: "assistant", text: "Yo. I’m Ronin — your hypertrophy coach. Ask me anything." }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const reply = await coachChatSend(
        [
          { role: "system", content: "You are Ronin, concise evidence-based hypertrophy coach." },
          ...messages.map(m => ({ role: m.role, content: m.text })),
          { role: "user", content: text }
        ],
        { units, day }
      );
      setMessages(m => [...m, { role: "assistant", text: String(reply || "(no reply)") }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "Couldn’t reach AI. Check API key/deploy logs." }]);
    } finally {
      setBusy(false);
    }
  }

  function askQuick(q) { setInput(q); setTimeout(send, 0); }

  return (
    <section className="rounded-2xl border border-neutral-800 p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900">
        <div className="flex items-center gap-2">
          <img src="/images/coach-sticker.webp" alt="Ronin" className="w-8 h-8 rounded-full object-contain" />
          <div className="leading-tight">
            <div className="font-semibold">Ronin</div>
            <div className="text-[11px] text-neutral-400">Evidence-based hypertrophy coach</div>
          </div>
        </div>
        <div className="hidden sm:flex gap-2">
          <button className="pill cursor-pointer" onClick={() => askQuick("Give me a 4-day UL split focused on chest and hamstrings.")}>4-day UL focus</button>
          <button className="pill cursor-pointer" onClick={() => askQuick("How should I progress dumbbell bench if I hit failure at 12 reps?")}>Progression tip</button>
          <button className="pill cursor-pointer" onClick={() => askQuick("Give me three cues to improve my barbell row for lats.")}>Form cues</button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="h-[60vh] overflow-y-auto px-3 py-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={
              "max-w-[85%] px-3 py-2 rounded-xl border " +
              (m.role === "user" ? "bg-white text-neutral-900 border-white" : "bg-neutral-900 text-neutral-100 border-neutral-800")
            }>
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span className="inline-block w-2 h-2 bg-neutral-600 rounded-full animate-bounce" />
            <span className="inline-block w-2 h-2 bg-neutral-600 rounded-full animate-bounce [animation-delay:120ms]" />
            <span className="inline-block w-2 h-2 bg-neutral-600 rounded-full animate-bounce [animation-delay:240ms]" />
            Ronin is thinking…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-neutral-800 bg-neutral-900">
        <div className="flex items-center gap-2">
          {/* 16px to prevent iOS zoom */}
          <input
            style={{ fontSize: 16 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="input flex-1"
            placeholder="Ask Ronin..."
          />
          <button onClick={send} disabled={busy} className="btn-primary">{busy ? "…" : "Send"}</button>
        </div>
      </div>
    </section>
  );
}
