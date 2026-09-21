# Richoz — LOT 3A : suivi des rapports et rappels internes

15 septembre 2026. **Implémentation et essais locaux terminés ; automatisation non activée chez le client.** Aucun AGENTS.md applicable trouvé dans le dépôt ni ses parents. Lecture ciblée du PRD et des bilans précédents ; aucun nouvel audit des lots 1/2A/2B.

## Règles établies et limites métier

| Élément observé dans le dépôt | Comportement du lot 3A |
|---|---|
| `interventions.technician_id` est le responsable principal ; les droits de rédaction utilisent cette affectation | Destinataire relu côté serveur avant chaque rappel ; aucune obligation par membre d’une équipe |
| Les rapports sont liés à une intervention ET à leur auteur ; aucune unicité par intervention n’est imposée | Une ligne de suivi par intervention ; plusieurs rapports donnent un cas à clarifier, sans rappel ni sélection automatique d’une obligation supplémentaire |
| Types `depannage` et `chantier`, avec parcours de rapport existants ; le PRD distingue les documents de chantier | Aucun de ces types n’entraîne à lui seul une obligation. La règle exhaustive des types concernés reste inconnue |
| Le formulaire peut soumettre en laissant l’intervention `en_cours`, ou passer à `termine` avec `date_completed` si travail terminé | Soumission et fin d’intervention sont distinctes ; aucune déduction depuis `date_end` ou une fin prévisionnelle passée |
| `draft`, `submitted`, `rejected`, `validated` existent déjà | Libellés calculés ci-dessous ; aucun nouvel état métier de rapport stocké |
| Une correction sauvegardée en brouillon conserve `revision_requested=true` ; la resoumission le remet à false et conserve le commentaire | Le brouillon de correction reste « À corriger ». La resoumission arrête les rappels de ce cycle |
| Rôles `admin`, `secretary`, `technician` ; pas de rôle « responsable » distinct | Suivi global et actions réservés aux admin/secrétaires actifs |
| Aucun délai ni déclencheur exhaustif de remise établi | Paramètres sans valeur métier par défaut ; aucune tâche automatique ajoutée |

### Périmètre visible et confirmations

- Un rapport existant est suivi comme travail commencé : **Brouillon — non envoyé**, **À corriger**, **Envoyé — à valider**, **Validé**. Un rapport envoyé ou validé n’est jamais rappelé pour défaut d’envoi.
- **Rapport attendu — absent** exige une confirmation explicite de la secrétaire/admin, avec date de référence et échéance facultative. Le formulaire confirme explicitement **une obligation commune à l’intervention**, portée par son responsable principal : ce n’est pas une cardinalité générale déduite du schéma.
- Les interventions sans rapport aux états `termine`, `facture`, `ready_to_bill`, `billed` sont seulement des **candidates à qualifier**, présentées séparément. Ces états n’activent aucune obligation. Une intervention planifiée dont la fin estimée est passée n’est pas candidate sur ce seul motif.
- Le formulaire permet de confirmer les candidates affichées ou de définir la référence d’un rapport déjà commencé. La fonction serveur contrôlée accepte aussi une demande explicite pour une autre intervention non annulée ; aucune création massive n’est prévue.
- Les interventions annulées et sans obligation confirmée sont exclues du suivi principal et des rappels. Les données manquantes, responsables absents/inactifs, rapports multiples, commentaires de retour manquants et auteurs différents après réaffectation sont signalés et non rappelés. Un statut de rapport absent est « Données à vérifier », jamais « rapport absent ».
- Pour les rapports multiples, le lien affiché ouvre un rapport identifié pour inspection ; il ne désigne pas un rapport considéré comme l’unique obligation. La résolution de ce cas reste métier.

## Fonctionnement livré

### Vue `/reports/followup`

Nouvel onglet **Suivi** dans le module Rapports : intervention/chantier, responsable, état, référence, échéance, dernier rappel, lien précis du rapport ou de l’intervention. Filtres technicien/état, tri chronologique réel avec dates inconnues en dernier. Le compteur d’éléments affichés et celui des remises/corrections actives utilisent exactement la liste filtrée. Les notifications et cycles ne multiplient pas les lignes.

Chargement, erreur avec reprise, liste vide, confirmation explicite et bouton Rappeler. Navigation mobile conservée avec onglets défilables ; contrôle visuel à 390 × 844 et 1365 × 960. La liste est obtenue par une fonction SQL contrôlée, jamais par une clé serveur dans le navigateur.

### Rappel manuel

L’utilisateur autorisé renseigne un **intervalle minimal en minutes, sans valeur préremplie**, puis choisit Rappeler. Ce choix est conservé dans l’historique sous forme de prochaine date autorisée : une action ultérieure ne peut pas raccourcir ce délai déjà engagé. Aucun premier délai, limite métier ou rappel quotidien n’est imposé aux actions manuelles. Une règle commune de rappel manuel reste à décider avant généralisation.

Le serveur vérifie la session active, l’obligation, le statut, le responsable et la fraîcheur de la vue. Verrou React contre double clic, puis verrou transactionnel sur l’intervention et comparaison du dernier rappel attendu. Un client avec une ancienne vue doit recharger. Les écritures de rapport prennent le même verrou d’intervention ; annulation et réaffectation sérialisent également avec la création du rappel.

La notification identifie l’intervention et la remise attendue, sans adresse, coordonnées ou données de paiement supplémentaires. Un brouillon est nommé comme tel. Une correction réutilise `revision_requested`, le commentaire `revision_message` et le lien `?report_id=` du lot 1. Les rappels de brouillon ouvrent aussi le rapport exact. Aucun appel à `sendPush`, webhook, email, SMS ou canal externe ajouté.

### Historique et cycles

Notification et historique sont insérés dans **une même transaction**. Contrainte unique `(intervention_id, cycle, window_at)` et unicité du lien de notification. Les fenêtres reposent sur un intervalle en secondes ; le délai minimal persistant protège aussi les changements de fenêtre et de paramètres. Deux exécutions concurrentes ne valident qu’un rappel.

L’absence et le premier brouillon partagent le cycle de remise. Un nouveau retour après soumission ouvre un nouveau cycle ; les sauvegardes de correction n’en ouvrent pas. L’intervalle minimal persiste entre cycles, tandis que la limite éventuelle de répétition s’applique par cycle. Aucun statut de rapport n’est modifié pour suivre une notification.

Un échec annule toutes les écritures de la transaction. Une nouvelle tentative peut créer le rappel ; si la réponse précédente a été perdue après validation, la fraîcheur de la vue et l’historique empêchent un doublon.

### Moteur automatique préparé

- Fonction SQL `run_report_reminders` : rôle `service_role` uniquement ; simulation par défaut ; exécution refusée sans `enabled=true` explicitement transmis côté serveur.
- Point d’entrée **POST `/api/cron/report-reminders`**, secret dédié `REPORT_REMINDERS_SECRET`, comparaison constante, aucun GET déclencheur.
- `REPORT_REMINDERS_ENABLED` est absent par défaut. L’exécution est refusée tant qu’il ne vaut pas exactement `true`. Les requêtes ne peuvent pas remplacer la configuration ni la date de mise en service.
- `REPORT_REMINDERS_CONFIG` est une configuration JSON serveur : `first_delay_seconds`, `interval_seconds`, `max_repetitions` (null pour absence de limite), `activation_at` (instant avec fuseau explicite).
- Premier rappel calculé après le plus tardif de la référence, du début du cycle et de l’échéance explicite, auquel s’ajoute le premier délai. Les répétitions respectent le minimum enregistré et la limite du cycle. Ce choix de calcul est **à valider métier avant activation**.
- Simulation : obligations repérées, `would_create`, exclusions et raisons. Aucun historique, notification ou faux indicateur de succès créé. Les verrous temporaires ne persistent pas.
- Une référence antérieure à `activation_at` reste visible mais exclue des rappels automatiques, même lors d’une nouvelle correction. Le rattrapage historique n’est pas branché ; une action manuelle explicite reste possible pour une obligation établie.
- Aucun ajout à `vercel.json`, aucun cron SQL, aucune plateforme ou tâche distante.

Exemple **fictif de recette**, non recommandé comme règle métier et non installé dans le dépôt :

```json
{
  "first_delay_seconds": 3600,
  "interval_seconds": 3600,
  "max_repetitions": 3,
  "activation_at": "2030-01-01T00:00:00+01:00"
}
```

La route autorisée accepte `{"simulation":true}`. Les tests de persistance appellent aussi le moteur avec horloge contrôlée et paramètres fictifs pour vérifier les créations réelles locales. Aucun ordonnanceur n’a été activé, même localement.

## Données, migration et sécurité

Migration additive [00029_report_followup.sql](../supabase/migrations/00029_report_followup.sql), uniquement sur les instances Docker fictives des lots précédents : API 56321 / DB 56322 et instance de rejeu API 57321 / DB 57322. Aucun reset, suppression de volume ou modification de migration antérieure.

Trois petites tables distinctes sont nécessaires : confirmation explicite (`report_expectations`), identifiant de cycle (`report_followup_cycles`), envois atomiques (`report_reminder_history`). Les rappels d’agenda existants `intervention_reminders` ne représentent ni cette obligation ni ses garanties atomiques ; ils restent inchangés. Les notifications existantes sont réutilisées.

Tables sous RLS sans accès direct des profils applicatifs. Fonctions privées explicitement révoquées pour `PUBLIC`, `anon`, `authenticated`, `service_role` ; seuls les points d’entrée nécessaires sont réaccordés. Les appels staff contrôlent eux-mêmes le profil actif. Lecture des notifications limitée au destinataire selon les politiques antérieures. Aucun changement des politiques/guard de correction-resoumission des rapports.

Un trigger distinct interdit aux profils non staff d’annuler ou réaffecter une intervention : ils ne peuvent pas retirer leur propre obligation par ces champs. Les autres mises à jour du parcours de remise sont conservées.

Le SQL final a été appliqué puis ajusté uniquement pendant le développement de **cette nouvelle migration locale**. Le registre local de cette entrée contient désormais le fichier final ; les registres antérieurs sont intacts. Le rejeu utilise le numéro local `20260914000030`, suivant la numérotation déjà utilisée par cette instance.

Preuves : [permissions effectives et contraintes](validation-lot-3a/sql-permissions.log), [schéma final](validation-lot-3a/schema-final.log), [schéma de rejeu](validation-lot-3a/schema-replay-final.log). Empreintes des fonctions identiques ; empreinte du SQL enregistré identique à celle du fichier final ; zéro fenêtre en double et zéro historique orphelin.

## Tests et résultats

| Nature | Résultat | Preuve |
|---|---|---|
| Unitaire/simulé : 3 nouveaux tests et 58 régressions pertinentes | **61/61** | [journal](validation-lot-3a/unit-and-regressions.log) |
| Persistance et appels API Supabase réels, 6 groupes 3A | **6/6** | [journal](validation-lot-3a/integration.log) |
| Panne réelle avant notification, puis après notification avant historique | **2 cas réussis**, rollback/reprise/unicité ; fixtures et triggers de faute annulés en fin de test | [journal SQL](validation-lot-3a/failure-retry.log) |
| Régressions locales réelles rapports/photos | **3/3** | [journal](validation-lot-3a/report-regressions-local.log) |
| Chromium desktop/mobile et route HTTP | **5 groupes réussis** | [journal](validation-lot-3a/browser.log) |
| TypeScript `--noEmit --incremental false` | **Code 0** | [journal](validation-lot-3a/typescript.log) |
| ESLint sur tout `src`, directives actives | **0 erreur, 35 avertissements préexistants** | [résultats](validation-lot-3a/eslint.json) |
| Build Next de production isolé | **Code 0** | [journal](validation-lot-3a/build.log) |
| Identité des sources navigateur/build avec le dépôt | **Aucune différence** | [navigateur](validation-lot-3a/app-source-check.json), [build](validation-lot-3a/build-source-check.json) |

Les 6 groupes persistants couvrent les 12 cas demandés, avec le test SQL complémentaire pour la panne : absence confirmée, brouillon sans doublon, envoyé/validé sans rappel, correction/commentaire exact, brouillon de correction, resoumission et nouveau cycle, annulation, obligation inconnue, responsable manquant, statut manquant, rapports multiples, réaffectation avec/sans rapport, actions simultanées de deux responsables, deux moteurs concurrents, reprise et limites, historique antérieur à l’activation, refus directs et notifications d’autrui, échéance explicite, minuit Zurich et changements d’heure de mars/octobre 2030.

Les dates sont contrôlées sans attendre une échéance réelle. Les durées sont des secondes écoulées, pas des jours ouvrés. Le formulaire convertit l’heure de Zurich indépendamment du fuseau du navigateur ; les heures inexistantes et les heures répétées d’automne sont refusées explicitement.

Parcours visuels : [desktop](validation-lot-3a/desktop.png), [mobile suivi](validation-lot-3a/mobile-followup.png), [carte mobile](validation-lot-3a/mobile-followup-card.png), [correction mobile](validation-lot-3a/mobile-correction.png). Chargement retenu par interception contrôlée, erreur/reprise, vide, filtres, confirmation réelle, double clic et notification persistée, lien intervention, lien correction et commentaire, refus du suivi technicien, absence de débordement horizontal. Simulation HTTP autorisée vérifiée sans écriture ; appel non autorisé refusé ; exécution réelle de la route désactivée.

Le build et les tests réseau/navigateur tournent dans des copies `/private/tmp/richoz-lot3a-l2mdyua4/{app,build}` sous `sandbox-exec` localhost-only. Les seuls paramètres Supabase proviennent des conteneurs fictifs locaux. Le `.env.local` du dépôt n’a pas été lu ni copié. Docker Desktop a été démarré ; les autres conteneurs ont seulement été inventoriés. Aucun téléchargement ni dépendance ajouté. L’application locale de revue reste sur `http://127.0.0.1:56300/reports/followup` avec des comptes fictifs.

Les premiers essais ont permis de corriger une référence de variable SQL, les droits Supabase par défaut et les attentes du harnais navigateur ; les résultats ci-dessus correspondent aux versions finales réussies. Les avertissements existants n’ont pas été nettoyés. L’exclusion TypeScript historique de `src/app/api/webhooks` reste inchangée.

## Fichiers propres au lot et préservation

La [comparaison avec l’entrée](validation-lot-3a/changes.json) distingue ce lot des modifications Git préexistantes : **5 fichiers existants modifiés**, **8 fichiers ajoutés** hors documentation ; aucun fichier d’entrée disparu, **182 fichiers inchangés** dans le périmètre sauvegardé. Sauvegarde d’entrée `/private/tmp/richoz-lot3a-l2mdyua4/entry`, empreintes dans [entry.json](validation-lot-3a/entry.json). Package et lockfile inchangés.

Modifiés :

- `src/types/database.ts` : signatures des quatre RPC publiques prévues.
- `src/lib/report-feedback.ts` et `src/app/(dashboard)/technician/notifications/page.tsx` : routage précis des rappels de brouillon/absence ; parcours de correction existant réutilisé.
- `src/app/(dashboard)/reports/layout.tsx` : onglet Suivi et navigation mobile.
- `src/app/(dashboard)/calendar/page.tsx` : ouverture de l’intervention précisément identifiée depuis le suivi, en réutilisant la fiche existante.

Ajoutés :

- `src/lib/report-followup.ts`, `src/app/(dashboard)/reports/followup/page.tsx`.
- `src/app/api/cron/report-reminders/route.ts`.
- `supabase/migrations/00029_report_followup.sql`.
- `tests/lot3a.test.cjs`, `tests/lot3a-local.test.cjs`, `tests/lot3a-failure.sql`, `tests/lot3a-browser.cjs`.
- Ce bilan et les preuves sous `docs/validation-lot-3a/`.

## Décisions et recette restantes avant activation

1. Confirmer les types réellement concernés et l’événement métier de remise. Valider le traitement des interventions en cours et le périmètre de la confirmation commune.
2. Décider la cardinalité intervention/technicien/rapport et résoudre les interventions à rapports multiples ; définir la reprise après réaffectation et le traitement des obligations confirmées par erreur.
3. Valider la date de référence et le calcul après échéance/cycle, les secondes écoulées versus une règle en jours ouvrés, le premier délai, le minimum entre rappels, la limite par cycle et la règle commune des rappels manuels.
4. Choisir une date de mise en service explicite. Tout historique à reprendre doit faire l’objet d’une action distincte ; il n’est pas inclus automatiquement.
5. Recette secrétaire/responsable/technicien sur appareils réels et données fictives, notamment calendrier et corrections. Contrôler le volume de la liste et la durée d’une transaction de traitement avant une utilisation à grande échelle.
6. Examiner le futur environnement cible et l’application de la migration dans un travail séparément autorisé ; définir la supervision des erreurs/reprises avant tout branchement d’un ordonnanceur. Aucun environnement distant n’a été inspecté dans ce lot.

**État exact : simulable localement, moteur et créations testés localement, route simulée localement, automatismes non activés et aucun déploiement client.** La reconnaissance vocale réelle sur téléphone reste la réserve du lot 2B et ne bloque pas 3A. Aucun rapport journalier, paie, pénalité, retenue salariale, géolocalisation, import Bexio ou nouvelle dictée développé. Aucun commit, push, envoi externe, migration distante ou opération destructive. Arrêt au lot 3A.
