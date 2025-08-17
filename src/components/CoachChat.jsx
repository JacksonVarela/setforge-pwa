// src/components/CoachChat.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/** localStorage helper */
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

/** online status */
function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
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
  return online;
}

/** message bubble */
function Bubble({ role, content }) {
  const isAssistant = role === "assistant";
  return (
    <div className={`flex items-end gap-2 ${isAssistant ? "justify-start" : "justify-end"}`}>
      {isAssistant && (
        <img
          src="/images/chat-coach.webp"
          alt="Coach"
          className="w-9 h-9 rounded-full border border-neutral-700 object-cover"
        />
      )}
      <div
        className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isAssistant
            ? "bg-neutral-900 border border-neutral-800"
            : "bg-white text-black"
        }`}
      >
        {content}
      </div>
      {!isAssistant && (
        <div className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs text-neutral-300">
          You
        </div>
      )}
    </div>
  );
}

/** typing indicator */
function Typing() {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/images/chat-coach.webp"
        alt="Coach"
        className="w-9 h-9 rounded-full border border-neutral-700 object-cover"
      />
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl px-3 py-2 text-sm">
        <span className="inline-block animate-pulse">typing…</span>
      </div>
    </div>
  );
}

export default function CoachChat() {
  const online = useOnline();
  const [messages, setMessages] = useLocalState("sf.chat", [
    {
