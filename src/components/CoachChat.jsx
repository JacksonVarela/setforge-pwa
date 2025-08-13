import React, { useEffect, useRef, useState } from "react";

export default function CoachChat() {
  const [messages, setMessages] = useState([
    { role:"assistant", content:"Hey! I’m SetForge Coach. Ask me about hypertrophy, progression, diet basics, or how to use the app." }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    if (!input.trim() || busy) return;
    const next = [...messages, { role:"user", content: input.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/coach-chat", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ messages: next, appState: {} })
      });
      const j = await r.json();
      const text = j?.text || "…";
      setMessages(n => [...n, { role:"assistant", content:text }]);
    } catch {
      setMessages(n => [...n, { role:"assistant", content:"(offline or error — try again later)" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fullscreen anime-overlay bg-neutral-950/20 relative">
      <div className="absolute inset-0 bg-[url('/images/bg-anime-import.png')] bg-cover bg-center opacity-40" />
      <div className="coach-sticker" style={{ backgroundImage:"url('/images/chat-coach.png')" }} />
      <div className="relative max-w-2xl mx-auto px-4 safe-pt safe-pb">
        <h1 className="text-2xl font-semibold mb-3">Coach</h1>

        <div ref={scroller} className="h-[60vh] overflow-y-auto rounded-xl border border-neutral-800 p-3 bg-black/40">
          {messages.map((m,i)=>(
            <div key={i} className={`mb-3 ${m.role==="user"?"text-right":""}`}>
              <div className={`inline-block px-3 py-2 rounded-xl ${m.role==="user"?"bg-neutral-800":"bg-neutral-900 border border-neutral-800"}`}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
              </div>
            </div>
          ))}
          {busy && <div className="text-neutral-400 text-sm">Coach is thinking…</div>}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Ask about progression, a lift cue, or app navigation…"
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") send(); }}
          />
          <button className="btn-primary" onClick={send} disabled={busy}>Send</button>
        </div>
      </div>
    </div>
  );
}
