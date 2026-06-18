"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Landing from "@/components/Landing";

// The base URL routes signed-in visitors to the right surface (staff → /admin,
// shipper org → /shipper, carrier org → /carrier). Logged-out visitors used to
// be bounced straight to /login — now they see the public Kolis · Business
// landing page (onboarding is invite-only; the landing's CTAs are Request
// access + Log in).
export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<"loading" | "landing">("loading");
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setView("landing"); return; }
      try { await supabase.rpc("kolis_claim_admin_invite"); } catch { /* claim a pending staff invite */ }
      const { data: staff } = await supabase.rpc("kolis_is_staff");
      if (staff) { router.replace("/admin"); return; }
      try { await supabase.rpc("kolis_accept_org_invite"); } catch { /* ignore */ }
      const { data: orgs } = await supabase.rpc("kolis_my_orgs");
      const list = (orgs ?? []) as { type: string }[];
      if (list.some((o) => o.type === "shipper" || o.type === "both")) { router.replace("/shipper"); return; }
      if (list.some((o) => o.type === "carrier")) { router.replace("/carrier"); return; }
      // signed in but no membership yet → let them reach the login screen's "ask your admin" message
      router.replace("/login");
    })();
  }, [router]);
  if (view === "landing") return <Landing />;
  return <div className="center">Loading…</div>;
}
