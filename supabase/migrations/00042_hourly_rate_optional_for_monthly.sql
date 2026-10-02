-- ============================================================================
-- Migration 00042 — Taux horaire optionnel pour les mensualisés
-- ============================================================================
-- Demande recette Richoz (02.10.2026) : chez Richoz tous les employés sont
-- mensualisés ; exiger un taux horaire à l'enregistrement est une friction.
-- On rend `hourly_rate_chf` NULLABLE. Il reste REQUIS pour un employé 'hourly'
-- (le salaire de base = heures × taux). S'il est absent pour un mensualisé, les
-- éléments valorisés au taux (heures sup, retard, congé/pont non payé) restent
-- « à configurer » dans le brouillon de paie — comportement déjà géré par le RPC
-- (v_rate NULL → ligne requires_rule). AUCUN changement de code SQL du moteur.
-- STRICTEMENT ADDITIF / non destructif (les configs existantes ont toutes un taux).
-- ============================================================================

-- Le taux horaire n'est plus obligatoire au niveau colonne…
ALTER TABLE public.employee_salary_config
  ALTER COLUMN hourly_rate_chf DROP NOT NULL;

-- … mais reste requis pour un employé horaire (base = heures × taux).
-- (La contrainte inline `hourly_rate_chf > 0` passe sur NULL : un NULL rend le
--  CHECK « unknown » donc satisfait ; la positivité reste imposée si une valeur
--  est fournie.)
ALTER TABLE public.employee_salary_config
  DROP CONSTRAINT IF EXISTS salary_config_hourly_required;
ALTER TABLE public.employee_salary_config
  ADD CONSTRAINT salary_config_hourly_required
  CHECK (pay_type <> 'hourly' OR hourly_rate_chf IS NOT NULL);
