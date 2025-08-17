// src/components/CoachChat.jsx
import React, { useEffect, useRef, useState } from "react";

function useLocalState(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key, v]);
  return [v, setV];
}

const SUGGESTIONS = [
  "Explain failure vs. not to failure",
  "Help me reorder exercises",
  "Make a plan to progress bench press",
  "Suggest attachment for straight-arm pulldown",
  "How do I import a messy split?"
];

export default function CoachChat({ units = "lb" }) {
  const [messages, setMessages] = useLocalState("sf.chat", [
    {
      role: "assistant",
      content:
        "Yo! I’m **Kurogane**, SetForge Coach. Ask me about hypertrophy programming, diet, or how to use any screen. I can also help you reorganize a split or interpret your import."
    }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ask(text) {
    if (!text.trim()) return;
    const next = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const r = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-10), units })
      });
      const j = await r.json();
      const reply = j?.reply?.trim?.() || "I had trouble answering—try again in a bit.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "API not reachable. Check OPENAI_API_KEY in Vercel." }
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="relative">
      {/* header */}
      <div className="flex items-center gap-3 mb-3">
        <img
          src="/images/chat-coach.webp"
          alt="Kurogane"
          className="w-9 h-9 rounded-full object-cover border border-neutral-700"
        />
        <div>
          <div className="font-semibold leading-tight">Kurogane • SetForge Coach</div>
          <div className="text-xs text-neutral-400">
            Evidence-based hypertrophy, concise answers. Units: {units}
          </div>
        </div>
      </div>

      {/* quick suggestions */}
      <div className="flex flex-wrap gap-2 mb-3">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="pill hover:brightness-110" onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>

      {/* messages */}
      <div
        className="glass-strong p-3 rounded-2xl min-h-[42svh] max-h-[60svh] overflow-y-auto pb-28"
        ref={listRef}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`my-2 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] whitespace-pre-wrap leading-relaxed rounded-2xl px-3 py-2 border ${
                m.role === "user"
                  ? "bg-white text-black border-white"
                  : "bg-neutral-900 border-neutral-800"
              }`}
              dangerouslySetInnerHTML={{ __html: mdInline(m.content) }}
            />
          </div>
        ))}

        {/* thinking bubbles while pending */}
        {busy && (
          <div className="my-2 flex justify-start">
            <div className="bubble-dots border border-neutral-800 bg-neutral-900 px-3 py-2 rounded-2xl" />
          </div>
        )}
      </div>

      {/* input */}
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about training, diet, or app navigation…"
          className="input flex-1"
        />
        <button className="btn-primary disabled:opacity-60" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>

      {/* decorative sticker (never blocks) */}
      <div className="coach-sticker coach-sticker--chat" aria-hidden />
    </section>
  );
}

/** tiny MD inline -> HTML */
function mdInline(s = "") {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
