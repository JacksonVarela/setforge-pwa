import React, { useState } from "react";
import { auth, db } from "../firebase";
import { deleteUser } from "firebase/auth";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

function dl(name, text, mime="text/plain"){
  const blob=new Blob([text],{type:mime}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
function toCSV(sessions, units){
  const rows=[["date","day","exercise","set","weight("+units+")","reps","RIR","fail","drop","note"]];
  (sessions||[]).forEach(s=>{
    (s.entries||[]).forEach(e=>{
      (e.sets||[]).forEach((x,i)=>rows.push([s.date,s.dayName,e.name,i+1,x.weight??"",x.reps??"",x.rir??"",x.fail?"1":"",x.isDrop?"1":"",e.decisionNote??""]));
    });
  });
  return rows.map(r=>r.map(v=>String(v).replaceAll('"','""')).map(v=>`"${v}"`).join(",")).join("\n");
}

export default function Settings({ user, split, sessions, units, onClearLocal }) {
  const [analytics, setAnalytics] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem("sf.flags.analytics")||"true"); } catch { return true; }
  });
  function saveFlag(v){ localStorage.setItem("sf.flags.analytics", JSON.stringify(!!v)); setAnalytics(!!v); }

  return (
    <section className="grid gap-4 max-w-2xl">
      <h2 className="text-xl font-semibold">Settings</h2>

      <div className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
        <div className="font-semibold">Export</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn" onClick={()=>dl("sessions.json", JSON.stringify(sessions||[],null,2), "application/json")}>Export Sessions (JSON)</button>
          <button className="btn" onClick={()=>dl("sessions.csv", toCSV(sessions||[], units), "text/csv")}>Export Sessions (CSV)</button>
          <button className="btn" onClick={()=>dl("split.json", JSON.stringify(split||{},null,2), "application/json")}>Export Split (JSON)</button>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
        <div className="font-semibold">Feature flags</div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={analytics} onChange={e=>saveFlag(e.target.checked)} />
          Anonymized analytics (feature tap counts)
        </label>
        <div className="text-xs text-neutral-400 mt-1">No PII; you can turn this off anytime.</div>
      </div>

      <div className="rounded-xl border border-neutral-800 p-3 bg-neutral-900">
        <div className="font-semibold text-red-400">Danger zone</div>
        <div className="mt-2 grid gap-2">
          <button className="btn" onClick={()=>{ if(confirm("Clear local data?")){ onClearLocal?.(); alert("Local data cleared."); } }}>Clear local data</button>
          <button className="btn" onClick={async ()=>{
            if(!confirm("Delete ALL cloud data (split + sessions)?")) return;
            try { await deleteDoc(doc(db,"users",user.uid,"data","split")); } catch {}
            try {
              const snap=await getDocs(collection(db,"users",user.uid,"sessions"));
              const jobs=[]; snap.forEach(d=>jobs.push(deleteDoc(doc(db,"users",user.uid,"sessions",d.id))));
              await Promise.allSettled(jobs);
            } catch {}
            alert("Cloud data deleted.");
          }}>Delete cloud data</button>
          <button className="btn" onClick={async ()=>{
            if(!confirm("Delete account completely? You may need to sign in again.")) return;
            try { await deleteUser(auth.currentUser); window.location.replace("/"); }
            catch { alert("Delete failed (needs recent login). Sign out/in and try again."); }
          }}>Delete account</button>
        </div>
      </div>
    </section>
  );
}
