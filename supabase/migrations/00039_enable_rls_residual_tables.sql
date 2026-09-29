-- 00039_enable_rls_residual_tables
-- Ferme l'exposition anon des tables résiduelles "acquisition machine"
-- (lx_prospects, activities) — non liées à Richoz, signalées ERROR par l'advisor Supabase.
-- service_role (backend/cron) bypasse RLS => aucun impact sur un writer backend.
-- anon (clé publique) et authenticated perdent l'accès direct (comportement voulu).
-- Appliquée en prod (yuumzhlvmqcbogqzuonp) via apply_migration le 29.09.2026.

alter table public.lx_prospects enable row level security;
alter table public.activities   enable row level security;

-- Policy explicite service_role (documentaire ; service_role bypasse déjà RLS).
drop policy if exists service_role_all on public.lx_prospects;
create policy service_role_all on public.lx_prospects
  for all to service_role using (true) with check (true);

drop policy if exists service_role_all on public.activities;
create policy service_role_all on public.activities
  for all to service_role using (true) with check (true);

-- Defense-in-depth : retire les privilèges excessifs de la clé publique.
revoke insert, update, delete, truncate on public.lx_prospects from anon;
revoke insert, update, delete, truncate on public.activities   from anon;
