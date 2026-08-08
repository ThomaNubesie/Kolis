-- No org financing yet: zero all credit limits. Admin UI for setting a credit
-- limit removed; new orgs get 0. (Applied to prod via MCP.)
update public.kolis_orgs set credit_limit_cents = 0 where coalesce(credit_limit_cents,0) <> 0;
