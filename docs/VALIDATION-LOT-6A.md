# Richoz — LOT 6A : saisie des éléments variables de salaire

18 septembre 2026 — **Saisie fonctionnelle et testée sur l'environnement local isolé.** Aucune retenue automatique, aucun taux inventé, aucun envoi externe.

## Fonctionnement

Nouvelle page **Éléments de salaire** (`/admin/salary-items`, garde serveur `requireAdminOrSecretary`, lien Sidebar admin) : filtre mois/collaborateur/type, totaux du mois validés, saisie, validation/refus/annulation.

| Élément | Implémenté | Règle appliquée / manquante |
|---|---|---|
| **Piquet** | Consommation d'une semaine `piquet_schedule` existante (source unique). Montant **imposé par le serveur : 150 CHF × semaines complètes** (150 pour 7 j, 300 pour 14 j) ; un montant saisi à la main est ignoré. | Règle client validée (150/semaine complète). **Semaine partielle refusée** (`PIQUET_SEMAINE_INCOMPLETE`) : prorata/partage/remplacement non définis, à faire valider. |
| **Sans solde** | Consommation d'un congé `sans_solde` **approuvé** (lot 5) ; durée dérivée du congé par le serveur (jours × 480 min, partiel réel plafonné — même règle que `src/lib/leave-duration.ts`, répliquée en SQL `leave_request_minutes`). | Aucun montant : base de calcul/traitement à valider (`requires_rule`). |
| **Retard** | Heure attendue + heure réelle → minutes calculées serveur ; motif/justification/récupération ; validation. | Aucun effet salarial automatique, aucun montant accepté (`requires_rule`). |
| **Amende parking** | Date, montant CHF (`NUMERIC(10,2)`, convention du dépôt), justificatif texte, collaborateur, état d'examen. | La saisie ne vaut pas retenue ; imputabilité/compensation à examiner (`requires_rule`). |
| **Heures sup.** | Minutes entières (pas d'arrondis cumulés), origine, approbation, compensation `paid`/`recovered`/`pending_rule`. | Taux/majoration/CCT non choisis (`requires_rule`), aucun montant calculé. |

Garanties structurelles (migration `00031_salary_items.sql`) :
- **Pas de double décompte** : index unique `(item_type, source_id)` hors éléments annulés/refusés — un même congé sans solde ou une même semaine de piquet ne peut être consommé qu'une fois ; l'annulation libère la source.
- **Appartenance** : trigger refusant un élément dont la source appartient à un autre collaborateur (`MAUVAIS_COLLABORATEUR`) ou une source non approuvée (`SOURCE_INVALIDE`).
- **Paie figée** : un élément `payroll_status='included'` (posé par le futur moteur 6B) n'est ni modifiable ni supprimable (`PAIE_FIGEE`) — corrections par régularisation explicite au lot 6B.
- **Historique inviolable** `salary_item_history` (même modèle que le lot 5 : trigger SECURITY DEFINER, aucune écriture client, lecture admin/secrétaire + intéressé).
- **RLS** : écriture admin/secrétaire uniquement ; le technicien voit ses propres éléments (lecture seule).
- **Trace d'intégration paie** : `payroll_status` / `payroll_reference` / `payroll_processed_at` préparés pour 6B.

**Demande client conservée mais non activée** : aucune pénalité salariale automatique liée à un rapport manquant n'existe (rappels/suivi 3A inchangés).

## Fichiers

- Migration : `supabase/migrations/00031_salary_items.sql` (additive).
- Ajoutés : `src/app/(dashboard)/admin/salary-items/{layout,page}.tsx`, `tests/lot6a-local.test.cjs`, ce bilan.
- Modifiés : `src/lib/constants.ts` (lien sidebar admin), `src/types/database.ts` (types `salary_items`, `salary_item_history`).

## Tests et preuves (exécutés réellement le 18.09.2026)

| Contrôle | Résultat |
|---|---|
| Intégration Supabase local (`tests/lot6a-local.test.cjs`, stack 127.0.0.1:57321, migration 00031 appliquée par `supabase migration up`) | **9/9** : semaine complète = 150 CHF et 14 j = 300 CHF (montant saisi 9999 ignoré) ; semaine 5 j refusée ; mauvais technicien refusé ; doublon de source refusé ; sans solde 2 j = 960 min et partiel 2 h = 120 min, congé pending refusé, double consommation refusée ; retard 25 min calculé, incohérence refusée, montant forcé à NULL ; amende 120.50 CHF, sans montant refusée ; heures sup 90 min `pending_rule` ; RLS technicien (insert/update refusés, lecture limitée à soi, historique protégé) ; annulation puis re-création sans doublon avec trace ; paie figée non modifiable/supprimable ; approbation tracée avec auteur ; type inconnu refusé |
| TypeScript (`npx tsc --noEmit --incremental false`) | **Code 0** |
| ESLint (fichiers du lot) | **0 erreur, 0 avertissement** |
| Build (`npm run build`) | Voir dernière ligne du log de session — code 0 attendu, consigné dans `docs/RICHOZ-REPRISE-ETAT.md` |

## Limites et décisions en attente (consignées une fois, voir aussi RICHOZ-REPRISE-ETAT.md)

- Semaines de piquet partagées/partielles, remplacements, prorata et rattachement en coupure de période : **refusés à la saisie** tant que la règle n'est pas validée.
- Taux heures sup (CCT), traitement des retards, imputabilité des amendes, tarif sans solde : éléments saisis et approuvables, mais marqués **« Règle à configurer »** — le lot 6B ne les intégrera au brouillon qu'avec une règle validée.
- Justificatif d'amende = référence texte ; aucun upload de fichier ajouté (aucun système de pièces jointes RH n'existe, pas de nouveau module inventé).
- Interface non passée au navigateur réel dans ce lot (recette à faire) ; la logique critique est serveur et testée en intégration.
