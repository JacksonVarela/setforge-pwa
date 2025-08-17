// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import auth from "./auth";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut as fbSignOut,
} from "firebase/auth";

import ImporterAI from "./components/ImporterAI";
import CoachChat from "./components/CoachChat";

// ---------- Small utils ----------

function cls(...xs) {
  return xs.filter(Boolean).join(" ");
}

function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function useLocalState(key, initialValue) {
  const [val, setVal] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s != null ? JSON.parse(s) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }, [key, val]);
  return [val, setVal];
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// ---------- App ----------

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // app state (stored locally)
  const [units, setUnits] = useLocalState("sf.units", "lb"); // lb | kg
  const [activeTab, setActiveTab] = useLocalState("sf.tab", "log"); // log | split | sessions | coach
  const [split, setSplit] = useLocalState("sf.split", null); // { name, days:[{id,name,exercises:[]}] }
  const [sessions, setSessions] = useLocalState("sf.sessions", []); // [{id,date,dayName,entries,notes}]
  const [showImporter, setShowImporter] = useState(false);

  // auth wiring
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  // derived: active day selection
  const dayNames = useMemo(
    () => (split?.days || []).map((d) => d.name),
    [split]
  );
  const [activeDayIndex, setActiveDayIndex] = useLocalState("sf.dayIdx", 0);
  const activeDay =
    split?.days && split.days.length
      ? split.days[Math.max(0, Math.min(activeDayIndex, split.days.length - 1))]
      : null;

  // session-in-progress
  const [inProgress, setInProgress] = useLocalState("sf.inprogress", null);
  // shape: { id, date, dayId, dayName, entries: [ { name, sets: [{reps, weight, failure}] } ] }

  // ---------- Auth Screens ----------

  if (checking) {
    return (
      <div className="fullscreen flex items-center justify-center">
        <div className="pill">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginOrSignup={() => {}} />;
  }

  if (user && !user.emailVerified) {
    return <VerifyScreen user={user} />;
  }

  // ---------- Main App Shell ----------

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Header */}
      <header className="safe-px safe-pt py-3 flex items-center justify-between border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">SetForge</span>
          {navigator && !navigator.onLine && (
            <span className="pill">Offline</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <UnitsToggle units={units} setUnits={setUnits} />
          <button className="btn" onClick={() => fbSignOut(auth)}>
            Sign out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="safe-px py-2 border-b border-[var(--border)] flex gap-1">
        <TabButton id="log" active={activeTab} setActive={setActiveTab}>
          Log
        </TabButton>
        <TabButton id="split" active={activeTab} setActive={setActiveTab}>
          Split
        </TabButton>
        <TabButton id="sessions" active={activeTab} setActive={setActiveTab}>
          Sessions
        </TabButton>
        <TabButton id="coach" active={activeTab} setActive={setActiveTab}>
          Coach
        </TabButton>
      </nav>

      {/* Content */}
      <main className="safe-px safe-pb py-4">
        {activeTab === "split" && (
          <SplitTab
            split={split}
            setSplit={setSplit}
            onImport={() => setShowImporter(true)}
          />
        )}

        {activeTab === "log" && (
          <LogTab
            split={split}
            activeDay={activeDay}
            dayNames={dayNames}
            activeDayIndex={activeDayIndex}
            setActiveDayIndex={setActiveDayIndex}
            units={units}
            inProgress={inProgress}
            setInProgress={setInProgress}
            onSave={(session) => {
              setSessions((prev) => [session, ...prev].slice(0, 500));
              setInProgress(null);
              setActiveTab("sessions");
            }}
          />
        )}

        {activeTab === "sessions" && (
          <SessionsTab sessions={sessions} units={units} />
        )}

        {activeTab === "coach" && <CoachChat />}
      </main>

      {/* Importer modal (simple inline mount) */}
      {showImporter && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
          <div className="max-w-3xl w-full">
            <ImporterAI
              onCancel={() => setShowImporter(false)}
              onConfirm={(data) => {
                setSplit(data);
                setShowImporter(false);
                setActiveTab("log");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Pieces ----------

function TabButton({ id, active, setActive, children }) {
  const is = active === id;
  return (
    <button
      className={cls(
        "px-3 py-2 rounded-lg text-sm border",
        is ? "btn-primary" : "btn"
      )}
      onClick={() => setActive(id)}
    >
      {children}
    </button>
  );
}

function UnitsToggle({ units, setUnits }) {
  return (
    <div className="flex items-center gap-1">
      <button
        className={cls(
          "px-2 py-1 rounded-lg text-xs border",
          units === "lb" ? "btn-primary" : "btn"
        )}
        onClick={() => setUnits("lb")}
      >
        lb
      </button>
      <button
        className={cls(
          "px-2 py-1 rounded-lg text-xs border",
          units === "kg" ? "btn-primary" : "btn"
        )}
        onClick={() => setUnits("kg")}
      >
        kg
      </button>
    </div>
  );
}

// ---- Login / Verify ----

function LoginScreen() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState("");

  async function doLogin() {
    try {
      setPending(true);
      setErr("");
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally {
      setPending(false);
    }
  }

  async function doSignup() {
    try {
      setPending(true);
      setErr("");
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user);
      alert("Verification email sent. Please verify to continue.");
    } catch (e) {
      setErr(e.message || "Signup failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fullscreen bg-login anime-overlay flex items-center justify-center p-4">
      <div className="glass-strong max-w-sm w-full p-4 relative">
        <h1 className="text-xl font-semibold text-center">SetForge</h1>
        <p className="text-center text-sm text-neutral-400">
          Split-based lift tracker — offline-first
        </p>

        <div className="mt-3 grid gap-2">
          <input
            className="input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            placeholder="Password"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          {err && <div className="pill">{err}</div>}

          {mode === "login" ? (
            <button className="btn-primary" disabled={pending} onClick={doLogin}>
              {pending ? "…" : "Log in"}
            </button>
          ) : (
            <button className="btn-primary" disabled={pending} onClick={doSignup}>
              {pending ? "…" : "Create account"}
            </button>
          )}

          <button
            className="btn"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login"
              ? "Need an account? Sign up"
              : "Have an account? Log in"}
          </button>
        </div>

        {/* Decorative coach sticker on login */}
        <div className="coach-sticker" />
      </div>
    </div>
  );
}

function VerifyScreen({ user }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="fullscreen flex items-center justify-center p-4">
      <div className="glass-strong max-w-sm w-full p-4">
        <h2 className="font-semibold text-lg">Verify your email</h2>
        <p className="text-sm text-neutral-400">
          We’ve sent a verification link to <b>{user.email}</b>. Open it, then
          refresh this page.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            className="btn-primary"
            onClick={async () => {
              await sendEmailVerification(user);
              setSent(true);
            }}
          >
            Resend link
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            I verified — refresh
          </button>
          <button className="btn" onClick={() => fbSignOut(auth)}>
            Sign out
          </button>
        </div>
        {sent && <div className="pill mt-2">Sent!</div>}
      </div>
    </div>
  );
}

// ---- Split Tab ----

function SplitTab({ split, setSplit, onImport }) {
  if (!split) {
    return (
      <div className="grid gap-3">
        <h3 className="font-semibold">No split yet</h3>
        <p className="text-neutral-400 text-sm">
          Import your program and we’ll structure the days & exercises for you.
        </p>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={onImport}>
            + Import split (AI)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{split.name}</h3>
        <div className="flex gap-2">
          <button className="btn" onClick={onImport}>
            Re-import / Edit
          </button>
          <button
            className="btn"
            onClick={() => {
              if (confirm("Delete this split?")) setSplit(null);
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {split.days.map((d) => (
          <div
            key={d.id}
            className="rounded-lg border border-[var(--border)] p-3 bg-[var(--card)]"
          >
            <div className="font-medium">{d.name}</div>
            <div className="mt-1 text-sm text-neutral-400">
              {d.exercises?.length || 0} exercises
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Log Tab ----

function LogTab({
  split,
  activeDay,
  dayNames,
  activeDayIndex,
  setActiveDayIndex,
  units,
  inProgress,
  setInProgress,
  onSave,
}) {
  if (!split || !activeDay) {
    return (
      <div className="grid gap-3">
        <h3 className="font-semibold">Log</h3>
        <p className="text-sm text-neutral-400">
          Import a split first, then you can log your session here.
        </p>
      </div>
    );
  }

  function startSession() {
    const seed = {
      id: crypto.randomUUID(),
      date: todayKey(),
      dayId: activeDay.id,
      dayName: activeDay.name,
      entries: (activeDay.exercises || []).map((e) => ({
        name: e.name,
        sets: Array.from({ length: Number(e.sets || 3) }).map(() => ({
          reps: "",
          weight: "",
          failure: false,
        })),
      })),
      notes: "",
      units,
    };
    setInProgress(seed);
  }

  function updateSet(eIdx, sIdx, patch) {
    const next = structuredClone(inProgress);
    Object.assign(next.entries[eIdx].sets[sIdx], patch);
    setInProgress(next);
  }

  return (
    <div className="grid gap-3">
      {/* Day selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill">Day</span>
        <div className="flex gap-2">
          {dayNames.map((n, i) => (
            <button
              key={i}
              className={cls(
                "px-3 py-1 rounded-lg text-sm border",
                i === activeDayIndex ? "btn-primary" : "btn"
              )}
              onClick={() => setActiveDayIndex(i)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {!inProgress && (
        <div className="glass p-3">
          <div className="text-sm text-neutral-300">
            Ready to log <b>{activeDay.name}</b>?
          </div>
          <div className="mt-2">
            <button className="btn-primary" onClick={startSession}>
              Start session
            </button>
          </div>
        </div>
      )}

      {inProgress && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">
              {inProgress.dayName} — {inProgress.date}
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => setInProgress(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => onSave(structuredClone(inProgress))}
              >
                Save session
              </button>
            </div>
          </div>

          {(inProgress.entries || []).map((e, ei) => (
            <div
              key={ei}
              className="rounded-lg border border-[var(--border)] p-3 bg-[var(--card)]"
            >
              <div className="font-medium">{e.name}</div>
              <div className="mt-2 grid gap-2">
                {e.sets.map((s, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400 w-10">
                      Set {si + 1}
                    </span>
                    <input
                      className="input w-24"
                      placeholder="reps"
                      value={s.reps}
                      onChange={(ev) =>
                        updateSet(ei, si, { reps: ev.target.value })
                      }
                    />
                    <input
                      className="input w-28"
                      placeholder={`weight (${inProgress.units})`}
                      value={s.weight}
                      onChange={(ev) =>
                        updateSet(ei, si, { weight: ev.target.value })
                      }
                    />
                    <label className="text-xs flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={s.failure}
                        onChange={(ev) =>
                          updateSet(ei, si, { failure: ev.target.checked })
                        }
                      />
                      failure
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <textarea
            className="input"
            placeholder="Notes (optional)"
            value={inProgress.notes}
            onChange={(e) =>
              setInProgress({ ...inProgress, notes: e.target.value })
            }
          />
        </div>
      )}
    </div>
  );
}

// ---- Sessions Tab ----

function SessionsTab({ sessions, units }) {
  if (!sessions?.length) {
    return (
      <div className="grid gap-2">
        <h3 className="font-semibold">Sessions</h3>
        <p className="text-sm text-neutral-400">No sessions yet.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <h3 className="font-semibold">Sessions</h3>
      {sessions.map((s) => (
        <div
          key={s.id}
          className="rounded-lg border border-[var(--border)] p-3 bg-[var(--card)]"
        >
          <div className="flex items-center justify-between">
            <div className="font-medium">
              {s.dayName} — {s.date}
            </div>
            <span className="pill">{s.units || units}</span>
          </div>
          {s.notes && (
            <div className="mt-1 text-sm text-neutral-300">{s.notes}</div>
          )}
        </div>
      ))}
    </div>
  );
}
