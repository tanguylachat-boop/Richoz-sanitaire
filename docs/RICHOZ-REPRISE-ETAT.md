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

## Prochaine action

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
