"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, org as orgApi, MyOrg } from "@/lib/supabase";

type Ctx = { orgs: MyOrg[]; active: MyOrg; setActive: (id: string) => void };
const OrgCtx = createContext<Ctx | null>(null);

export const useOrg = () => {
  const c = useContext(OrgCtx);
  if (!c) throw new Error("useOrg must be used inside <OrgGate>");
  return c;
};

// Gates a portal: requires a session + membership in an org of the right kind.
// Resolves the active org (with a switcher when the user has several).
export function OrgGate({ portal, children }: { portal: "shipper" | "carrier" | "any"; children: React.ReactNode }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<MyOrg[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      try { await orgApi.acceptInvites(); } catch { /* ignore */ }
      let list: MyOrg[] = [];
      try { list = await orgApi.mine(); } catch { /* ignore */ }
      const match = portal === "any" ? list : list.filter((o) => o.type === portal || o.type === "both");
      setOrgs(match);
      setActiveId(match[0]?.org_id ?? null);
    })();
  }, [router, portal]);

  if (orgs === null) return <div className="center">Loading…</div>;
  if (orgs.length === 0) {
    return (
      <div className="center">
        <div className="card" style={{ padding: 24, maxWidth: 420 }}>
          <b>No {portal} organization</b>
          <div className="sub" style={{ marginTop: 8 }}>
            Your account isn’t a member of a {portal} business account yet. Ask your administrator for an invite.
          </div>
          <button className="btn ghost" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>Sign out</button>
        </div>
      </div>
    );
  }
  const active = orgs.find((o) => o.org_id === activeId) ?? orgs[0];
  return <OrgCtx.Provider value={{ orgs, active, setActive: setActiveId }}>{children}</OrgCtx.Provider>;
}
