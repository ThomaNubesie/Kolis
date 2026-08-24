"use client";
import { createClient } from "@supabase/supabase-js";

// Quorly runs on its OWN Supabase project (separate auth pool from Kolis/LoadQ) so a
// person verifies email+phone once and has exactly one Quorly account — no cross-product
// account fragmentation. A distinct storageKey keeps Quorly sessions from colliding with
// the Kolis session when both are served from the same domain (business.kolis.ca).
// Falls back to the shared project vars only if the Quorly vars aren't set (transition safety).
const url = process.env.NEXT_PUBLIC_QUORLY_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_QUORLY_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const quorly = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "quorly-auth" },
});
