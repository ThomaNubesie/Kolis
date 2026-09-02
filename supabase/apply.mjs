#!/usr/bin/env node
// Apply a .sql migration to a Supabase project from this machine.
//
//   node supabase/apply.mjs supabase/migrations/20260828120000_quorly_org_departments.sql
//
// Why this exists: `supabase db push` is NOT safe in this repo. supabase/migrations
// holds migrations for TWO different projects — Kolis (kzjptcpjpwlxfofzhyku) and
// Quorly (slhdhapvawjsinzplysd) — and db push would apply every file to whichever
// one is linked. This applies EXPLICIT files to an EXPLICIT project instead.
//
// No install required: it uses the Supabase Management API over Node's built-in
// fetch (the same endpoint the dashboard SQL editor calls).
//
// SETUP (once):
//   1. Create a personal access token: https://supabase.com/dashboard/account/tokens
//   2. export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx
//
// Flags:
//   --project <ref>   target project ref (default: auto — quorly for cf_*/quorly files)
//   --dry             print what would run, send nothing
//   --force           re-apply even if the ledger says it already ran
//   --yes             skip the confirmation prompt
//
// Every applied file is recorded in public.cf_migrations so a re-run is a no-op.

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

// Registered before any top-level await, so a failure in the run below prints
// its guidance rather than a stack trace.
process.on("uncaughtException", (e) => { console.error(`\n   ✗ ${e.message}\n`); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error(`\n   ✗ ${e instanceof Error ? e.message : e}\n`); process.exit(1); });

const PROJECTS = {
  quorly: "slhdhapvawjsinzplysd",   // Quorly — cf_* tables, its own auth pool
  kolis: "kzjptcpjpwlxfofzhyku",    // Kolis / LoadQ — the shared project
};
const API = "https://api.supabase.com/v1";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const files = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--project");

if (!files.length) {
  console.error("usage: node supabase/apply.mjs <file.sql> [...] [--project quorly|kolis|<ref>] [--dry] [--force] [--yes]");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN
  || (await readFile(join(homedir(), ".supabase-pat"), "utf8").catch(() => "")).trim();   // shared with loadq-post.mjs
if (token && /^sbp_x+$/i.test(token)) {
  console.error("SUPABASE_ACCESS_TOKEN is still the placeholder 'sbp_xxxxxxxx'.\n" +
    "Replace it with your own token from https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}
if (!token && !flag("--dry")) {
  console.error("Missing SUPABASE_ACCESS_TOKEN.\n" +
    "  1. Create one at https://supabase.com/dashboard/account/tokens\n" +
    "  2. export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx");
  process.exit(1);
}

// A file naming cf_/quorly belongs to the Quorly project unless told otherwise.
function resolveProject(file) {
  const explicit = opt("--project", null);
  if (explicit) return PROJECTS[explicit] ?? explicit;
  return /quorly|_cf_|\bcf_/i.test(basename(file)) ? PROJECTS.quorly : PROJECTS.kolis;
}

async function run(ref, sql) {
  const res = await fetch(`${API}/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (res.status === 401) {
    throw new Error("401 — the access token was rejected.\n" +
      "     Use a REAL token, not the sbp_xxxxxxxx placeholder from the docs:\n" +
      "     https://supabase.com/dashboard/account/tokens → Generate new token");
  }
  if (res.status === 403 || res.status === 404) {
    throw new Error(`${res.status} — token is valid but cannot reach project ${ref}.\n` +
      "     Check the token's account has access to this project.");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 1200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const LEDGER = `
create table if not exists public.cf_migrations (
  name text primary key,
  applied_at timestamptz not null default now(),
  applied_by text
);`;

for (const file of files) {
  const ref = resolveProject(file);
  const name = basename(file);
  const sql = await readFile(file, "utf8");
  const label = Object.entries(PROJECTS).find(([, v]) => v === ref)?.[0] ?? ref;

  console.log(`\n── ${name}`);
  console.log(`   project : ${label} (${ref})`);
  console.log(`   size    : ${sql.length.toLocaleString()} chars, ${sql.split("\n").length} lines`);

  if (flag("--dry")) { console.log("   DRY RUN — nothing sent."); continue; }

  await run(ref, LEDGER);
  if (!flag("--force")) {
    const seen = await run(ref, `select name from public.cf_migrations where name = '${name.replace(/'/g, "''")}';`);
    if (Array.isArray(seen) && seen.length) { console.log("   already applied — skipping (use --force to re-run)."); continue; }
  }

  // Applying schema changes to a live project is not reversible from here.
  if (!flag("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ok = await rl.question(`   Apply to ${label}? type the project name to confirm: `);
    rl.close();
    if (ok.trim() !== label) { console.log("   aborted."); continue; }
  }

  try {
    // The migration is written to be idempotent (if not exists / or replace /
    // not valid), so it is safe to re-run, but a single transaction still means
    // a failure halfway leaves nothing half-built.
    await run(ref, `begin;\n${sql}\ncommit;`);
    await run(ref, `insert into public.cf_migrations(name, applied_by) values ('${name.replace(/'/g, "''")}', 'apply.mjs')
                    on conflict (name) do update set applied_at = now();`);
    console.log("   ✓ applied");
  } catch (e) {
    console.error(`   ✗ FAILED — nothing was committed\n     ${e.message}`);
    process.exitCode = 1;
  }
}
