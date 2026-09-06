"use client";
// Quorly gate for /forms: requires a fully-onboarded account (verified email + phone + profile name)
// via the shared wizard before showing the app.
import { useEffect, useState } from "react";
import { quorly as supabase } from "@/lib/quorly";
import { cf } from "@/lib/cf";
import QuorlyOnboard from "@/components/QuorlyOnboard";
import { useIdleLogout } from "@/lib/idleLogout";

export default function QuorlyAuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  // Three hours idle ends the session. The gate wraps every Quorly surface, so this
  // one call covers the app, the meeting room and the appointment letter alike.
  useIdleLogout(3);

  useEffect(() => {
    let sub: any;
    (async () => {
      const check = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email || user?.phone) { const p: any = await cf.myProfile().catch(() => ({})); return !!p?.name; }
        return false;
      };
      setDone(await check());
      setReady(true);
      sub = supabase.auth.onAuthStateChange(async () => setDone(await check())).data.subscription;
    })();
    return () => { sub?.unsubscribe?.(); };
  }, []);

  if (!ready) return <div style={{ background: "#2A2824", minHeight: "100vh" }} />;
  if (done) return <>{children}</>;
  return <QuorlyOnboard onDone={() => setDone(true)} />;
}
