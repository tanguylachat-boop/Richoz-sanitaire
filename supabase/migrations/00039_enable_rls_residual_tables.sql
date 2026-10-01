-- 00039_enable_rls_residual_tables
-- Ferme l'exposition anon des tables résiduelles "acquisition machine"
-- (lx_prospects, activities) — non liées à Richoz, signalées ERROR par l'advisor Supabase.
-- service_role (backend/cron) bypasse RLS => aucun impact sur un writer backend.
-- anon (clé publique) et authenticated perdent l'accès direct (comportement voulu).
-- Appliquée en prod (yuumzhlvmqcbogqzuonp) via apply_migration le 29.09.2026.
--
-- Ces tables n'existent QUE sur la prod (résidus acquisition machine) : elles ne
-- sont créées par aucune migration du dépôt. On garde donc chaque action derrière
-- un test d'existence, pour que `supabase db reset` (stack local sans ces tables)
-- passe sans erreur. En prod elles existent → comportement strictement identique.

DO $$
BEGIN
  IF to_regclass('public.lx_prospects') IS NOT NULL THEN
    EXECUTE 'alter table public.lx_prospects enable row level security';
    EXECUTE 'drop policy if exists service_role_all on public.lx_prospects';
    EXECUTE 'create policy service_role_all on public.lx_prospects for all to service_role using (true) with check (true)';
    EXECUTE 'revoke insert, update, delete, truncate on public.lx_prospects from anon';
  END IF;

  IF to_regclass('public.activities') IS NOT NULL THEN
    EXECUTE 'alter table public.activities enable row level security';
    EXECUTE 'drop policy if exists service_role_all on public.activities';
    EXECUTE 'create policy service_role_all on public.activities for all to service_role using (true) with check (true)';
    EXECUTE 'revoke insert, update, delete, truncate on public.activities from anon';
  END IF;
END $$;
