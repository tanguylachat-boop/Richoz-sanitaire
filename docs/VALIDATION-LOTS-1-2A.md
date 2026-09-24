# Lots 1 et 2A — correction des blocages, résultats actuels

**14 septembre 2026 — objectifs locaux atteints.** TypeScript : **31 → 0 diagnostic**. ESLint avec directives actives : **0 erreur, 35 avertissements** sur `src`. Build de production : **réussi**. **48 tests simulés**, **7 scénarios d'intégration réelle**, **6 parcours Chromium** et **2 contrôles SQL d'incompatibilité** réussis. Ces nombres désignent des suites/scénarios de nature différente, pas un unique total interchangeable.

Cette section remplace le statut bloqué de la validation précédente, conservée plus bas comme historique. Aucun déploiement, commit, push, projet Supabase distant, secret de production ou envoi métier externe. Aucune dépendance existante mise à jour. Aucun reset ni suppression de volume préexistant. Les seuls téléchargements publics ont concerné l'outillage autorisé, les images officielles Supabase et Inter/licence.

## Corrections réellement apportées

La liste exacte des fichiers ajoutés/modifiés **par rapport au début de cette correction**, et non simplement par rapport à HEAD, est dans [changed-files.json](validation-lots-1-2a/correction/changed-files.json). Une copie de l'état d'entrée est conservée à `/private/tmp/richoz-correction-_xyzkzzl`. Les modifications antérieures des lots et les fichiers sans lien avec les corrections sont conservés.

| Cause | Correction ciblée | Fichiers |
|---|---|---|
| Schéma déclaré incomplet, types Supabase `never` | Métadonnées de relations et tables/champs utilisés par les requêtes ; types d'insertion cohérents | `src/types/database.ts` |
| Déclarations de SSR 0.1 antérieures au changement du troisième générique de Supabase JS | Surcharge de déclaration décrivant le retour réel du SDK installé ; aucun cast `any`, aucune modification du mécanisme de cookies | `src/types/supabase-ssr-compat.d.ts`, `src/lib/supabase/client.ts`, `server.ts` |
| Dates de naissance nullable | Filtrage runtime avec raffinement de type avant de construire les anniversaires | `calendar/page.tsx`, `PlanificationSplitView.tsx` |
| JSON client non garanti | Validation de l'objet et de ses champs `name`/`phone` avant affichage | `technician/today/page.tsx` |
| Couleur calendrier de type `unknown` | Utilisation du champ typé existant | `admin/users/page.tsx` |
| Nom de montant incompatible avec le schéma SQL | Alias PostgREST `total_ttc:total`, conservant le libellé attendu par l'écran | `clients/[id]/page.tsx` |
| Clés Web Push : buffers et itération incompatibles | Retour `Uint8Array<ArrayBuffer>`, `Array.from` avant expansion | `src/lib/push-notifications.ts` |
| Règle ESLint introuvable et assistant de configuration interactif | Configuration Next native et plugin correspondant au parser installé ; directives actives | `.eslintrc.cjs`, `package.json`, `package-lock.json` |
| Build dépendant de Google Fonts | Vraie police Inter variable Latin, poids 100–900, chargée avec `next/font/local` ; design conservé | `src/app/layout.tsx`, `src/app/fonts/Inter-latin.woff2`, `OFL.txt` |
| Schéma historique non rejouable | Corrections de syntaxe, publication idempotente, prérequis additifs, ordre des fichiers et préparation locale déterministe | Migrations détaillées ci-dessous, `scripts/prepare-local-validation.py` |
| Rapport rejeté impossible à corriger, champs sensibles non protégés | Politiques d'état avant/après et trigger de contrôle des transitions/champs | `00025_report_workflow_access.sql` |
| Accès direct aux nouveaux chemins photos trop permissif | Politique **restrictive**, intersectant les autorisations existantes avec profil actif et affectation | `00028_verify_schema_and_photo_scope.sql` |

Aucun `any`, `ts-ignore`, exclusion ou désactivation de contrôle n'a été ajouté pour faire disparaître les diagnostics. Les exclusions historiques de `tsconfig.json` ont été conservées, notamment `src/app/api/webhooks` ; elles ne sont pas étendues. Le build compile aussi les routes, mais le contrôle TypeScript séparé conserve ce périmètre historique. Les autres workflows (facturation/Bexio, congés complets, piquet, etc.) n'ont pas reçu de nouvelle fonctionnalité ni de recette exhaustive.

### Dépendances et police

Deux dépendances de développement directes, épinglées : `@typescript-eslint/eslint-plugin@6.21.0` (même version que le parser installé) et `@types/web-push@3.6.4`. Installation avec `--ignore-scripts --no-audit --no-fund`. Six entrées ont été ajoutées au lockfile, transitives comprises ; **aucune version déjà présente n'a changé**. La première tentative réseau a échoué dans le sandbox ; la seconde a utilisé l'approbation réseau prévue. Le parser existant, ESLint 8 et Next 14.1.3 sont conservés.

Inter provient de Google Fonts, fichier WOFF2 réel de 48 432 octets, avec licence OFL. Aucun mock de police ni substitution par une autre famille. Le build final n'a plus besoin de télécharger la police.

## Migrations, droits et reproductibilité

Docker était disponible lors de cette correction : moteur **29.1.3**, contexte `desktop-linux`, socket Unix local. Aucun lancement supplémentaire de Docker Desktop n'était nécessaire. Les conteneurs d'autres projets ont seulement été inventoriés et laissés intacts.

La première instance dédiée utilise API **56321**, PostgreSQL **56322** et application **56300**. Elle contient **29 migrations appliquées**, dont la migration du bucket privé **00024**. La seconde instance, entièrement neuve et créée pour le rejeu, utilise API **57321** et PostgreSQL **57322**. Les volumes des deux instances sont conservés.

| Migration / fichier | Changement | Application locale |
|---|---|---|
| `00005_notifications.sql`, `00008_intervention_reminders.sql` | Retrait du `IF NOT EXISTS` non supporté par `CREATE POLICY` | Réussie dans les deux instances |
| `00015_enable_realtime.sql` | Ajout à la publication uniquement si la table n'en est pas déjà membre ; 00001 avait déjà publié rapports/interventions | Réussie dans les deux instances |
| `0000901_restore_application_schema.sql` **nouvelle** | Prérequis chantier du PRD, `company_settings`, `leave_requests`, champs réellement utilisés dont `revision_requested` boolean et `revision_message` text ; contrôle du type des colonnes déjà présentes | Réussie dans les deux instances |
| `00024_chantier_documents.sql` existante | Bucket privé, PDF 20 Mio, droits SELECT/INSERT/DELETE | Réussie dans les deux instances |
| `00025_report_workflow_access.sql` **nouvelle** | RLS/trigger rapports ; destinataires de notification cohérents, expéditeur lié à la session, corps reçu non falsifiable | Réussie dans les deux instances |
| `00026_clients_backfill.sql` | Renommage du fichier ignoré `00018b_clients_backfill.sql`, contenu SQL inchangé, exécuté après création des clients | Réussie dans les deux instances |
| `00027_invoices_pdf.sql` | Renommage du deuxième fichier `00022_invoices_pdf.sql`, contenu SQL inchangé, suppression de la collision de version | Réussie dans les deux instances |
| `00028_verify_schema_and_photo_scope.sql` **nouvelle** | Vérification des types/nullabilité/contraintes/FK des objets restaurés ; restriction des nouveaux chemins de photos | Réussie dans les deux instances |

Les modifications de trois migrations historiques sont limitées aux erreurs qui empêchaient leur exécution : syntaxe SQL invalide et publication déjà existante. Les objets manquants et les droits sont ajoutés dans des fichiers distincts. **L'état de production n'est pas connu et son registre n'a pas été modifié.** Les renommages ne constituent pas une procédure de migration d'une base déployée.

Le rejeu a révélé un défaut supplémentaire du CLI installé : les préfixes numériques de longueurs différentes sont triés différemment dans les noms de fichiers et dans le registre. `migration up --local` a donc refusé le premier répertoire malgré un démarrage réussi. Aucun `db pull`, accès distant ou réparation destructive suggérés par le CLI n'a été exécuté. La 00028 a été appliquée à la première instance avec `psql` dans une transaction, en enregistrant uniquement sa nouvelle version.

Pour une reconstruction reproductible, `scripts/prepare-local-validation.py` prépare un **nouveau répertoire uniquement sous `/private/tmp`**, refuse tout écrasement, copie les SQL **octet pour octet**, leur attribue des versions locales de largeur fixe et écrit leur correspondance et SHA-256. Il ne fabrique pas de schéma de test, ne remplace aucun SQL et ne modifie pas le registre d'une base existante. Le fichier PRD non numéroté reste une référence ; ses prérequis nécessaires sont portés par la migration additive.

Le second `supabase start` a exécuté les **29 fichiers identiques** jusqu'au bout. `supabase migration up --local` y répond ensuite **Local database is up to date**. Preuves : [replay.log](validation-lots-1-2a/correction/replay.log), [source-migrations.json](validation-lots-1-2a/correction/source-migrations.json), [replay-incremental.log](validation-lots-1-2a/correction/replay-incremental.log).

Deux tests SQL transactionnels ont volontairement présenté un type de retour incompatible et retiré une contrainte de dates. Les vérifications des migrations ont rejeté les deux cas. Les sous-transactions et le `ROLLBACK` final ont annulé ces modifications. Les mêmes vérifications contrôlent les clés étrangères : `IF NOT EXISTS` ne suffit pas à déclarer les tables restaurées compatibles. [schema-compatibility.log](validation-lots-1-2a/correction/schema-compatibility.log) confirme aussi `public=false` pour `photos` et `chantier-documents`.

### Resoumission protégée

Un technicien actif et affecté peut insérer un brouillon/une soumission, modifier **son** brouillon ou rapport rejeté, enregistrer en brouillon et resoumettre. L'état final doit être `draft` ou `submitted`, et le nouvel envoi résout `revision_requested`. Le commentaire reste disponible comme historique.

Le trigger vérifie les valeurs avant/après et n'autorise que les champs métier modifiables par le technicien. Identifiant, propriétaire, intervention, date de création, retour du secrétariat, validateur, date de validation et URL DOCX/PDF sont protégés. Les rapports déjà soumis ou validés ne deviennent pas éditables simplement parce qu'un bouton est accessible. L'insertion d'un rapport déjà validé est refusée. La secrétaire et l'administrateur conservent leurs parcours ; une validation enregistre son véritable auteur. Les profils inactifs sont exclus par une politique restrictive.

## Résultats de validation

| Contrôle | Réussi / Échoué / Non exécuté | Preuve | Point restant |
|---|---|---|---|
| TypeScript séparé | **Réussi** | `typescript-final.log`, code 0, **31 → 0** | Périmètre historique de tsconfig conservé |
| ESLint séparé, directives actives, `src` complet | **Réussi** | `eslint-final.json`, **0 erreur / 35 avertissements** | Avertissements hooks/images non bloquants |
| Commande native `npm run lint -- --no-cache` | **Réussi** | `lint-native.log`, code 0 ; plus d'assistant interactif | Mêmes avertissements |
| Build complet | **Réussi** | `build.log`, compilation + contrôles + génération des routes terminés, code 0 | Aucun contournement de police/typage |
| Sources testées identiques aux sources du build | **Réussi** | `build-source-check.json`, aucune différence | — |
| 48 tests existants simulés | **Réussi** | `mocks.log`, 48/48 | Ne remplacent pas les tests réels |
| 7 scénarios d'intégration réelle | **Réussi** | `integration.log`, 7/7 | Comptes et sessions fictifs locaux |
| 6 parcours Chromium | **Réussi** | `browser.log`, 6/6 | Chromium desktop, pas les appareils client |
| 29 migrations rejouées sur instance neuve | **Réussi** | `replay.log` + manifest de SHA-256 | Préparation locale normalisée requise avec ce CLI |
| Compatibilité du schéma existant | **Réussi** | `schema-compatibility.log`, 2 rejets attendus, rollback | Aucun état de production supposé |
| Recette iPhone/Safari, Android, HEIC/EXIF et réseau mobile | **Non exécuté** | Hors environnement matériel disponible | À réaliser avec les appareils réellement utilisés |
| Proxy/hébergement, PDF 20 Mio à travers la plateforme finale | **Non exécuté** | Aucun déploiement | Vérifier les limites multipart de la plateforme |
| Lien causal avec l'incident mobile du client | **Non exécuté** | Toujours non établi | Point d'entrée, appareil et chronologie nécessaires |

### Ce qui a été réellement exercé

- **Rapports, API réelle** : secrétaire retournant le rapport, reconnexion du propriétaire, lecture du commentaire, brouillon corrigé, resoumission et relecture par la secrétaire. Appels directs refusés pour autre technicien, profil inactif, propriétaire/intervention substitués, faux commentaire, faux validateur/date, statut illégal, URL d'export et édition après soumission/validation. Validation secrétaire et correction administrative légitimes réussies.
- **Rapports, navigateur** : authentification par formulaire, soumission, demande d'informations par l'écran secrétaire, nouvelle session technicien, correction/resoumission, bandeau historique et texte corrigé retrouvé côté secrétaire. Les quatre images sont aussi décodées après la resoumission.
- **PDF, API/Storage réels** : deux fichiers PDF fictifs valides, clés de rattachement exactes, liste persistante après connexion, téléchargement technicien affecté, anonymes/autres techniciens/inactifs refusés par route ; accès direct aux objets et listes Storage contrôlé. Substitution de chantier et écriture technicien refusées. Suppression autorisée ; répétition d'un token déjà enregistré sans doublon ; fichier invalide rejeté.
- **PDF, navigateur** : sélection de deux fichiers, interruption du deuxième envoi au niveau transport, reprise, vérification de deux objets seulement, rechargement et nouvelle session secrétaire, téléchargement par le technicien, suppression par la secrétaire.
- **Photos, intégration** : vrais fichiers PNG locaux, panne partielle injectée autour d'un appel Storage (les autres appels utilisent le vrai SDK), reprise avec clés stables, rapport persisté, reconnexion, images attendues et refus d'accès direct non autorisé.
- **Photos, navigateur** : une ancienne photo/légende, trois nouvelles sélectionnées, retrait puis seconde sélection ; quatre images finales. Texte conservé ; échec de transport d'un envoi, rapport non faussement annoncé enregistré, reprise sans doublon, nouvelle session et quatre images effectivement décodées. Canvas réel du navigateur utilisé.
- **Lot 1** : dates stockées/rechargées via sessions locales, 00:15 Europe/Zurich en janvier et juillet, durée conservée ; conversion/date et changements d'heure également couverts par les tests existants. Statistiques réellement chargées par l'admin dans Chromium ; secrétaire/technicien refusés. HTTP vérifie aussi anonyme et admin inactif. Le refus applicatif retourne une page d'alerte, parfois HTTP 200 : les tests contrôlent le contenu de refus, pas seulement le statut HTTP.

Les tests de droits utilisent les **sessions des utilisateurs concernés**. La clé privilégiée locale sert uniquement à créer les comptes/profils fictifs. Les contrôles SQL privilégiés portent sur les migrations et leur compatibilité ; ils ne servent pas de preuve des droits métier. L'export DOCX/conversion PDF externe, les signatures et les autres modules n'ont pas fait l'objet d'une recette complète supplémentaire.

Captures : [photos réouvertes](validation-lots-1-2a/correction/browser-photos.png), [retour devenu historique](validation-lots-1-2a/correction/browser-history.png). Document téléchargé : [PDF fictif](validation-lots-1-2a/correction/downloaded-fixture.pdf).

## Isolation, commandes et état laissé

Application compilée : `/private/tmp/richoz-validation-reprise-alid1vk9/current`, URL `http://127.0.0.1:56300`. Supabase : `/private/tmp/richoz-validation-reprise-alid1vk9/supabase-test`. Rejeu : `/private/tmp/richoz-validation-correction-replay-20260914`. Les fichiers de configuration réels de production n'ont été ni lus pour exécution ni modifiés. Les clés locales restent sous `/private/tmp`, pas dans ce bilan.

Le build et le serveur utilisent un environnement hérité vidé (`env -i`) et la configuration dédiée. Le profil système [local-only.sb](validation-lots-1-2a/correction/local-only.sb) interdit tout réseau hors localhost et s'applique aussi aux processus enfants Chromium. Le harnais navigateur filtre en plus les requêtes vers les deux seules origines autorisées. VAPID est vide et les destinations de conversion/webhook sont dirigées vers un port local inactif. Voir [isolation.json](validation-lots-1-2a/correction/isolation.json).

Principales commandes effectivement exécutées (arguments locaux ; aucun `--linked`) :

```sh
# Dépôt : contrôles séparés, directives ESLint actives.
node_modules/.bin/tsc --noEmit --incremental false
node_modules/.bin/eslint src --ext .ts,.tsx --format json
node --test tests/lot1.test.cjs tests/lot2a-documents.test.cjs tests/lot2a-photos.test.cjs tests/stabilization-access.test.cjs
npm install --save-dev --save-exact @typescript-eslint/eslint-plugin@6.21.0 @types/web-push@3.6.4 --ignore-scripts --no-audit --no-fund --cache /private/tmp/richoz-npm-cache

# Copie applicative isolée, sous sandbox-exec + env -i.
npm run build
npm run lint -- --no-cache
npm run start -- --hostname 127.0.0.1 --port 56300

# Dans le projet Supabase dédié ; téléchargements officiels autorisés.
node_modules/.bin/supabase start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor
node_modules/.bin/supabase status --output json

# Reconstruction sans écraser l'instance précédente.
python3 scripts/prepare-local-validation.py --output /private/tmp/richoz-validation-correction-replay-20260914
# Depuis ce nouveau répertoire, avec le binaire du dépôt :
supabase start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor
supabase migration up --local

# Réel : exécuté sous le profil localhost-only et un environnement vidé.
RICHOZ_LOCAL_STATUS=/private/tmp/richoz-local-status.json node --test tests/local-integration.test.cjs
RICHOZ_LOCAL_STATUS=/private/tmp/richoz-local-status.json RICHOZ_PLAYWRIGHT_PATH=/Users/tanguylachat/.npm/_npx/e41f203b7505f1fb/node_modules/playwright node tests/local-browser.cjs
# SQL local dédié, ON_ERROR_STOP=1 et transactions annulées :
docker exec -i supabase_db_richoz-validation-lots-1-2a-20260914 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/local-schema-compatibility.sql
```

Les premiers essais ont mis en évidence la syntaxe invalide de 00005, la publication dupliquée de 00015, puis le mauvais placement initial du backfill. Ils ont été corrigés avant le rejeu réussi. Des assertions de tests ont aussi été corrigées : refus RH rendu en HTTP 200, titre RH présent à la fois dans le menu et dans la page, annonceur Next invisible portant `role=alert`. Ce ne sont pas des erreurs applicatives masquées. La dernière exécution complète est celle enregistrée comme réussie.

Les services locaux de test restent disponibles, les volumes et fixtures fictives sont conservés. **Aucun objectif local demandé ne reste bloqué sur le périmètre exercé.** Restent les vérifications client/appareils/hébergement indiquées au tableau, les avertissements non bloquants et la qualification séparée du cas mobile réel. Aucune nouvelle fonctionnalité ni passage à la dictée vocale.

---

<details>
<summary>Historique : validation précédente, avant autorisation de corriger les blocages</summary>

# Validation finale des lots 1 et 2A — reprise du 14 septembre 2026

**Statut : validation partielle ; recette client et déploiement bloqués.**

Les fonctionnalités existantes ont été conservées. Aucun nouveau lot, aucune dépendance, aucune migration distante, aucun déploiement, commit, push ou envoi externe. Aucun accès aux données réelles. Aucun volume supprimé ni reset. Aucun fichier `.env.local` réel chargé. Les essais réels de persistance et de RLS ne sont pas validés par les tests simulés.

## Contexte et conservation

Recherche des `AGENTS.md` dans le dépôt (hors dépendances, Git et build) et aux niveaux `/`, `/Users`, `/Users/tanguylachat`, `/Users/tanguylachat/n8n` : aucun applicable trouvé. `docs/LOT2A-BILAN.md` lu ; ce document de validation n'existait pas au début de la reprise. Les journaux de la précédente stabilisation ont également été examinés.

L'état Git initial est conservé dans [git-entry.log](validation-lots-1-2a/reprise-20260914/git-entry.log). Les empreintes de 177 fichiers applicatifs, tests, migrations et configurations ont été prises avant les vérifications et comparées après : **aucun changement**. Voir [preservation.json](validation-lots-1-2a/reprise-20260914/preservation.json) et [entry-sha256.json](validation-lots-1-2a/reprise-20260914/entry-sha256.json). Les modifications préexistantes, dont `.claude/settings.local.json`, `middleware.ts`, `next.config.js` et les fichiers non suivis, sont préservées.

**Corrections supplémentaires pendant cette reprise : aucune.** Fichiers créés : ce bilan et les preuves dans `docs/validation-lots-1-2a/reprise-20260914/`. Les ajustements de typage, hooks et contrôles d'accès trouvés à l'entrée appartiennent à la stabilisation précédente ; ils ne sont pas attribués à cette reprise.

## TypeScript : reproduction et attribution

| Mesure | Nombre | Résultat |
|---|---:|---|
| Bilan initial historique | 51 | Trace ancienne, pas le nombre à l'entrée de cette reprise |
| Dépôt à l'entrée de cette reprise | 31 | Échec, code 2 |
| Référence Git `a0a6c85` extraite séparément, dépendances installées identiques | 53 | Échec, code 2 |
| Dépôt au terme de cette reprise | 31 | Échec, code 2 |
| Régressions TypeScript attribuables aux lots, parmi les diagnostics actuels | 0 | Aucune détectée |
| Diagnostics actuels préexistants prouvés | 31 | Tous reproduits dans HEAD |
| Diagnostics actuels d'origine indéterminée | 0 | Pour cette comparaison uniquement |

Commande : `node_modules/.bin/tsc --noEmit --incremental false`. Le dépôt courant a été contrôlé avec son `tsconfig.json` existant et son dossier `.next` existant. La référence a été extraite sans checkout ni modification de Git, avec le même `node_modules`, sans artefacts `.next` hérités.

L'attribution ne repose pas sur le nom du fichier. Pour chaque diagnostic courant, le code et le message de l'erreur sont reproduits sur une ligne source identique, hors espaces, alignée par diff avec HEAD. Les 31 preuves individuelles sont dans [attribution.md](validation-lots-1-2a/reprise-20260914/attribution.md) et [attribution.json](validation-lots-1-2a/reprise-20260914/attribution.json). Journaux : [avant](validation-lots-1-2a/reprise-20260914/typescript-before.log), [HEAD](validation-lots-1-2a/reprise-20260914/typescript-head.log), [après](validation-lots-1-2a/reprise-20260914/typescript-after.log).

Les erreurs restantes concernent principalement les types Supabase `never`, les réglages/utilisateurs, les listes chantier, notifications et push, ainsi que les types de buffers et l'itération des tableaux typés. Leur impact reste bloquant pour un contrôle TypeScript global. Leur correction générale n'a pas été entreprise. La baisse historique de 51 à 31 était déjà acquise avant cette reprise et ne doit pas être présentée comme son résultat.

Aucun contrôle n'a été désactivé et aucune suppression de diagnostic ajoutée. L'exclusion `src/app/api/webhooks` du `tsconfig.json` est identique à HEAD : le résultat TypeScript ne couvre donc pas ces fichiers. Cette exclusion préexistante n'a pas été élargie. Le `next.config.js` courant ne désactive ni TypeScript ni ESLint.

## ESLint et build

Le contrôle ciblé du bilan initial a été reproduit exactement : **0 erreur, 10 avertissements**, contre 12 dans la trace historique. Il utilise `tests/eslint-lot2a.cjs`, les règles Next installées et `--no-inline-config`. Les dix avertissements concernent les images dans les fiches chantier, la validation et le sélecteur de photos. Ce mode ignore aussi les suppressions inline existantes ; il n'a pas servi à modifier le code ni à déclarer le lint complet réussi.

Un contrôle supplémentaire des fichiers `src` modifiés et suivis par Git donne **0 erreur, 20 avertissements** : dix images et dix dépendances de hooks. Ce périmètre est plus large que le précédent ; les nombres ne s'additionnent pas. Les hooks concernent le calendrier, les listes de rapports, notifications, interventions du jour et la planification. Ils signalent un risque de closures périmées ; aucun comportement défaillant supplémentaire n'a été reproduit. Leur origine individuelle n'a pas été démontrée dans cette reprise. Ils restent à examiner si un parcours réel échoue. Les nouveaux composants PDF et photos ne produisent pas d'avertissement de dépendances de hooks dans le contrôle ciblé.

Les images locales `blob:` et les routes de lecture authentifiées expliquent notamment l'emploi de `<img>` dans le parcours photos ; leur remplacement automatique par un optimiseur n'est pas une correction nécessaire à la persistance. Les avertissements de performance restent visibles. Voir [eslint.log](validation-lots-1-2a/reprise-20260914/eslint.log) et [eslint-lot1-expanded.log](validation-lots-1-2a/reprise-20260914/eslint-lot1-expanded.log).

La commande native `npm run lint -- --config tests/eslint-lot2a.cjs --no-cache`, exécutée dans la copie isolée, ouvre l'assistant de configuration ESLint puis termine sans analyse en entrée non interactive. **Son code 0 n'est pas un lint réussi.** Voir [lint-normal.log](validation-lots-1-2a/reprise-20260914/lint-normal.log). Un appel direct ESLint avec les directives inline actives donne **32 erreurs de configuration, 0 avertissement, code 1** : toutes indiquent `Definition for rule '@typescript-eslint/no-explicit-any' was not found`. Il est conservé dans [eslint-inline.json](validation-lots-1-2a/reprise-20260914/eslint-inline.json), sans installer de plugin ni changer la configuration. Le contrôle limité aux règles Next ne remplace pas cet échec.

### Isolation du build

Une copie neuve de `src`, `public`, des tests et des fichiers de configuration nécessaires a été créée dans `/private/tmp/richoz-validation-reprise-alid1vk9/current`. Les dépendances déjà installées sont réutilisées par lien. Aucun `.env` réel, `.vercel`, lien de projet distant ou `.next` précédent n'a été copié. Le seul environnement de la copie est `.env.production`, issu de `build-test.env.example`, avec URL Supabase `http://127.0.0.1:56321`, application `http://127.0.0.1:56300`, conversion `http://127.0.0.1:56399`, clés fictives et VAPID vide.

Scripts inspectés : `build` appelle seulement `next build`, sans `prebuild`/`postbuild`. `next.config.js`, les clients Supabase navigateur/serveur/admin/middleware et les points d'envoi ont été lus. Tous les clients Supabase utilisent `NEXT_PUBLIC_SUPABASE_URL`. Les tests injectent des clients fictifs et interdisent les imports/appels externes non simulés. Les notifications sont simulées.

Le code contient des destinations externes (police Google, Bexio, conversion Gotenberg de secours, logo distant). Des variables locales seules ne suffiraient donc pas à garantir l'isolation. Le build a été lancé avec un environnement hérité vidé (`env -i`), télémétrie désactivée et un profil système `(deny network*)`, hérité par les processus enfants. L'activation de ce profil a nécessité une autorisation système car le sandbox initial refusait `sandbox_apply` ; l'exécution autorisée a conservé l'interdiction réseau totale.

**Résultat du build : échec, code 1**, téléchargement de `Inter` par `next/font/google` impossible (`ENOTFOUND fonts.googleapis.com`). Le layout concerné est identique à HEAD. Aucune requête sortante n'a pu être envoyée sous le profil. Aucune police factice, suppression de contrôle ou modification fonctionnelle n'a été utilisée pour obtenir artificiellement un build vert. La compilation complète, le contrôle TypeScript interne au build et la génération des pages ne sont pas validés. Voir [build.log](validation-lots-1-2a/reprise-20260914/build.log).

## Environnement Supabase et migrations

Contexte Docker : `desktop-linux`, socket Unix local `/Users/tanguylachat/.docker/run/docker.sock`. Première lecture refusée par le sandbox ; seconde lecture autorisée : **Cannot connect to the Docker daemon**. Aucun endpoint Docker distant utilisé. Voir [docker.log](validation-lots-1-2a/reprise-20260914/docker.log).

L'ancienne préparation `/private/tmp/richoz-validation-20260914/supabase-test/supabase` ne contient que `config.toml`, identique au fichier de configuration dédié archivé ; aucun dossier de migrations n'y est présent. Ce dossier ne prouve pas l'existence d'une base initialisée. Le daemon indisponible empêche l'inventaire des conteneurs/volumes et la lecture de `supabase_migrations.schema_migrations` ou `storage.buckets`.

Une nouvelle préparation, sans écraser l'ancienne, contient la configuration dédiée et une copie inchangée des migrations dans `/private/tmp/richoz-validation-reprise-alid1vk9/supabase-test/supabase`. Elle vise le projet `richoz-validation-lots-1-2a-20260914`, API 56321, PostgreSQL 56322, shadow 56320. Seed désactivé, email capturé localement, SMS/fournisseurs externes, edge runtime et analytics désactivés. Aucun démarrage ni création de fixture n'a été exécuté.

**Migrations appliquées pendant cette reprise : aucune.** `00024_chantier_documents.sql` reste préparée. Son application effective dans un éventuel ancien volume local est **indéterminée**, faute de daemon ; le commentaire « NOT APPLIED » du fichier n'est pas une preuve de l'état d'une base.

Action minimale pour lever le premier blocage : démarrer Docker Desktop et attendre que `docker info` réponde. Ensuite seulement, inspecter les ressources existantes et le registre local des migrations avant toute initialisation non destructive. Si des images nécessaires manquent, leur téléchargement constituerait un accès externe non réalisé ici.

### Obstacles de schéma constatés par lecture, à traiter avant la recette réelle

Les sources SQL et types suivants sont identiques à HEAD (preuve dans [schema-reference.json](validation-lots-1-2a/reprise-20260914/schema-reference.json)) :

- `revision_requested` et `revision_message` sont utilisés et déclarés dans les types applicatifs mais absents de toutes les migrations SQL du dépôt. Une base fraîche issue de ces fichiers ne peut pas reproduire fidèlement le parcours des retours sans rétablir son historique de schéma.
- La politique `reports_update_own_draft` de `00001_initial_schema.sql` limite les modifications du technicien aux rapports `draft`. Le secrétariat enregistre `rejected` lors du retour. Aucune migration remplaçant cette politique n'a été trouvée. La resoumission d'un rapport rejeté est donc un blocage attendu avec ces règles ; les mocks ne les exécutent pas. Le passage d'un brouillon à `submitted` nécessite aussi de vérifier le `WITH CHECK` effectif.
- Le fichier non numéroté `prd-v2-migrations.sql` définit des tables chantier attendues par des migrations numérotées ultérieures ; il contient des instructions `CREATE POLICY IF NOT EXISTS` à régulariser avant utilisation PostgreSQL. Les fichiers `00022_bexio_integration.sql` et `00022_invoices_pdf.sql` partagent le même préfixe. L'historique ne peut pas être considéré comme prêt pour une reconstruction automatique fidèle sans vérification locale.
- Les règles Storage photos existantes autorisent l'insertion à tout utilisateur authentifié dans le bucket, et la lecture au propriétaire du préfixe ou au personnel. Elles ne vérifient pas elles-mêmes le rattachement à un rapport ni l'activité du propriétaire. La route nouvelle ajoute ces vérifications, mais un accès direct au SDK Storage doit aussi être éprouvé. Ne pas déclarer l'équivalence route/Storage acquise.

Ces constats sont issus des fichiers locaux, pas de la base réelle. Une réparation générale du schéma préexistant ou un élargissement non testé des droits n'a pas été improvisé. Ils bloquent la validation réelle même après le démarrage de Docker.

## Tests : nature, couverture et limites

Commande réellement exécutée :

```sh
node --test tests/lot1.test.cjs tests/lot2a-documents.test.cjs tests/lot2a-photos.test.cjs tests/stabilization-access.test.cjs
```

**48/48 réussis** : 28 lot 1, 4 PDF, 7 photos, 9 contrôles d'accès de stabilisation. Voir [tests.log](validation-lots-1-2a/reprise-20260914/tests.log).

Il s'agit de tests unitaires de fonctions, tests de handlers et tests de composants sous un harnais React/VM simulé. Ce ne sont ni des parcours navigateur, ni une intégration au vrai SDK Supabase, ni des tests PostgreSQL/Storage. Les fausses images et faux PDF de ces tests ne prouvent pas leur décodage ou rendu réel. Les réouvertures recréent des composants sur des données en mémoire ; elles ne constituent pas une reconnexion authentifiée persistante.

La lecture des routes confirme l'usage du client de session pour les PDF et photos, avec contrôle de session/profil avant Storage. Les PDF sont rattachés par leur chemin `intervention/upload--nom.pdf`, sans ligne de métadonnées applicative distincte. La migration 00024 propose un bucket privé et des politiques SELECT/INSERT/DELETE, pas UPDATE. Les autres politiques Storage du dépôt sont bornées à leurs buckets ; cela ne prouve pas l'absence de politiques supplémentaires dans une base existante.

Les routes DOCX GET et POST appellent `reportAccessFailure` avant de créer le client privilégié et d'exécuter les opérations protégées. Les tests vérifient que plusieurs refus interviennent avant sa création ; la matrice de succès est testée au niveau du garde, et le chargement des photos au niveau du helper. Une exécution complète de conversion/export et les autorisations effectives sur base restent non réalisées.

| Contrôle | Réussi / Échoué / Non exécuté | Preuve | Point restant |
|---|---|---|---|
| 48 tests locaux existants | Réussi | `tests.log`, 48 réussis, 0 échec | Mocks uniquement |
| TypeScript global avant/après | Échoué | `typescript-before.log`, `typescript-after.log`, 31 → 31 | Corriger le socle préexistant |
| Attribution des 31 diagnostics | Réussi | `attribution.md/json`, reproduction HEAD | Ne vaut pas validation fonctionnelle |
| ESLint ciblé, règles Next sans directives inline | Réussi | `eslint.log`, 0 erreur / 10 avertissements | Lint complet non validé |
| ESLint élargi aux fichiers suivis modifiés | Réussi | `eslint-lot1-expanded.log`, 0 erreur / 20 avertissements | Hooks et performance images |
| ESLint ciblé avec directives inline actives | Échoué | `eslint-inline.json`, 32 erreurs de règle indisponible | Configuration/plugin TypeScript à réconcilier |
| Commande native `npm run lint` | Non exécuté | Assistant interactif dans `lint-normal.log` | Configuration ESLint native à finaliser |
| Build isolé sans réseau | Échoué | `build.log`, sortie 1, police Inter | Dépendance réseau du build, puis TypeScript |
| Docker local | Échoué | `docker.log`, daemon inaccessible | Démarrer Docker Desktop |
| État effectif de 00024 et règles Storage locales | Non exécuté | Aucun accès au daemon/SQL | Inspecter registre, bucket et politiques |
| PDF multiple, rattachement, relecture et suppression simulés | Réussi | 4 tests PDF | Persistance et reconnexion réelles |
| PDF avec Storage réel : secrétaire, rechargement, nouvelle connexion, technicien affecté | Non exécuté | Environnement indisponible | Comptes fictifs et Storage local |
| PDF réel : anonyme/autre technicien, API directe, métadonnées, substitution d'ID | Non exécuté | Aucun jeton utilisateur réel local | Tester routes et SDK Storage sans clé privilégiée |
| PDF réel : suppression, changement d'affectation, panne et reprise sans doublon | Non exécuté | Seulement simulations | Pannes contrôlées et comptage réel des objets |
| Photos : sélections, retrait, texte/photos conservés, échecs/reprise simulés | Réussi | 7 tests photos | Canvas et persistance non exercés |
| Photos réelles : sauvegarde/réouverture, échec partiel/reprise, accès selon rapport | Non exécuté | Pas de DB/Storage/navigateur local | Tester aussi l'accès direct au Storage |
| Dates : minuit Zurich, été/hiver et sauvegarde/réouverture simulées | Réussi | Tests lot 1 | Dates persistées en PostgreSQL non testées |
| Dates persistées et réouvertes sur base locale | Non exécuté | Docker indisponible | Tester autour de minuit et des changements d'heure |
| Retour secrétaire et historique après resoumission simulés | Réussi | Tests R3 lot 1 | Colonnes et politique RLS à réconcilier |
| Retour/historique et bon destinataire sur base locale | Non exécuté | Aucun compte local réel | Vérifier les refus par autre technicien |
| Accès statistiques par profil, y compris admin inactif, simulé | Réussi | Lot 1 et `stabilization-access` | Sessions et RLS réelles non vérifiées |
| Accès statistiques par profil sur base locale | Non exécuté | Docker indisponible | Admin, secrétaire, technicien, anonyme, inactif |
| Parcours navigateur, appareils, rendu PDF/HEIC, export DOCX/PDF | Non exécuté | Aucun navigateur connecté à une base isolée | Recette sur appareils utilisés |
| Conservation des fichiers à l'entrée | Réussi | `preservation.json`, 177 empreintes inchangées | Aucun changement applicatif de cette reprise |
| `git diff --check` global | Échoué | `diff-check.log`, `middleware.ts:10` | Espace préexistant préservé |

## Commandes et traçabilité

Les arguments exacts des contrôles principaux et leurs répertoires sont dans [commands.json](validation-lots-1-2a/reprise-20260914/commands.json). La configuration, le hash Git complet et les chemins temporaires sont dans [workspace.json](validation-lots-1-2a/reprise-20260914/workspace.json).

```sh
node_modules/.bin/tsc --noEmit --incremental false
# Avant et après dans le dépôt ; également dans l'extraction HEAD.
node_modules/.bin/eslint --no-eslintrc --no-inline-config --config tests/eslint-lot2a.cjs <14 fichiers du bilan initial>
# Liste exacte archivée dans commands.json ; 0 erreur, 10 avertissements.
node_modules/.bin/eslint --no-eslintrc --no-inline-config --config tests/eslint-lot2a.cjs <fichiers src suivis modifiés>
# 0 erreur, 20 avertissements ; liste dans git-entry.log.
npm run lint -- --config tests/eslint-lot2a.cjs --no-cache
# Copie isolée ; assistant interactif, pas d'analyse.
docker context show
docker context inspect --format '{{.Endpoints.docker.Host}}'
docker info --format '{{.ServerVersion}}'
# Nouvelle tentative autorisée après refus du sandbox : daemon inaccessible.
git diff --check
# Code 2, espace final préexistant dans middleware.ts:10.
```

Build réellement exécuté depuis la copie `current` :

```sh
/usr/bin/sandbox-exec -f /private/tmp/richoz-validation-reprise-alid1vk9/network-deny.sb /usr/bin/env -i PATH=/Users/tanguylachat/.nvm/versions/node/v22.22.0/bin:/usr/bin:/bin TMPDIR=/private/tmp NEXT_TELEMETRY_DISABLED=1 npm run build
```

Une première tentative d'inventaire/lint élargi a été interrompue pendant le sous-processus, sans résultat revendiqué. Le contrôle élargi a ensuite été exécuté avec la liste Git déjà enregistrée et une limite de temps ; c'est son journal terminé qui est cité. Les scripts Python de préparation ont uniquement copié des fichiers autorisés, extrait les sources HEAD en lecture seule, exécuté les commandes locales, calculé les empreintes et produit les preuves.

## Conditions restant à remplir avant recette client et déploiement

1. Rendre Docker disponible, confirmer une instance exclusivement locale et son isolation, puis inspecter les migrations réellement appliquées sans reset ni suppression.
2. Réconcilier l'historique SQL nécessaire aux chantiers et retours de rapports ; vérifier les colonnes, règles RLS et politiques effectives. Appliquer les migrations nécessaires uniquement à cette instance, avec des fixtures fictives.
3. Exécuter tous les contrôles de persistance et d'autorisation marqués « Non exécuté », avec sessions secrétaire/techniciens réelles locales, reconnexion, substitutions d'identifiants et accès direct au Storage. Une clé privilégiée ne doit pas servir de preuve des droits utilisateurs.
4. Obtenir un TypeScript global et un build complets réussis, traiter la dépendance de build à la police et qualifier le lint natif. Aucun téléchargement externe supplémentaire n'a été réalisé ici.
5. Réaliser la recette navigateur/appareils, y compris téléchargement PDF, galeries multiples, HEIC/EXIF, interruptions réseau et limites multipart de l'hébergement.

Le lien entre le défaut de navigation mobile et l'incident réellement rencontré par le client reste **non confirmé**. Il faut le point d'entrée, l'appareil/navigateur et l'état chronologique du rapport pour l'établir.

Arrêt après ce bilan. Aucun passage à la dictée vocale ou à un autre lot.

</details>
