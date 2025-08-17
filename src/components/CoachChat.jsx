// src/components/CoachChat.jsx
import React, { useEffect, useRef, useState } from "react";
import { coachChatSend } from "../utils/ai";

const BOT_NAME = "Akai Ronin"; // red/black anime vibe

function useLocalState(key, init) {
  const [v, setV] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? init; }
    catch { return init; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(v)); }, [key, v]);
  return [v, setV];
}

export default function CoachChat({ units = "lb", day = "" }) {
  const [messages, setMessages] = useLocalState("sf.chat", [
    { role: "assistant", content: `Yo! I'm ${BOT_NAME}. Ask me about hypertrophy programming, diet, or how to use any screen. (I can also help you reorganize a split or interpret your import.)` }
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setTyping(true);

    try {
      const reply = await coachChatSend(next, { units, day });
      setMessages(m => [...m, { role: "assistant", content: reply || "…" }]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", content: "Hmm, I couldn’t reach my endpoint. Double-check /api/coach-chat and your OPENAI_API_KEY in Vercel Project → Settings → Environment Variables." }]);
    } finally {
      setTyping(false);
    }
  }

  function quick(q) {
    setInput(q);
  }

  return (
    <section className="relative rounded-2xl border border-neutral-800 p-4">
      <div className="flex items-center gap-3 mb-3">
        <img src="/images/chat-coach.webp" alt="" className="w-8 h-8 rounded-full object-cover" />
        <div>
          <div className="font-semibold">{BOT_NAME}</div>
          <div className="text-xs text-neutral-400">Online</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button className="pill cursor-pointer" onClick={() => quick("Help me reorder exercises")}>Help me reorder exercises</button>
        <button className="pill cursor-pointer" onClick={() => quick("Explain failure vs. not to failure")}>Explain failure vs. not to failure</button>
        <button className="pill cursor-pointer" onClick={() => quick("Suggest attachment for straight-arm pulldown")}>Suggest attachment for straight-arm pulldown</button>
        <button className="pill cursor-pointer" onClick={() => quick("How do I import a messy split?")}>How do I import a messy split?</button>
      </div>

      <div className="h-[52vh] overflow-auto rounded-xl bg-neutral-950/60 border border-neutral-800 p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[78%] ${m.role === "user" ? "bg-white text-black" : "glass"} rounded-2xl px-3 py-2 text-sm leading-relaxed`}>
              {m.content}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="glass rounded-2xl px-3 py-2">
              <div className="typing">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          className="input flex-1"
          placeholder="Ask about training, diet, or app navigation…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <button className="btn-primary" onClick={send}>Send</button>
      </div>

      {/* coach sticker – fixed, never blocks inputs */}
      <div className="coach-sticker coach-sticker--chat" aria-hidden="true" />
      <div className="text-[11px] text-neutral-500 mt-2">
        Evidence-based hypertrophy focus. This chat can also guide you through SetForge (“how to move an exercise”, etc).
      </div>
    </section>
  );
}
