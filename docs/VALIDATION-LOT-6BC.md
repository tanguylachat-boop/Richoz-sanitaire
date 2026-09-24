# Richoz — LOTS 6B/6C : brouillon de paie et génération du 25

18 septembre 2026 — **Plomberie et calculs déterministes livrés et testés en local. Aucune génération automatique planifiée, aucune règle salariale inventée.**

## Constat structurant (consigné une fois)

Le dépôt ne contient **aucun moteur de paie, aucune fiche existante, aucun salaire de base ni cotisation**. Conformément à la passation (« réutiliser le moteur existant », « ne pas reconstruire une paie suisse complète depuis zéro »), le brouillon livré est une **fiche d'éléments variables** par salarié/période avec lignes détaillées et sources — le socle sur lequel les règles validées (salaire de base, cotisations, taux) pourront être configurées. Chaque paramètre absent apparaît **« à configurer »**, jamais en montant inventé ni faux zéro.

## Fonctionnement

- **Fenêtre 26 → 25** (migration `00032`, RPC `generate_payroll_drafts(p_reference, p_dry)`) : éléments du 26 du mois précédent au 25 courant inclus. *Interprétation de travail à confirmer avant activation* — la date de référence et l'heure d'exécution viennent de l'appelant, jamais du code.
- **Idempotence** : une fiche par salarié/période/version (`UNIQUE`), `ON CONFLICT DO NOTHING`, rafraîchissement des brouillons non validés — deux exécutions ne dupliquent rien ; un événement approuvé plus tard le même 25 est repris au rafraîchissement.
- **Lignes détaillées** : salaire de base (placeholder « à configurer »), puis chaque élément 6A approuvé de la fenêtre avec minutes, source (`salary_item_id` + `source_snapshot` figeant les valeurs utilisées — justification du calcul). Montant repris **uniquement** quand la règle est validée (piquet 150 CHF/semaine) ; sinon `requires_rule`.
- **Clôture honnête** : la validation est **refusée** (`VALIDATION_INCOMPLETE`) tant qu'une ligne « à configurer » subsiste. À la validation : fiche et lignes figées (`PAIE_FIGEE` sur update/delete), éléments intégrés passés `payroll_status='included'` avec référence — eux-mêmes figés par le trigger 6A.
- **Régularisation** : un élément approuvé après clôture génère une **version suivante explicite** (`is_regularization`, note traçable), sans jamais retoucher la fiche validée ni déplacer silencieusement la paie figée.
- **Déclenchement** : bouton « Générer / actualiser » sur la page admin `/admin/payroll-drafts` (garde `requireAdminOrSecretary` + RLS staff), ou route `/api/cron/payroll-drafts` (POST, secret `PAYROLL_DRAFTS_SECRET`, simulation par défaut, activation réelle conditionnée à `PAYROLL_DRAFTS_ENABLED=true`) — **volontairement absente de vercel.json**, même modèle que les rappels 3A. Aucun paiement, aucun envoi salarié, aucun cron distant.
- **Confidentialité** : brouillons lisibles par admin/secrétaire uniquement ; la diffusion aux salariés est une décision client non prise.

## Fichiers

- Migration : `supabase/migrations/00032_payroll_drafts.sql` (additive).
- Ajoutés : `src/app/(dashboard)/admin/payroll-drafts/{layout,page}.tsx`, `src/app/api/cron/payroll-drafts/route.ts`, `tests/lot6bc-local.test.cjs`, ce bilan.
- Modifiés : `src/lib/constants.ts` (lien sidebar), `src/types/database.ts` (types + RPC).

## Tests et preuves (exécutés réellement le 18.09.2026)

| Contrôle | Résultat |
|---|---|
| Intégration Supabase local (`tests/lot6bc-local.test.cjs`, migration 00032 appliquée via `supabase migration up`) | **7/7** : simulation sans écriture avec périmètre annoncé ; frontière exacte (26 précédent et 25 courant DANS la fenêtre, 25 précédent et 26 courant DEHORS) ; salaire de base « à configurer » sans faux zéro ; snapshot source justifiant chaque ligne ; double exécution sans doublon et reprise d'un élément tardif du 25 ; clôture refusée avec lignes non résolues ; clôture après résolution simulée → éléments figés + fiche/lignes non modifiables ; correction post-clôture → régularisation v2 explicite sans double salaire de base, v1 intacte ; technicien sans lecture ni génération ; bascule d'année (réf. 25.01.2037 → 26.12.2036–25.01.2037) |
| TypeScript | **Code 0** |
| ESLint (fichiers du lot) | **0 erreur, 0 avertissement** |
| Build | Code 0 (voir RICHOZ-REPRISE-ETAT.md) |

## Décisions restantes avant activation (voir RICHOZ-REPRISE-ETAT.md, ne pas redemander)

Fenêtre 26→25 contractuelle ; heure de génération et heure de clôture du 25 ; salaire de base, cotisations et distinctions brut/net du modèle cible ; taux heures sup/CCT ; traitement retards ; imputabilité amendes ; tarif sans solde ; format de document de fiche à reprendre (aucun n'existe dans le dépôt) ; destinataires/diffusion. **Une génération préparée et testée localement n'est pas annoncée active chez le client.**
