// src/components/CoachChat.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/** LocalStorage-backed state with safe JSON parse */
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
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }, [key, val]);
  return [val, setVal];
}

const AVATAR = "/images/chatbot-avatar.webp";     // your .webp avatar
const STICKER = "/images/coach-sticker.webp";     // optional floating sticker

export default function CoachChat() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useLocalState("sf.chat", [
    {
      id: cryptoRandom(),
      role: "assistant",
      content:
        "Yo! I’m SetForge Coach. Ask me about hypertrophy programming, diet, or how to use any screen. (I can also help you reorganize a split or interpret your import.)",
      ts: Date.now(),
    },
  ]);
  const listRef = useRef(null);

  // auto-scroll on new messages
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // track online/offline
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const canSend = useMemo(() => {
    return online && !busy && input.trim().length > 0;
  }, [online, busy, input]);

  async function handleSend(text) {
    const content = (text ?? input).trim();
    if (!content) return;

    const userMsg = { id: cryptoRandom(), role: "user", content, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);

    try {
      // Try dedicated chat endpoint first (optional)
      let res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: sanitizeForAPI([...messages, userMsg]),
          appContext: {
            tabs: ["Log", "Split", "History", "Import", "Coach"],
            helpTopics: ["How to import", "How to reorder exercises", "What is failure", "Bodyweight logging"],
          },
        }),
      });

      // If route not found, give friendly fallback
      if (res.status === 404) {
        throw new Error("coach-chat endpoint missing");
      }

      const json = await res.json();
      const reply = json?.reply || json?.text || json?.message || defaultAssistant(content);
      setMessages((prev) => [
        ...prev,
        { id: cryptoRandom(), role: "assistant", content: String(reply), ts: Date.now() },
      ]);
    } catch (e) {
      console.warn("[CoachChat] fallback:", e?.message || e);
      const fallback =
        !online
          ? "I’m offline right now (no internet). Chat is disabled until you’re back online."
          : "The chat endpoint isn’t configured yet, but I’m here. Ask deployment or feature questions and I’ll guide you.";
      setMessages((prev) => [
        ...prev,
        { id: cryptoRandom(), role: "assistant", content: fallback, ts: Date.now() },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function sendQuickPrompt(p) {
    if (busy || !online) return;
    handleSend(p);
  }

  return (
    <section className="relative min-h-[70vh] rounded-2xl border border-neutral-800 p-4 bg-neutral-900">
      {/* Optional floating sticker */}
      <div className="hidden md:block coach-sticker" style={{ backgroundImage: `url(${STICKER})` }} />

      <header className="flex items-center gap-3 mb-3">
        <img
          src={AVATAR}
          alt="Coach"
          className="w-8 h-8 rounded-lg border border-neutral-700 object-cover"
          loading="eager"
        />
        <div>
          <div className="font-semibold">SetForge Coach</div>
          <div className="text-xs text-neutral-400">
            {online ? (busy ? "Thinking…" : "Online") : "Offline"}
          </div>
        </div>
      </header>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          "Help me reorder exercises",
          "Make a plan to progress bench press",
          "Explain failure vs. not to failure",
          "Suggest attachment for straight-arm pulldown",
          "How do I import a messy split?",
        ].map((q) => (
          <button key={q} className="pill hover:bg-neutral-800" onClick={() => sendQuickPrompt(q)}>
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="h-[50vh] max-h-[60vh] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-2"
      >
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} />
        ))}
        {busy && <TypingBubble />}
      </div>

      {/* Composer */}
      <div className="mt-3 flex gap-2">
        <textarea
          className="input min-h-[44px] h-[44px] max-h-[120px] flex-1 resize-y"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={online ? "Ask about training, diet, or app navigation…" : "Offline — chat disabled"}
          disabled={!online || busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) handleSend();
            }
          }}
        />
        <button
          className={`btn ${canSend ? "btn-primary" : "btn-ghost opacity-60"}`}
          onClick={() => handleSend()}
          disabled={!canSend}
        >
          Send
        </button>
      </div>

      <p className="text-[10px] text-neutral-500 mt-2">
        Evidence-based hypertrophy focus. This chat can also guide you through SetForge (“how to move an exercise”, etc.).
      </p>
    </section>
  );
}

/** Chat bubble */
function Bubble({ role, content }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap leading-relaxed rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? "bg-white text-neutral-900"
            : "bg-neutral-800/70 text-neutral-100 border border-neutral-700"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

/** Typing indicator */
function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl px-3 py-2 text-sm bg-neutral-800/70 text-neutral-200 border border-neutral-700">
        <span className="inline-flex items-center gap-1">
          Thinking
          <span className="inline-flex w-6 justify-between">
            <Dot /><Dot delay="150ms" /><Dot delay="300ms" />
          </span>
        </span>
      </div>
    </div>
  );
}
function Dot({ delay = "0ms" }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-300 animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}

/** Helpers */
function cryptoRandom() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function sanitizeForAPI(msgs) {
  return msgs.map(({ role, content }) => ({ role, content }));
}
function defaultAssistant(userContent) {
  if (/reorder|move/i.test(userContent)) {
    return "To reorder exercises: go to Split → your day → drag the handle to move an exercise. Want me to suggest an order for push/pull/legs?";
  }
  if (/import/i.test(userContent)) {
    return "Paste your split under Import → AI Parse. On the review screen, toggle ‘Heading’ vs ‘Exercise’, then ‘Use this split’.";
  }
  if (/failure/i.test(userContent)) {
    return "Training to failure ramps stimulus but also fatigue. Use it on the last set of isolation lifts; keep 1–2 reps in reserve on compounds. I’ll weight ‘failure’ sets higher in your next-load suggestions.";
  }
  return "Ask me about hypertrophy programming, diet basics, or how to use any screen. I can also help clean up a messy split import.";
}
