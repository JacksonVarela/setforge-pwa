// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { initFirebaseApp } from "./firebase";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut as fbSignOut,
} from "firebase/auth";

import ImporterAI from "./components/ImporterAI.jsx";
import Templates from "./components/Templates.jsx";
import CoachChat from "./components/CoachChat.jsx";

/* --------------- small helpers --------------- */

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

function clsx(...xs) { return xs.filter(Boolean).join(" "); }

/* --------------- App --------------- */

export default function App() {
  // Firebase (optional but enabled)
  const app = useMemo(() => initFirebaseApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [tab, setTab] = useLocalState("sf.tab", "Log");
  const [units, setUnits] = useLocalState("sf.units", "lb");
  const [split, setSplit] = useLocalState("sf.split", null);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setCheckingAuth(false);
    });
    return () => off();
  }, [auth]);

  function saveSplit(s) {
    setSplit(s);
    try { localStorage.setItem("sf.split", JSON.stringify(s)); } catch {}
  }

  /* ---------- Auth screens ---------- */

  if (checkingAuth) {
    return (
      <div className="fullscreen flex items-center justify-center">
        <div className="pill">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onDone={() => {}} />;
  }

  if (user && !user.emailVerified) {
    return <VerifyScreen user={user} onSignOut={() => fbSignOut(auth)} />;
  }

  /* ---------- Main app ---------- */

  return (
    <div className="min-h-screen safe-pt safe-px pb-8">
      {/* Top bar */}
      <header className="flex items-center justify-between mb-4">
        <div className="text-lg font-semibold">SetForge</div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              className={clsx("pill", units === "lb" && "bg-white text-black border-white")}
              onClick={() => setUnits("lb")}
            >
              lb
            </button>
            <button
              className={clsx("pill", units === "kg" && "bg-white text-black border-white")}
              onClick={() => setUnits("kg")}
            >
              kg
            </button>
          </div>
          <button className="btn" onClick={() => fbSignOut(auth)}>
            Sign out
          </button>
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="flex gap-2 mb-4">
        {["Log", "Split", "Templates", "Sessions", "Coach"].map((t) => (
          <button
            key={t}
            className={clsx("pill", tab === t && "bg-white text-black border-white")}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* Views */}
      {tab === "Log" && (
        <LogView
          split={split}
          onGoSplit={() => setTab("Split")}
          onGoTemplates={() => setTab("Templates")}
        />
      )}

      {tab === "Split" && (
        <ImporterAI
          onConfirm={(newSplit) => {
            saveSplit(newSplit);
            setTab("Log");
          }}
          onCancel={() => setTab("Log")}
        />
      )}

      {tab === "Templates" && (
        <Templates
          onUse={(tmpl) => {
            saveSplit(tmpl);
            setTab("Log");
          }}
        />
      )}

      {tab === "Sessions" && <SessionsView />}

      {tab === "Coach" && <CoachChat units={units} />}
    </div>
  );
}

/* --------------- Screens --------------- */

function AuthScreen() {
  const app = useMemo(() => initFirebaseApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState("login"); // login | signup
  const [msg, setMsg] = useState("");

  async function login() {
    setMsg("");
    try {
      await signInWithEmailAndPassword(auth, email, pw);
    } catch (e) {
      setMsg(e.message || "Could not sign in.");
    }
  }

  async function signup() {
    setMsg("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      try { await sendEmailVerification(cred.user); } catch {}
      setMsg("Account created. Check your inbox to verify before using the app.");
    } catch (e) {
      setMsg(e.message || "Could not create account.");
    }
  }

  return (
    <section className="fullscreen anime-overlay bg-login relative flex items-center justify-center safe-px">
      <div className="max-w-sm w-full glass-strong p-4">
        <h1 className="text-xl font-semibold">Welcome to SetForge</h1>
        <p className="text-sm text-neutral-400">
          Log your training offline-first. Create an account and verify to use the app.
        </p>

        <div className="mt-3 grid gap-2">
          <input className="input" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="input" placeholder="Password" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          {mode === "login" ? (
            <>
              <button className="btn-primary" onClick={login}>Log in</button>
              <button className="btn" onClick={() => setMode("signup")}>Create account</button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={signup}>Create account</button>
              <button className="btn" onClick={() => setMode("login")}>Back to log in</button>
            </>
          )}
        </div>

        {!!msg && <div className="mt-3 text-sm text-neutral-300">{msg}</div>}
      </div>

      {/* Decorative coach sticker, bottom-right */}
      <div className="coach-sticker" aria-hidden />
    </section>
  );
}

function VerifyScreen({ user, onSignOut }) {
  const [sent, setSent] = useState(false);

  async function resend() {
    try { await sendEmailVerification(user); setSent(true); } catch {}
  }

  return (
    <section className="fullscreen anime-overlay bg-login relative flex items-center justify-center safe-px">
      <div className="max-w-sm w-full glass-strong p-4">
        <h2 className="text-lg font-semibold">Verify your email</h2>
        <p className="text-sm text-neutral-300">
          We’ve sent a verification link to <strong>{user.email}</strong>.
          Open it, then reload this page.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button className="btn-primary" onClick={resend}>
            {sent ? "Sent ✓" : "Resend email"}
          </button>
          <button className="btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
      <div className="coach-sticker" aria-hidden />
    </section>
  );
}

function LogView({ split, onGoSplit, onGoTemplates }) {
  const hasSplit = !!split?.days?.length;

  return (
    <section className={clsx("relative", !hasSplit && "fullscreen anime-overlay bg-login flex items-center justify-center")}>
      {!hasSplit ? (
        <>
          <div className="text-center space-y-3">
            <h2 className="text-xl font-semibold">Import a split to start logging</h2>
            <p className="text-neutral-400 text-sm">
              Paste or upload on the Split tab, or choose a science-based template.
            </p>
            <div className="flex gap-2 justify-center">
              <button className="btn-primary" onClick={onGoSplit}>Import</button>
              <button className="btn" onClick={onGoTemplates}>Browse templates</button>
            </div>
          </div>
          <div className="coach-sticker" aria-hidden />
        </>
      ) : (
        <div className="glass p-4 rounded-2xl border border-neutral-800">
          <h3 className="font-semibold">Log</h3>
          <p className="text-sm text-neutral-400">Logging UI will use your imported split. (WIP placeholder)</p>
        </div>
      )}
    </section>
  );
}

function SessionsView() {
  // simple placeholder for now
  return (
    <section className="glass p-4 rounded-2xl border border-neutral-800">
      <h3 className="font-semibold">Sessions</h3>
      <p className="text-sm text-neutral-400">Your recent sessions will appear here after logging.</p>
    </section>
  );
}
