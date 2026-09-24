# Richoz — LOT 5 : congés modifiables et historique RH

18 septembre 2026 — **Fonctionnel et testé sur l'environnement local isolé.** Aucun accès distant, aucune migration distante, aucun commit. Reprise après Codex ; lots 1→3B non retouchés.

## Fonctionnement

- **Modification des dates ET des heures** d'un congé (en attente ou approuvé) par admin/secrétaire dans Gestion des congés : dates début/fin, et pour une absence tenant sur un seul jour, heures début/fin (absence partielle). Le technicien peut aussi demander une absence partielle. Un congé multi-jours reste en journées complètes : aucun planning contractuel n'existe dans le dépôt pour placer une frontière horaire multi-jours, aucune règle n'est inventée.
- **Durée unique partagée** (`src/lib/leave-duration.ts`), règle existante du dépôt conservée : jours calendaires × 8 h (« plombier = parfois 6j/7 »), heures réelles plafonnées à 8 h pour un partiel, droit annuel = `annual_leave_weeks` × 5 j × 8 h (défaut 5 semaines déjà en base). Gestion des congés et Statistiques RH utilisent désormais le même calcul — plus de compteurs divergents, recalcul systématique depuis les lignes actuelles (pas de cumul incrémental, donc pas de double décompte après modification).
- **Historique filtrable** (onglet Historique) : collaborateur, type, statut, période ; résumé vacances prises/en cours, futures approuvées, en attente, sans solde approuvé, et solde annuel pour un collaborateur sélectionné (droits de base connus via `annual_leave_weeks`). Dépassement de solde affiché explicitement, jamais masqué.
- **Traçabilité** : table `leave_request_history` remplie par trigger `SECURITY DEFINER` sur `leave_requests` (create/update/delete ; auteur = `auth.uid()`, horodatage, anciennes/nouvelles valeurs ; les updates sans changement effectif ne sont pas journalisés). Affichée par congé (« Modifications »). L'historique survit à la suppression du congé. Le `audit_log` générique (lecture admin seul, insertion ouverte) n'a pas été retenu pour cette traçabilité.
- **Conflits** : trigger serveur refusant tout chevauchement de congé de **même type** (pending/approved) pour le même collaborateur (`CHEVAUCHEMENT_CONGE`, message clair côté UI). Un type différent (ex. maladie pendant des vacances) reste possible — cas réel, à arbitrer par la secrétaire. Les données préexistantes ne sont pas modifiées.
- **Sans solde** : distinct visuellement (badge existant) et dans le résumé ; les congés `sans_solde` approuvés sont identifiables (type + durée calculable) pour la future consommation paie. **Aucun tarif, aucune retenue** : rien n'existe ni ne s'active tant que la règle salariale n'est pas validée. Aucune déduction des vacances payées.
- **Correctif RLS préexistant** : la policy du restore n'autorisait que les insertions `status='pending'`, alors que le formulaire technicien enregistre maladie/accident auto-validés depuis le lot antérieur. Policy `leave_self_declared` ajoutée, strictement limitée à `technician_id = reviewed_by = auth.uid()` et `leave_type IN ('maladie','accident')`. Aucun autre droit élargi ; l'auto-approbation de vacances reste refusée (testée).

## Fichiers

- Migration : `supabase/migrations/00030_leave_partial_and_history.sql` (additive).
- Ajoutés : `src/lib/leave-duration.ts`, `tests/lot5-leave.test.cjs`, `tests/lot5-local.test.cjs`, ce bilan.
- Modifiés : `src/app/(dashboard)/leave/page.tsx`, `src/app/(dashboard)/technician/leave/page.tsx`, `src/app/(dashboard)/admin/stats/page.tsx`, `src/types/database.ts` (types congés + historique).
- Non modifiés volontairement : `src/lib/leave-utils.ts` et le calendrier (disponibilité au niveau du jour ; une absence partielle marque toujours le technicien absent ce jour-là dans le planning — limite affichée ci-dessous), moteur 3A/3B, migrations antérieures.

## Tests et preuves (exécutés réellement le 18.09.2026)

| Contrôle | Résultat |
|---|---|
| Unitaires lib durée (`node --test tests/lot5-leave.test.cjs`) | **6/6** : validation intervalles, jours calendaires + clip annuel + bissextile, heures partielles/plafond/clip, droit annuel, formatage |
| Intégration Supabase local (`tests/lot5-local.test.cjs`) | **8/8** sur stack `/private/tmp/richoz-lot5-stage` (127.0.0.1:57321, **31 migrations rejouées dont 00030**) : technicien pending OK / maladie auto-validée OK / auto-approbation vacances refusée / création pour un collègue refusée ; UPDATE technicien filtré par RLS (donnée intacte vérifiée par clé service) ; édition secrétaire dates+heures **persistée après reconnexion réelle** ; historique create/update/delete avec auteur et old/new ; écritures client sur l'historique refusées ; lecture historique limitée au concerné ; chevauchement même type refusé, autre type accepté ; contraintes heures multi-jours / fin ≤ début refusées ; sans solde approuvé identifiable sans colonne de montant |
| TypeScript (`npx tsc --noEmit --incremental false`) | **Code 0** |
| ESLint (fichiers du lot) | **0 erreur**, 7 avertissements `react-hooks/exhaustive-deps` préexistants (famille des 35 en réserve, non nettoyés) |
| Build (`npm run build`) | **Code 0** |

Cas d'acceptation couverts : modification d'une absence partielle (5 j → 1 jour 08:00–12:00) et d'une absence multi-jours, recalcul historique/solde cohérent (même lib partout), droits serveur testés en sessions ordinaires (pas seulement clé privilégiée), persistance après reconnexion. Aucune période de paie n'existe encore en base : le garde-fou « paie figée » sera posé avec les tables de paie (lot 6B), l'historique 00030 permettant déjà de justifier tout écart.

## Limites et recette client restante

- Interface vérifiée par typage/build et logique testée ; **pas de passage navigateur/appareils réels dans ce lot** (à faire en recette comme pour les lots précédents).
- Une absence partielle marque le technicien indisponible **toute la journée** dans le calendrier/planification (mécanisme existant conservé) — à confirmer avec le client s'il veut une granularité horaire côté planning.
- Durées basées sur la règle existante (jours calendaires × 8 h). Si le client fournit horaires contractuels/temps partiels/jours non travaillés, seule `src/lib/leave-duration.ts` est à adapter.
- Le solde utilise `annual_leave_weeks` (défaut 5 semaines, réglable par employé dans Admin) ; un droit différent doit y être saisi, pas inventé.
- Chevauchements de types différents autorisés volontairement (maladie pendant vacances) ; la déduction du solde ne compte que le type Congé, comme avant.

**Aucun envoi externe, aucune retenue salariale, aucun automatisme distant activé.**
