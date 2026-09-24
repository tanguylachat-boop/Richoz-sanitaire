# Richoz — État de reprise (Claude Code)

Mis à jour : 18 septembre 2026 (fin de session). Reprise après Codex selon `RICHOZ_PASSATION_CLAUDE.md`.

## Fait

- **Lots 1, 2A, 2B, 3A, 3B** (Codex) : vérifiés terminés à la reprise (preuves `docs/VALIDATION-*`, tsc code 0 sur l'état hérité). Rien refait.
- **LOT 5 — Congés modifiables et historique RH** : livré, `docs/VALIDATION-LOT-5.md`. Migration `00030` (heures partielles, `leave_request_history` inviolable, anti-chevauchement même type, correctif RLS maladie/accident auto-validés — défaut préexistant), lib `src/lib/leave-duration.ts` partagée (jours calendaires × 8 h, règle existante conservée), UI admin/technicien/stats alignées. Tests : 6/6 unitaires + 8/8 intégration réelle.
- **LOT 6A — Éléments variables de salaire** : livré, `docs/VALIDATION-LOT-6A.md`. Migration `00031` (`salary_items` + historique + consommation unique des sources congés/piquet + piquet 150 CHF/semaine complète imposé serveur + `PAIE_FIGEE`), page `/admin/salary-items`. Tests : 9/9 intégration.
- **LOTS 6B/6C — Brouillon de paie + génération du 25** : livrés, `docs/VALIDATION-LOT-6BC.md`. Migration `00032` (`payroll_drafts`/`payroll_draft_lines`, RPC `generate_payroll_drafts` fenêtre 26→25, idempotence, clôture refusée si lignes « à configurer », régularisation versionnée), page `/admin/payroll-drafts`, route cron `/api/cron/payroll-drafts` (secret + simulation par défaut, **non planifiée**). Tests : 7/7 intégration. **Constat : aucun moteur de paie n'existait dans le dépôt** — le brouillon est la fiche d'éléments variables, socle des règles à configurer.
- **LOT 4 — Import Excel Bexio** : livré, `docs/VALIDATION-LOT-4.md`. Migration `00033` (`clients.bexio_nr` unique), lecteur XLSX/CSV maison sans dépendance (`xlsx-lite`, valeurs en cache seulement, jamais de formule exécutée), page `/clients/import` (aperçu → mapping → bilan), réimport sans doublon, homonymes jamais fusionnés. **Fichier client réel absent du projet : colonnes réelles non vérifiées, aucun contact réel importé.** Tests : 5/5 unitaires + index unique vérifié en base.
- **LOT 7 — Géolocalisation MVP** : livré **désactivé**, `docs/VALIDATION-LOT-7.md`. Migration `00034` (1 ligne/technicien, coordonnées interdites hors partage actif par contrainte, RLS stricte), pages `/technician/location` (gate `NEXT_PUBLIC_LOCATION_SHARING_ENABLED`) et `/admin/locations` (péremption 5 min, lien Google Maps existant). Tests : 3/3 intégration, positions fictives.

## En cours

- Rien. **Tous les lots de la passation sont traités.** Reste la recette client et les décisions ci-dessous.

## Bloqué / décisions client (consignées UNE fois — ne pas redemander)

1. **Rôle/appareil/version** du bug statistiques d'origine (réserve lot 1, inchangée).
2. **Horaires contractuels, temps partiels, jours non travaillés, droits à congés** absents du dépôt → durées = jours calendaires × 8 h (seule règle existante) ; adapter uniquement `src/lib/leave-duration.ts` + `leave_request_minutes` SQL quand fournis.
3. **Règles de paie** : salaire de base/cotisations (aucune donnée dans le logiciel), taux heures sup/CCT, traitement retards, imputabilité amendes (validation juridique pour retenues), tarif sans solde, piquet partagé/prorata, heure de génération et de clôture du 25, fenêtre 26→25 contractuelle, format de fiche cible, diffusion aux salariés. Sans elles : saisie et brouillons fonctionnent, lignes « à configurer », clôture bloquée (comportement voulu).
4. **Fichier Excel Bexio** : à déposer dans le projet pour vérifier les colonnes réelles et importer.
5. **Localisation** : information des salariés + cadre (PFPDT) avant `NEXT_PUBLIC_LOCATION_SHARING_ENABLED='true'` ; appareils réels à tester ; suivi arrière-plan ⇒ app native (hors périmètre, expliqué).
6. Rappels 3A : types/déclencheur/cadence toujours à confirmer (inchangé). **Aucune pénalité automatique rapport manquant** (conservé non activé).

## Déploiement prod (22.09.2026)

- **Migrations `00030→00034` appliquées sur la prod Richoz** (`yuumzhlvmqcbogqzuonp`, projet dédié Richoz — PAS multi-tenant partagé). Additives : +2 colonnes/CHECK/triggers/policy sur `leave_requests`, nouvelles tables `salary_items`(+history), `payroll_drafts`/`payroll_draft_lines`, `technician_locations`, `leave_request_history`, colonne `clients.bexio_nr`, fonction `generate_payroll_drafts`.
- **Backup complet préalable** : `backups/richoz-2026-09-22T08-06-26/` (6206 lignes, 26 tables, dont 5128 emails / 406 MB). `backups/` ajouté au `.gitignore` (données client réelles, jamais commit).
- **Zéro perte** : counts existants identiques au backup après migration (users 15, leave_requests 8, interventions 6, reports 3, regies 16, products 35, audit_log 874, notifications 77, piquet 4/2 ; email_inbox 5128→5130 via cron Gmail).
- **Ledger de migrations distant désynchronisé** (s'arrêtait à `users_annual_leave_weeks` 21.05 alors que le schéma était à ~00029) → migrations passées via `apply_migration` direct, PAS `supabase db push` (qui aurait rejoué 00021→00029).
- Branche `feat/richoz-reprise-lots-4-7` poussée sur GitHub (commit `aca9205` + `chore .gitignore` `618e42d`). Preview Vercel déployé pour recette manuelle par rôle.
- **À FAIRE avant activation** : variables Vercel `PAYROLL_DRAFTS_SECRET` (+`ENABLED` pour planifier le cron du 25, non planifié), `NEXT_PUBLIC_LOCATION_SHARING_ENABLED` (géoloc gated off par défaut). Promotion prod (`main`) via PR après recette validée.

## Alerte sécurité (relevée 22.09.2026 — advisor Supabase)

- `public.lx_prospects` et `public.activities` ont **RLS désactivé** → exposées à la clé anon. À corriger (activer RLS + policies adaptées ; ne pas juste `ENABLE` sans policy, ça bloquerait tout accès). Tables non liées aux lots 4-7 (résidus acquisition machine).

## Session 23.09.2026 — auto-sync paie + fix stats RH + géoloc

- **Auto-synchronisation des éléments de paie** (migration `00035_salary_items_autosync`, appliquée prod via `apply_migration`, 6 triggers actifs `SECURITY DEFINER` + `search_path=public`). Décision client : seuls **piquet** et **congé sans solde** ont une source → auto-créés en statut **`pending` (« à valider »)**, l'admin valide avant paie. Heures sup / retard / amende restent en saisie manuelle (aucune source dans l'app : pas de pointage, pas de feuille d'heures, pas de registre d'amendes). Cascade prudente : source devenue inéligible (piquet supprimé/partiel, congé dé-approuvé/supprimé/type changé) → item auto-créé passé `cancelled` ; item déjà `payroll_status='included'` JAMAIS touché (PAIE_FIGEE). Semaine de piquet partielle : NON insérée (n'échoue pas l'insert du planning). Idempotent (index unique `(item_type, source_id)`). `validate_salary_item` republié à l'identique de 00031 + une garde en tête qui laisse passer un UPDATE `cancelled/rejected` sans re-dériver la source (après le check PAIE_FIGEE). Testé en BEGIN/ROLLBACK (9 cas ✅) + test indépendant confirmé. **UI `/admin/salary-items` déjà compatible** : items `pending` affichés (badge « En attente ») + bouton de validation ; saisie manuelle exclut déjà les sources consommées (pas de double). Rollback = DROP des 6 triggers/fonctions autosync + republier `validate_salary_item` version 00031.
- **Fix page Statistiques RH** (commit `1921907`) : le `catch {}` muet masquait la vraie erreur. Remonte désormais message + code Supabase à l'écran/console. Cause « Impossible de charger » pour un admin non reproductible côté données (RLS/colonnes OK, 6 admins actifs pouvant lire) → à diagnostiquer sur le preview avec le message réel.
- **Données corrompues nettoyées** : 2 congés en doublon avec année `20263` (technicien `257ebcc8`, 17/07) supprimés (0 référence, suppression journalisée dans l'historique) ; le congé réel du 17/07 conservé. Total congés approuvés 8 → 6.
- **Géoloc activée** : `NEXT_PUBLIC_LOCATION_SHARING_ENABLED='true'` posée sur Vercel **Preview + Production** (client confirme salariés informés). Effet uniquement après nouveau build ; preview à jour déployé (`richoz-sanitaire-c3hnjze0i…`). En prod, actif seulement après merge sur `main`.
- **Advisor sécurité relancé (23.09)** : les 6 nouvelles fonctions ont `search_path` figé (OK). Elles rejoignent le pattern préexistant « SECURITY DEFINER exécutable via RPC » (23 fonctions-trigger, risque réel nul). **ERROR RLS `lx_prospects` + `activities` toujours ouverte.**

## Session 23.09.2026 (suite) — LOT 8 : config rémunération & fiche nette

- **Débloque la paie (6A/6B/6C)** : la clôture était impossible faute de taux. Décision client : la
  **secrétaire configure la rémunération**. Design : `docs/LOT-8-CONFIG-SALAIRES-DESIGN.md`.
- **Migration `00036_salary_config_and_net.sql`** (additive, appliquée en LOCAL uniquement, PAS en prod) :
  - `employee_salary_config` (par employé, 1 active, historisée inviolable) : `pay_type` mensuel/horaire,
    `monthly_base_chf`, `hourly_rate_chf` (toujours saisi), `overtime_supplement_pct` (défaut 25).
  - `salary_config_component` : liste flexible cotisations/retenues/ajouts (% du brut OU montant fixe,
    contrainte d'honnêteté pct XOR montant). Le 13e salaire = un composant `addition`.
  - `payroll_drafts` +`worked_hours`/`worked_hours_source` (auto rapports validés + correction manuelle)
    +`net_chf` (recalculé par trigger, NULL tant qu'une ligne « à configurer » — net jamais partiel).
  - `payroll_draft_lines` : types `cotisation`/`ajout`, `component_id`, `overridden` (override secrétaire
    **préservé au rafraîchissement**).
  - RPC `generate_payroll_drafts` étendue : base chiffrée (mensuel = fixe ; horaire = heures × taux),
    variables valorisés (sans_solde/retard = min/60×taux ; heures_sup ×(1+suppl%)), cotisations/ajouts,
    net. **Amende = reste « à configurer »** (imputabilité sur salaire = décision humaine, jamais
    auto-déduite ; l'admin l'impute par override).
- **UI** : nouvelle page `/admin/salary-config` (secrétaire/admin) ; `/admin/payroll-drafts` enrichie
  (net affiché, heures éditables pour horaires, override inline d'une ligne). Nav : nouveau groupe
  **« Paie »** visible **au staff (admin + secrétaire)** — `salary-items`/`payroll-drafts` déplacés hors
  `ADMIN_ONLY_ROUTES` (la secrétaire les voyait pas alors qu'elle y a accès) + `salary-config`.
- **Tests réels (stack local, base fraîche)** : `tests/lot8-salary-config.test.cjs` **9/9** ✅ ·
  régression `tests/lot6bc-local.test.cjs` **7/7** ✅ (RPC réécrite sans casse) · `npx tsc --noEmit` code 0 ·
  `npm run build` code 0 (`/admin/salary-config` compilée).
- **Non testé** : (1) le chemin heures **auto** depuis les rapports validés (testé heures=0 → base « à
  configurer », et heures manuelles → base = heures×taux ; PAS la somme réelle de rapports validés, qui
  exige un rapport+intervention réels) ; (2) recette navigateur/rôles réels ; (3) vrais chiffres de paie
  client (taux, cotisations LPP/LAA). **Rien appliqué en prod.**
- **Constat annexe (pas mon lot)** : `tests/lot6a-local.test.cjs` = **7/9** ; les 2 échecs (piquet, sans-solde)
  viennent du trigger **autosync `00035`** (23.09) qui crée déjà ces `salary_items` → la création *manuelle*
  du test (écrit le 18.09, avant l'autosync) duplique la source (index unique). **Test obsolète à mettre à
  jour** (attendre l'item autosync au lieu de le créer), indépendant du lot 8.

## Session 24.09.2026 — LOT 9 (bons de commande) + congés bureau + promotion prod

- **Congés** : la liste chargeait `role='technician'` seulement → les **employés de bureau
  (secrétaire + admin)** n'apparaissaient jamais. Corrigé (`.in('role', [...])` + `is_active`).
- **LOT 9 — Bons de commande fournisseur** (`00037_supplier_orders.sql`) : le technicien enregistre
  fournisseur + note + **photo(s)** du bon/ticket, rattaché à une intervention (dépannage/chantier).
  La secrétaire lit pour facturer et coche **« traité »** (fige le BC côté technicien). Réutilise le
  bucket `photos` (chemins `{uid}/supplier-orders/…`, autorisés par `report_photo_scope`), route
  privée `/api/supplier-order-photos`, composant `SupplierOrders` posé sur : page rapport technicien,
  détail chantier (onglet aperçu), détail intervention (staff). RLS calquée sur les rapports
  (technicien = ses BC pour SES interventions ; staff = tout ; BC traité figé). Décision client :
  contenu **léger** (photo + note + fournisseur), pas de lignes d'articles structurées.
- **Tests réels** : `tests/lot9-supplier-orders.test.cjs` **7/7** ✅ · non-régression lot8 9/9, lot6bc 7/7 ·
  `tsc` 0 · `npm run build` 0.
- **Promotion prod (Vercel)** : constat = **aucun déploiement de prod n'existait sur lots 4-8** (la prod
  servait l'ancien `main` a0a6c85). PR #2 `feat/richoz-reprise-lots-4-7` → `main` **mergée** → build prod.
  URL stable de test : `https://richoz-sanitaire-git-main-tanguylachat-3925s-projects.vercel.app`
  (⚠ protection SSO Vercel active sur `*.vercel.app` → accessible au compte Vercel ; secrétaire = domaine
  custom à prévoir pour un accès sans login). Ancienne prod = `rollback candidate` (retour 1 clic).
- **À appliquer/merger pour ce lot** : migration `00037` en prod + re-merge branche→main (congés + lot 9).

## Compte de test en prod (24.09.2026 — À SUPPRIMER après recette)

- **Technicien démo** créé directement en base prod (auth.users + identity + public.users, mdp hashé
  pgcrypto, login vérifié end-to-end) : `demo.technicien@richoz.test` / `RichozDemo2026!`. Rôle technicien
  actif. **NB** : apparaît donc dans la génération de paie, la liste des congés, etc. (données test).
- **2 interventions test** assignées : « TEST — Dépannage (démo) » et « TEST — Chantier (démo) » — pour
  voir les bons de commande côté technicien (page rapport + chantier) et la localisation.
- **Nettoyage** : supprimer les 2 interventions test, puis le technicien démo (public.users + auth.users)
  quand la recette est finie.
- **Localisation** : `technician_locations` = 0 partage → « on ne voit rien » est NORMAL tant qu'aucun
  technicien n'a activé le partage. C'est de l'avant-plan uniquement (watchPosition tant que la page
  `/technician/location` est ouverte) ; suivi en arrière-plan = app native (hors périmètre, déjà acté).

## Session 24.09.2026 (suite) — localisation + jours fériés + démo

- **Localisation débloquée** : le gate build-var `NEXT_PUBLIC_LOCATION_SHARING_ENABLED==='true'`
  laissait la page technicien désactivée en prod (var non fiable). Passé en **activé par défaut**
  (`!== 'false'`, kill-switch conservé) — feu vert client déjà acté. Partage explicite + avant-plan +
  sans rétention inchangés. Rappel : rien ne s'affiche tant qu'un technicien n'a pas activé le partage.
- **Jours fériés GE 2027 (payés)** : `00038_public_holidays` (table + seed 9 dates, appliquée prod),
  affichés dans le calendrier (mois : fond ambré + badge 🎉 + légende). **Incidence paie NON calculée**
  pour un employé horaire (heures/jour d'un férié = règle client manquante) ; un mensualisé est payé de fait.
  → **décision client en attente** (voir Prochaine action). Années futures : ajouter des lignes dans la table.
- **Interfaces dépannage vs chantier** : différentes PAR DESIGN (dépannage = 1 rapport ; chantier = suivi
  multi-jours à onglets). Bon de commande présent dans les deux. Le compte démo voit les 2 flux via « Aujourd'hui ».
- Compte démo : les 2 interventions test sont datées du jour → visibles dans « Aujourd'hui » de la PWA.

## Prochaine action

- **LOT 8 — `00036` APPLIQUÉE EN PROD (23.09.2026)** via `apply_migration` (projet `yuumzhlvmqcbogqzuonp`).
  Vérifié : counts existants inchangés (users 15, leave_requests 6, interventions 6, salary_items 0,
  payroll_drafts 0 — tables paie vides, zéro perte), 3 tables créées + RLS activée + net_chf/overridden +
  3 triggers. Advisor : mes 3 fonctions ont `search_path` figé, aucune nouvelle ERROR ; l'ERROR RLS
  `lx_prospects`/`activities` reste ouverte (préexistante). Code committé + poussé sur
  `feat/richoz-reprise-lots-4-7` (commit `2d9ffe2`) → preview Vercel se reconstruit.
  **Recette** : la secrétaire saisit ses vrais taux/cotisations sur le **preview** (qui pointe la prod DB).
  **Promotion prod app (main)** = PR `feat/richoz-reprise-lots-4-7` → `main` — NON faite (promeut lots 4→8
  d'un coup, à garder après recette, décision Tanguy). Ensuite : feature **bon de commande fournisseur**
  côté technicien/chantier (2e chantier, cadrage à faire ce soir).
- Recette client par rôle sur le preview déployé ; collecter les décisions client (congés/paie/Bexio/géoloc ci-dessus) ; corriger l'alerte RLS `lx_prospects`/`activities` ; puis PR `feat/richoz-reprise-lots-4-7` → `main` pour promotion prod. Procédure de retour arrière : restaurer depuis `backups/richoz-2026-09-22T08-06-26/` (les migrations sont additives, un rollback = `DROP` des nouveaux objets, jamais nécessaire pour les données existantes).

## Derniers tests (18.09.2026, tous exécutés réellement)

- LOT 5 : `tests/lot5-leave.test.cjs` 6/6 · `tests/lot5-local.test.cjs` 8/8.
- LOT 6A : `tests/lot6a-local.test.cjs` 9/9.
- LOTS 6B/6C : `tests/lot6bc-local.test.cjs` 7/7.
- LOT 4 : `tests/lot4-import.test.cjs` 5/5 + index unique `bexio_nr` vérifié en base.
- LOT 7 : `tests/lot7-local.test.cjs` 3/3.
- À chaque frontière de lot : `npx tsc --noEmit --incremental false` code 0 ; ESLint fichiers du lot 0 erreur (7 avertissements exhaustive-deps préexistants au lot 5, famille des 35 en réserve) ; `npm run build` code 0 (dernier build : toutes les nouvelles pages compilées).
- Non testé : navigateur/appareils réels pour les nouvelles UI (recette) ; fichier Bexio réel ; règles de paie réelles.

## Environnement local

- Stack Supabase : `/private/tmp/richoz-lot5-stage` (`supabase start`, API 127.0.0.1:57321), migrations 00001→00034 appliquées ; clés dans `local-status.json` à côté ; tests via `RICHOZ_LOCAL_STATUS=/private/tmp/richoz-lot5-stage/local-status.json node --test tests/<lot>.test.cjs`.
- Ancien stack `richoz-validation-correction-replay-2026` arrêté (volumes conservés) ; stack `lots-1-2a` intact (ports 563xx).
- Interdits inchangés : pas de Supabase distant, pas de déploiement, pas de commit/push, pas de reset destructif.
