"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// The base URL is just a router: send each visitor to the right surface.
// Staff → /admin, shipper org → /shipper, carrier org → /carrier, else /login.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: staff } = await supabase.rpc("kolis_is_staff");
      if (staff) { router.replace("/admin"); return; }
      try { await supabase.rpc("kolis_accept_org_invite"); } catch { /* ignore */ }
      const { data: orgs } = await supabase.rpc("kolis_my_orgs");
      const list = (orgs ?? []) as { type: string }[];
      if (list.some((o) => o.type === "shipper" || o.type === "both")) { router.replace("/shipper"); return; }
      if (list.some((o) => o.type === "carrier")) { router.replace("/carrier"); return; }
      router.replace("/login");
    })();
  }, [router]);
  return <div className="center">Loading…</div>;
}
