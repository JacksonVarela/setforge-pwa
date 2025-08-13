import React, { useEffect, useRef, useState } from "react";
import { aiCoachChat } from "../utils/ai";

// Props:
// - visible (bool)
// - onClose()
// - onCommand(cmdObj)  // optional: let coach adjust app state (e.g., add exercise)
// - online (bool)
export default function CoachChat({ visible, onClose, onCommand, online = true }) {
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Hey! I’m SetForge Coach. Ask me about hypertrophy, technique, diet, or how to use the app." }
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [msgs, busy, visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70">
      <div className="absolute inset-0 bg-neutral-900 anime-overlay">
        <div className="coach-sticker" />
        <div className="max-w-screen-sm mx-auto h-full flex flex-col gap-2 p-3">
          <header className="flex items-center justify-between mt-2">
            <h2 className="text-lg font-semibold">SetForge Coach</h2>
            <button onClick={onClose} className="btn">Close</button>
          </header>

          {!online && (
            <div className="pill">Offline — Coach requires internet</div>
          )}

          <div ref={scroller} className="flex-1 overflow-y-auto rounded-xl border border-neutral-800 p-2 bg-neutral-950/60">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right mb-2" : "text-left mb-2"}>
                <div className={`inline-block px-3 py-2 rounded-xl ${m.role === "user" ? "bg-white text-neutral-900" : "bg-neutral-800 text-neutral-100 border border-neutral-700"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="text-left">
                <div className="inline-block px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700">
                  <span className="inline-flex gap-1 items-center">
                    <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce"></span>
                    <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:120ms]"></span>
                    <span className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:240ms]"></span>
                  </span>
                </div>
              </div>
            )}
          </div>

          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim() || !online || busy) return;
              const newMsgs = [...msgs, { role: "user", content: text.trim() }];
              setMsgs(newMsgs);
              setText("");
              setBusy(true);
              try {
                const { reply, command } = await aiCoachChat(newMsgs);
                if (command && onCommand) onCommand(command);
                setMsgs([...newMsgs, { role: "assistant", content: reply }]);
              } catch (err) {
                setMsgs([...newMsgs, { role: "assistant", content: "Sorry—something went wrong." }]);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              className="input flex-1"
              placeholder="Ask about hypertrophy, diet, or how to use SetForge…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn-primary">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
