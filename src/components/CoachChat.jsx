import React, { useEffect, useRef, useState } from "react";
import { coachChatSend } from "../utils/ai";

// Tiny localStorage hook so chat persists
function useLocalState(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

export default function CoachChat({ units = "lb" }) {
  const [messages, setMessages] = useLocalState("sf.chat", [
    { role: "assistant", text: "Yo. I’m Ronin, your hypertrophy coach. Ask me anything about training, programming, or nutrition." }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const nextHistory = [...messages, { role: "user", text }];
    setInput("");
    setMessages(nextHistory);
    setBusy(true);
    try {
      const reply = await coachChatSend(nextHistory, { units });
      setMessages(h => [...h, { role: "assistant", text: reply || "(no reply)" }]);
    } catch {
      setMessages(h => [...h, { role: "assistant", text: "I could not reach my brain. Check API keys and logs." }]);
    } finally {
      setBusy(false);
    }
  }

  function askQuick(q) {
    setInput(q);
    setTimeout(send, 0);
  }

  return (
    <section className="rounded-2xl border border-neutral-800 p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900">
        <div className="flex items-center gap-2">
          <img src="/images/coach-sticker.webp" alt="Ronin" className="w-8 h-8 rounded-full object-contain" />
          <div className="leading-tight">
            <div className="font-semibold">Ronin</div>
            <div className="text-[11px] text-neutral-400">Evidence based hypertrophy coach</div>
          </div>
        </div>
        <div className="hidden sm:flex gap-2">
          <button className="pill cursor-pointer" onClick={() => askQuick("Give me a 4 day UL split focused on chest and hamstrings.")}>4 day UL focus</button>
          <button className="pill cursor-pointer" onClick={() => askQuick("How should I progress dumbbell bench if I hit failure at 12 reps?")}>Progression tip</button>
          <button className="pill cursor-pointer" onClick={() => askQuick("Give me three cues to improve my barbell row for lats.")}>Form cues</button>
        </div>
      </div>

      <div ref={scrollerRef} className="h-[60vh] overflow-y-auto px-3 py-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={"max-w-[85%] px-3 py-2 rounded-xl border " + (m.role === "user"
                ? "bg-white text-neutral-900 border-white"
                : "bg-neutral-900 text-neutral-100 border-neutral-800")}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-neutral-600 rounded-full animate-bounce" />
              <span className="inline-block w-2 h-2 bg-neutral-600 rounded-full animate-bounce [animation-delay:120ms]" />
              <span className="inline-block w-2 h-2 bg-neutral-600 rounded-full animate-bounce [animation-delay:240ms]" />
            </div>
            Ronin is thinking…
          </div>
        )}
      </div>

      <div className="p-3 border-t border-neutral-800 bg-neutral-900">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="input flex-1"
            placeholder="Ask Ronin about training, programming, or diet…"
          />
          <button onClick={send} disabled={busy} className="btn-primary">{busy ? "…" : "Send"}</button>
        </div>
      </div>
    </section>
  );
}
