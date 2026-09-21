# Richoz — LOT 3B : bilan journalier

16 septembre 2026 — **Bilan consultable et calculé automatiquement en local.** Aucun envoi quotidien ni diffusion programmée. Aucun AGENTS.md applicable trouvé ; consultation ciblée du bilan 3A et des modèles nécessaires, sans nouvel audit des lots antérieurs.

## Fonctionnement

Nouvel onglet **Bilan journalier** dans Rapports, accessible aux admin et secrétaires actifs : date Zurich (aujourd’hui par défaut), jours précédent/suivant, filtre technicien, actualisation horodatée, synthèse, dossiers détaillés, détail par responsable, chargement/erreur/reprise et journée vide. Interface vérifiée sur Chromium desktop et viewport mobile.

Le filtre et les sous-totaux utilisent le **responsable principal actuellement affecté** (`interventions.technician_id`). L’auteur de chaque rapport est affiché séparément. Le modèle examiné ne contient ni équipe multi-affectée par intervention, ni clé d’entreprise/tenant dans ces tables : aucune équipe, affectation historique ou nouvelle séparation d’entreprises n’est inventée. Les sessions et RLS existantes sont conservées.

## Indicateurs, définitions et sources

| Indicateur | Source et définition |
|---|---|
| Planifiées, hors annulations | `interventions.date_planned` dans la journée, ou période explicite `date_planned → date_end` qui la chevauche ; statut actuel non annulé |
| Fins datées pour ce jour | `date_completed` dans la journée **et** statut actuel `termine`, `facture`, `ready_to_bill` ou `billed` ; annulations exclues |
| Rapports créés ce jour | `reports.created_at` dans la journée ; inclut les brouillons, ne signifie pas « envoyés » |
| Rapports envoyés ce jour | **Indisponible / null**, jamais zéro de substitution : pas de date de soumission dédiée exploitable dans le modèle/parcours |
| État du rapport et points à traiter | Résultat de la RPC **3A inchangée** `get_report_followup` ; son champ `exclusion` décide des obligations actuellement actives |

Une intervention n’est comptée qu’une fois par indicateur, grâce à son ID, même lorsqu’elle apparaît dans plusieurs requêtes ou possède plusieurs rapports. Les rapports sont également dédupliqués par ID. Une durée planifiée n’est pas présentée comme du travail ; aucun total d’heures n’est calculé.

**Période : minuit Europe/Zurich inclus → minuit suivant exclu**, convertis séparément en UTC (journées de 23/24/25 heures). Une intervention multijour avec fin explicite apparaît chaque jour chevauché ; une fin exactement à minuit n’inclut pas le jour suivant. Sans fin explicite, seule la journée du début est retenue. Les interventions annulées restent identifiables dans le détail.

## Couverture et historique

- Planification, responsable, statuts et date de fin sont les **valeurs actuellement enregistrées**, même pour un jour passé. La date de fin peut être remplacée/effacée par le parcours existant : ce bilan n’est pas un historique exhaustif des réalisations ou un document figé à l’époque.
- Les interventions de la sélection déclarées terminées sans date de fin sont signalées comme non datables et ne sont pas attribuées arbitrairement au jour consulté.
- Ni `updated_at` ni la création d’un rapport ne servent de date d’envoi. Le journal technique `audit_log` n’est pas utilisé pour reconstruire les soumissions : sa lecture est réservée aux admin et ses insertions ne distinguent pas un événement certifié du trigger d’une insertion directe. Aucune historisation ni permission supplémentaire n’est ajoutée.
- Le détail montre notamment un rapport actuellement envoyé sur une intervention terminée la veille. Son **création** figure à sa date propre ; sa date d’envoi reste inconnue. Le cas d’acceptation « fin un jour, envoi le lendemain » est donc vérifié avec cette limite explicite, sans prétendre reconstituer l’événement d’envoi.
- Les points actifs des interventions de la journée sont séparés de l’**arriéré actuellement ouvert hors de cette journée**, toutes dates confondues. L’arriéré n’est jamais présenté comme celui d’une clôture passée.
- Les absences ne concernent que les obligations confirmées selon 3A ; brouillons/corrections déjà ouverts sont également suivis. Absence de points actifs ne signifie ni « tous les rapports reçus » ni conformité de 100 %. Les règles générales et réserves métier 3A restent inchangées.

## Lecture et sécurité

`GET /api/reports/daily` contrôle la session, le profil actif et le rôle côté serveur ; dates et identifiants de filtre sont validés. Client Supabase de session ordinaire, **sans clé privilégiée**. Réponse privée `no-store`, route dynamique, pas de cache partagé. POST refusé.

Requêtes de journée bornées par planification/réalisation/création ; compléments regroupés par IDs, sans requête par ligne. Pagination explicite pour éviter des totaux tronqués au plafond PostgREST. Seule la consultation 3A de l’arriéré actuel couvre toutes les dates. Champs retournés limités aux références, intitulés, noms, dates et états utiles : pas de corps de rapport, photos, coordonnées client ou données RH. Une lecture partielle en erreur n’est pas affichée comme un bilan complet ; les requêtes navigateur obsolètes sont annulées.

Aucune écriture métier, notification, activation de rappel, table, migration, snapshot, cron, dépendance ou service ajouté.

## Fichiers

- Modifié : `src/app/(dashboard)/reports/layout.tsx` — nouvel onglet uniquement.
- Ajoutés : `src/lib/daily-activity.ts`, `src/lib/daily-activity-data.ts`, `src/app/(dashboard)/reports/daily/page.tsx`, `src/app/api/reports/daily/route.ts`.
- Tests : `tests/lot3b.test.cjs`, `tests/lot3b-local.test.cjs`, `tests/lot3b-browser.cjs`.
- Ce bilan et `docs/validation-lot-3b/`.

[Comparaison avec l’entrée](validation-lot-3b/changes.json) : **301 fichiers préexistants inchangés**, aucun disparu ; toutes les migrations et les règles/écran de suivi/moteur 3A sont identiques. Modifications Git antérieures préservées. Sauvegarde `/private/tmp/richoz-lot3b-cwy5c5qs/entry`.

## Tests et preuves

| Contrôle | Résultat |
|---|---|
| [Unitaires/simulés](validation-lot-3b/unit.log) | **12/12** : 9 nouveaux + 3 régressions 3A ; dates, limites, déduplication, pagination > 1 000, autorisation et réponse obsolète |
| [Persistance/API locales réelles](validation-lot-3b/integration.log) | **7/7 groupes** : journées active/vide, fin/création distinctes, annulations, couverture inconnue, multijour, auteurs successifs après réaffectation, correction/resoumission, droits directs, dates et absence d’écritures |
| [Régression locale 3A](validation-lot-3b/lot3a-local.log) | **6/6 groupes**, paramètres fictifs et appels de test locaux ; configuration/règles inchangées, aucun ordonnanceur activé |
| [Navigateur Chromium](validation-lot-3b/browser.log) | **5 groupes réussis** : filtres/liens précis, jour précédent/vide/arriéré, actualisation sans écriture, chargement/erreur/reprise, mobile, refus technicien ; fuseau navigateur America/Los_Angeles avec journée Zurich |
| [TypeScript](validation-lot-3b/typescript.log) | **Code 0** (`--noEmit --incremental false`) |
| [ESLint](validation-lot-3b/eslint.json) | **0 erreur, 35 avertissements préexistants** sur `src`, directives actives |
| [Build](validation-lot-3b/build.log) | **Code 0**, production dans une copie isolée |

[Absence d’effets de bord](validation-lot-3b/no-side-effects.json) : après six lectures, 13 lignes intervention/rapport comparées intégralement, obligations et cycles identiques, compteurs notifications/rappels/audit inchangés. Comparaison complémentaire au navigateur réussie. Les affectations multiples simultanées ne sont pas prétendues testées : ce modèle n’existe pas ; le test réel utilise deux auteurs successifs et vérifie une seule intervention globale.

Captures contrôlées : [desktop](validation-lot-3b/desktop.png), [mobile](validation-lot-3b/mobile-top.png), [détail mobile](validation-lot-3b/mobile-detail.png). Sources [navigateur](validation-lot-3b/app-source-check.json) et [build](validation-lot-3b/build-source-check.json) identiques au dépôt.

Environnement existant : Supabase fictif `127.0.0.1:56321`, application 3B `http://127.0.0.1:56600/reports/daily`. Copies `/private/tmp/richoz-lot3b-cwy5c5qs/{app,build}`, réseau limité à localhost par `sandbox-exec`. Configuration fictive réutilisée ; aucun `.env.local` du dépôt lu. Aucune migration appliquée. Aucun avertissement historique nettoyé ; périmètre TypeScript historique conservé.

## Recette client restante et arrêt

Valider les libellés avec patron/secrétaire, la lecture par responsable actuel après réaffectation, les dates réellement renseignées et le volume des listes. Tester les appareils réellement utilisés ; viewport mobile Chromium ne vaut pas recette Safari/Android. Les réserves de couverture 3A et de reconnaissance vocale 2B demeurent inchangées. Une vraie date d’envoi exploitable demanderait une décision et un travail séparés.

**Bilan consultable et calculé automatiquement en local.** Aucun accès aux données réelles, déploiement, commit, push, migration distante, envoi externe ou opération destructive. Aucune diffusion programmée incluse. Arrêt après le lot 3B.
