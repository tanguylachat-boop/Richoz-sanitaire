# LOT 8 — Config de rémunération & fiche de paie nette (design)

Date : 2026-09-23. Décidé avec le client (Tanguy) en cadrage. Débloque les lots 6A/6B/6C
(la clôture de paie était impossible faute de taux). Migration additive `00036`,
principe **PAIE_FIGEE conservé**.

## Décisions client verrouillées

1. **Config par employé**, modèle **mixte** : `monthly` (salaire mensuel fixe) ou `hourly` (taux × heures).
2. Employé `hourly` → heures du mois **auto-préremplies** (somme des `work_duration_minutes`
   des rapports **validés** dans la fenêtre) **+ correction manuelle** par la secrétaire.
3. Éléments variables **auto-calculés** depuis le taux horaire (+ override possible) :
   - `sans_solde` = minutes/60 × taux (retenue)
   - `heures_sup` = minutes/60 × taux × (1 + suppl%/100) (ajout)
   - `retard`     = minutes/60 × taux (retenue)
   - `amende_parc`= montant saisi (imputabilité → l'admin décide, sinon reste « à configurer »)
   - `piquet`     = 150 CHF/semaine complète (règle existante, inchangée)
4. **Fiche complète avec net dans l'app**, mais **l'app ne connaît aucun taux légal** :
   la secrétaire saisit les cotisations. Zéro taux suisse en dur.
5. Cotisations/retenues/ajouts = **liste flexible de composants** par employé :
   `libellé` · `sens` (retenue/ajout) · `base` (% du brut OU montant fixe).
   → Le 13e salaire = un composant `addition` ajouté le mois voulu. Pas de code dédié.
6. **Base du % (« brut déterminant »)** = `salaire_base + heures_sup + piquet`. Les retenues
   (sans_solde/retard/amende) et les ajouts n'entrent PAS dans cette base. La secrétaire peut
   **override** n'importe quelle ligne calculée → filet de sécurité pour tout cas particulier.
7. **Fiche/net réservés admin + secrétaire** (diffusion aux salariés = plus tard, hors périmètre).
8. **Taux horaire saisi explicitement pour tous** (y compris mensualisés), pas dérivé du mensuel.

## Modèle de données (migration `00036`)

### `employee_salary_config` (1 config active par employé, historisée)
- `technician_id` FK users
- `pay_type` `monthly|hourly`
- `monthly_base_chf` numeric(10,2) — requis si `monthly`
- `hourly_rate_chf` numeric(8,2) — toujours requis (chiffre les variables)
- `overtime_supplement_pct` numeric(5,2) NOT NULL DEFAULT 25.00
- `effective_from` date NOT NULL DEFAULT current_date
- `is_active` boolean — 1 seule active par employé (index unique partiel)
- audit `created_by/created_at/updated_at` + table `employee_salary_config_history` inviolable (trigger).
- Cohérence par CHECK : `monthly` ⇒ `monthly_base_chf` non nul ; `hourly_rate_chf` non nul.

### `salary_config_component` (lignes flexibles)
- `config_id` FK (ON DELETE CASCADE)
- `label` text · `direction` `deduction|addition`
- `basis` `pct_gross|fixed` · `pct` numeric(5,2) XOR `amount_chf` numeric(10,2)
- `sort_order` int
- CHECK honnêteté : `pct_gross` ⇒ `pct` non nul & montant nul ; `fixed` ⇒ inverse.

### `payroll_drafts` (ajouts)
- `worked_hours` numeric(8,2) NULL · `worked_hours_source` `auto|manual` DEFAULT 'auto'
- `net_chf` numeric(10,2) NULL — recalculé par trigger à chaque changement de ligne ;
  NULL tant qu'une ligne est `requires_rule` (net honnête, jamais partiel).

### `payroll_draft_lines` (ajouts)
- `line_type` étendu : + `cotisation`, `ajout`
- `component_id` uuid NULL (source composant pour cotisation/ajout)
- `overridden` boolean NOT NULL DEFAULT false

## Calcul (RPC `generate_payroll_drafts` étendue)

À la création/rafraîchissement d'une fiche :
1. Charger la **config active** de l'employé (`effective_from <= period_end`, `is_active`).
2. **Heures** (`hourly`) : `worked_hours` auto = Σ `work_duration_minutes` des rapports
   `status='validated'` du technicien dans la fenêtre ÷ 60 ; conservé si `worked_hours_source='manual'`.
3. **Salaire de base** : `monthly` → `monthly_base_chf` ; `hourly` → `worked_hours × hourly_rate_chf`.
   Config absente ou heures manquantes → ligne `requires_rule`.
4. **Variables** : valorisés avec `hourly_rate_chf` + `overtime_supplement_pct`
   (les `salary_items` restent bruts = minutes ; seul le piquet garde son montant).
   Taux absent → ligne `requires_rule`.
5. **Cotisations/ajouts** : une ligne par composant. `pct_gross` appliqué au brut déterminant
   (base + heures_sup + piquet) ; `fixed` = montant. Toutes `amount_set`.
6. **Override préservé** : avant de régénérer les lignes, les montants `overridden` sont
   capturés (clé = `salary_item_id` | `component_id` | `salaire_base`) et réappliqués après.
7. **Net** (trigger sur lignes) = base + heures_sup + piquet + Σajouts
   − sans_solde − retard − amende_parc − Σcotisations. NULL si une ligne `requires_rule`.

Clôture : refus tant qu'une ligne `requires_rule` subsiste (règle existante inchangée).
Fiche validée figée (PAIE_FIGEE existant).

## UI & sécurité

- **`/admin/salary-config`** (nouvelle) : liste employés → config (type, base/taux, suppl%) +
  éditeur de composants. `'use client'` + supabase client, comme les pages existantes.
  Garde : `layout.tsx` → `requireAdminOrSecretary()`.
- **`/admin/payroll-drafts`** (enrichie) : saisie/correction des heures (hourly),
  édition inline du montant d'une ligne (override, tant que `draft`), affichage du **net**.
- RLS nouvelles tables : `is_admin_or_secretary()` en lecture ET écriture (pas de lecture employé).

## Lib partagée
`src/lib/payroll-net.ts` : `computeNet(lines)` (mêmes signes que le trigger) pour l'affichage,
source unique de vérité côté client alignée sur le trigger SQL.

## Tests (`tests/lot8-salary-config.test.cjs`, stack local, BEGIN/ROLLBACK)
- Config `monthly` → base = mensuel ; `hourly` sans heures → `requires_rule` ; avec heures → base = h×taux.
- sans_solde/heures_sup/retard valorisés ; suppl% appliqué ; amende sans montant → `requires_rule`.
- Composant `pct_gross` calculé sur le bon brut ; `fixed` ; net = somme signée ; net NULL si une ligne à configurer.
- Override préservé au rafraîchissement ; clôture refusée si `requires_rule` ; PAIE_FIGEE après validation.
- Config historisée inviolable ; RLS employé = pas d'accès config.
- `npx tsc --noEmit` code 0 · `npm run build` code 0.

## Hors périmètre (assumé)
Diffusion des fiches aux salariés · impôt à la source automatique · taux légaux en dur ·
génération planifiée du 25 (déjà non activée).
