# Richoz — bilan LOT 2A (13 septembre 2026)

## Statut et périmètre

- TERRAIN-01 PDF : **IMPLÉMENTÉ À VALIDER**.
- TERRAIN-02 photos : **IMPLÉMENTÉ À VALIDER**.
- Complément R3 : correction d’affichage **IMPLÉMENTÉ ET TESTÉ LOCALEMENT**, avec mocks seulement.

39 tests passent : 28 du lot 1 et 11 du lot 2A. Aucun parcours avec persistance sur une véritable base isolée n’est déclaré validé. Aucun déploiement, commit, push, changement de rôle, accès à des données réelles, envoi externe ou installation de dépendance n’a été effectué. Aucun fichier d’environnement contenant des secrets n’a été lu. Les éventuels appels de notifications des composants testés ont été remplacés par des mocks.

L’état Git a été consulté avant les modifications. Les changements préexistants, notamment ceux du lot 1, `.claude/settings.local.json`, `middleware.ts` et les artefacts `.playwright-mcp`, ont été conservés. Aucun `AGENTS.md` applicable n’a été trouvé. Inspection ciblée des formulaires, stockage, autorisations et parcours voisins ; pas de nouvel audit complet.

## Complément lot 1 — R3 / BUG-03

Le compte rendu antérieur complet et son journal d’exécution ne sont pas disponibles dans le contexte retrouvé. Les modifications sont identifiables dans le code et les tests, mais les commandes de la session précédente ne peuvent pas être attestées rétroactivement.

Fichiers concernés par R3 retrouvés :

- `src/components/reports/ReportForm.tsx` : commentaire complet, retours à la ligne, conservation après brouillon et resoumission ; `revision_requested` remis à false lors de la soumission.
- `src/lib/report-feedback.ts` : liens vers un rapport précis ; compatibilité avec les anciennes notifications ciblant une intervention.
- `src/app/(dashboard)/reports/validate/page.tsx` et `reports/validate/[id]/page.tsx` : demande de correction et notification ciblant le rapport.
- `src/app/(dashboard)/technician/notifications/page.tsx` : restitution du retour et résolution des liens.
- `src/app/(dashboard)/technician/report/[interventionId]/page.tsx` : sélection du rapport demandé et filtrage par intervention et technicien.
- `src/app/(dashboard)/technician/today/page.tsx` : accès au rapport précis depuis les demandes de correction.
- `tests/lot1.test.cjs`, `tests/lot1-harness.cjs` et script `test:lot1` de `package.json`.

Validation effectivement exécutée pendant cette session, avant les fonctionnalités : `npm run test:lot1` — **28/28 réussis**. Même commande relancée à la fin : **28/28 réussis**. Des exécutions combinées avec les tests du lot 2A ont également réussi.

R3 couvre : commentaire long et multilignes, sauvegarde brouillon, resoumission, lien récent et ancien, chargement propriétaire, réouverture simulée, autre technicien, mauvais rapport, absence de session, erreur de lecture, et retour depuis les deux écrans du secrétariat jusqu’au formulaire ciblé. Les requêtes Supabase et notifications sont simulées en mémoire. Il ne s’agit ni de tests dans un navigateur réel, ni de tests RLS, ni de persistance sur PostgreSQL.

Vérification supplémentaire demandée : le bandeau du lot 1 demeurait orange malgré `revision_requested=false`. Le formulaire distingue désormais « correction demandée » et « Dernier commentaire du secrétariat (historique) », avec fond neutre pour l’historique. L’état change immédiatement après une soumission enregistrée. Le test R3 vérifie cette distinction immédiatement et après réouverture simulée. Les listes de demandes actives utilisent le drapeau `revision_requested`, pas la simple présence du commentaire.

Le défaut de navigation mobile observé n’est **pas une cause confirmée du problème client**. Pour reproduire ce cas, il manque le point d’entrée utilisé (notification, liste, lien…), l’appareil/navigateur, la version de l’application et l’état chronologique du rapport au moment du problème. Ces éléments n’ont pas bloqué le lot 2A.

## TERRAIN-01 — PDF dans les chantiers

### Comportement et architecture

Un chantier est une ligne `interventions` avec `intervention_type='chantier'`. Aucune nouvelle entité métier n’est créée. Les PDF sont disponibles dans les fiches chantier du secrétariat et du technicien, le panneau de détail du calendrier et le formulaire de modification d’une intervention chantier existante.

Sélection multiple, nom de chaque document, téléchargement authentifié, message d’envoi par fichier, résultat, échecs conservés avec reprise, suppression réservée au personnel autorisé, et rechargement de la liste. Les données du chantier ne sont pas réécrites par l’envoi d’un PDF.

Le bucket existant `documents` autorise la lecture à tous les utilisateurs authentifiés dans la migration initiale. Il ne convient pas à la confidentialité demandée. Le nouveau bucket **privé** `chantier-documents` réutilise Supabase Storage et la limite PDF existante de **20 Mio**. Aucun service supplémentaire.

Rattachement : `intervention UUID/upload UUID--nom-normalisé.pdf`. Le chemin de l’objet est aussi sa métadonnée de rattachement ; aucune seconde insertion dans une table applicative. Un upload réussi constitue donc le rattachement. Les noms sont nettoyés et limités à 120 caractères de base. Extension, MIME, taille et signature `%PDF-` sont contrôlés dans la route ; MIME/taille sont également configurés dans le bucket. Cela ne constitue pas une analyse complète de structure PDF ni un antivirus.

Les reprises réutilisent le même UUID, sans écrasement. Si la réponse d’upload est perdue, la route compare les octets de l’objet déjà présent avant de confirmer la réussite. Un échec parmi plusieurs fichiers ne supprime pas les précédents. La liste est paginée côté Storage.

### Autorisations et migration

- Session vérifiée côté serveur, profil actif obligatoire.
- Ajout/suppression : administrateur ou secrétaire.
- Lecture : administrateur/secrétaire ou technicien affecté à l’intervention chantier.
- Règles Storage pour SELECT/INSERT/DELETE reprenant ces contraintes, y compris les métadonnées et le fichier. Aucune règle UPDATE.
- Pas d’URL publique ni d’URL signée envoyée au navigateur : téléchargement par route authentifiée, réponse `private, no-store`.
- Pas de colonne de tenant ou d’appartenance à plusieurs entreprises trouvée dans le schéma ciblé ; `company_settings` est global. Ces règles correspondent au modèle monoentreprise du dépôt. Une base réelle d’un autre schéma nécessiterait une revue avant application.

Migration : `supabase/migrations/00024_chantier_documents.sql` — **préparée, NON APPLIQUÉE**. Elle crée le bucket, une fonction SQL de contrôle et les politiques Storage. Elle ne touche pas les autres buckets. Elle échoue volontairement si un bucket du même nom existe déjà : ne pas ignorer ce conflit sans en examiner les règles.

Docker local a été vérifié mais le daemon n’est pas démarré. Aucune connexion à une base réelle n’a été tentée. Sans application de cette migration sur un environnement isolé, la fonctionnalité PDF ne peut pas être déclarée prête à livrer.

### Fichiers du lot 2A

- `src/lib/chantier-documents.ts`
- `src/app/api/interventions/[id]/documents/route.ts`
- `src/components/documents/ChantierDocuments.tsx`
- `src/components/interventions/InterventionForm.tsx` (préserve le lot 1)
- `src/components/calendar/InterventionDetailSheet.tsx`
- `src/app/(dashboard)/chantiers/[id]/page.tsx`
- `src/app/(dashboard)/technician/chantier/[id]/page.tsx`
- `supabase/migrations/00024_chantier_documents.sql`
- `tests/lot2a-documents.test.cjs`

### Résultats

Après la fonctionnalité PDF : `node --test tests/lot1.test.cjs tests/lot2a-documents.test.cjs` — **31/31 réussis** à ce stade (28 + 3). Un test de composant PDF a ensuite été ajouté ; le groupe final contient **4 tests PDF**.

Les tests couvrent upload/relecture/téléchargement/suppression, reprise sans doublon, technicien affecté, refus d’écriture technicien, refus de lecture d’un autre technicien connaissant la clé, traversée de chemin, profil inactif/absence de session, MIME/extension/contenu/taille, échec Storage, sélection multiple avec échec partiel et réouverture du composant. **API, base et Storage simulés**, pas de RLS exécutée.

## TERRAIN-02 — plusieurs photos

### Comportement

L’attribut `multiple` existait déjà : le changement porte sur le parcours complet. La sélection reste multiple, conserve les prévisualisations et permet le retrait puis une autre sélection. Les limites existantes sont conservées : **5 photos avant + 5 après**, **10 Mio par fichier**, JPEG/PNG/WebP/HEIC (ce dernier seulement si décodable par l’appareil).

Chaque fichier est validé avant traitement et après normalisation. Les images illisibles sont signalées par leur nom, sans perdre celles correctement préparées. La normalisation Canvas existante conserve sa réduction à 2048 pixels et sa qualité JPEG 0,85 ; les URL temporaires sont libérées. Un échec de Canvas devient explicite au lieu d’envoyer silencieusement un original non traité.

La préparation verrouille les nouvelles sélections concurrentes et la sauvegarde. Les miniatures distinguent « À envoyer », fichier reçu mais rapport restant à enregistrer, et échec nécessitant une reprise. Les fichiers réussis restent mémorisés même si un autre fichier ou l’écriture du rapport échoue. Chaque fichier utilise un chemin stable ; la reprise saute les fichiers confirmés et traite aussi le cas d’une réponse Storage perdue par comparaison des octets. Aucune réussite globale n’est annoncée avant l’enregistrement du rapport.

Les photos existantes, leurs catégories et légendes sont conservées. Le texte et les autres états du formulaire ne sont pas réinitialisés par un import. Les recherches de rapport de secours sont filtrées aussi par technicien et les erreurs de recherche ne sont plus ignorées. Une insertion de brouillon sans ligne retournée n’est pas annoncée comme réussie.

### Stockage et parcours voisins

Aucune migration photos. Le bucket `photos` existant est réutilisé avec un chemin `technicien UUID/reports/intervention UUID/catégorie/upload UUID.jpg`, conforme à sa règle existante de lecture du propriétaire. Les nouvelles références du rapport pointent vers une route de lecture authentifiée qui télécharge via le client Supabase de session. Personnel actif autorisé ou propriétaire ; aucun élargissement de rôle ou règle RLS.

Les anciennes références photo ne sont pas migrées. Le bucket est privé dans les migrations du dépôt, mais sa configuration effective sur l’environnement de livraison n’a pas été inspectée. Elle doit être vérifiée sur une copie isolée ; aucun changement global de visibilité n’a été fait.

La validation côté secrétariat reconnaît les nouvelles références privées. L’export DOCX charge leurs octets via le stockage existant ; il vérifie l’appartenance au technicien et à l’intervention du rapport avant d’utiliser son client serveur. Aucun export, téléchargement externe ou conversion réelle n’a été lancé pendant les tests.

### Fichiers

- `src/components/reports/PhotoUploader.tsx`
- `src/components/reports/ReportForm.tsx` (inclut le complément R3)
- `src/lib/report-photos.ts`
- `src/lib/normalize-image.ts`
- `src/app/api/report-photos/route.ts`
- `src/app/(dashboard)/reports/validate/[id]/page.tsx` (préserve le lot 1)
- `src/app/api/reports/[id]/docx/route.ts`
- `tests/lot2a-photos.test.cjs`

Communs : `package.json` (script `test:lot2a`), `tests/lot1-harness.cjs` (injection des API navigateur et mocks supplémentaires), `tests/lot1.test.cjs` (assertions historique R3), `tests/eslint-lot2a.cjs`, ce bilan.

### Résultats et limites

**7 tests photos** passent : cinq fichiers en une opération, retrait, seconde sélection, rejet individuel, sélection concurrente, format/taille, échec partiel, reprise sans doublon, réponse perdue, échec d’écriture du rapport puis reprise, conservation des anciennes photos/légendes/texte, réouverture simulée, accès propriétaire/secrétariat et refus d’un autre technicien, préparation des images privées pour DOCX et refus d’une référence étrangère.

Le décodage Canvas est mocké dans les tests du sélecteur ; aucune preuve de rendu/orientation HEIC, de comportement réel de galerie ou d’export Word/PDF sur appareil n’est revendiquée.

La reprise après échec est conservée **dans la page ouverte**, pas dans un stockage hors ligne. Fermer/recharger avant une sauvegarde réussie perd la sélection locale et peut laisser des objets envoyés non rattachés au rapport. Le lot n’ajoute pas de nettoyage automatique ni de mécanisme de reprise après fermeture. Les photos déjà enregistrées dans le rapport restent conservées.

## Commandes réellement utilisées et état final

```sh
npm run test:lot1
# 28 tests, 28 réussis
npm run test:lot2a
# 11 tests, 11 réussis (4 PDF + 7 photos)
node --test tests/lot1.test.cjs tests/lot2a-documents.test.cjs
# 31 réussis à l’étape PDF
node --test tests/lot1.test.cjs tests/lot2a-documents.test.cjs tests/lot2a-photos.test.cjs
# exécutions intermédiaires réussies : 37 puis 38 tests avant le dernier test DOCX
node_modules/.bin/tsc --noEmit --incremental false
# ÉCHEC : 51 diagnostics dans le socle existant, notamment typage Supabase "never".
# Aucun diagnostic sur les nouveaux modules/API PDF/photos, PhotoUploader,
# ReportForm, normalize-image ou la route DOCX modifiée.
git diff --check
# ÉCHEC uniquement sur l’espace final préexistant de middleware.ts:10, laissé intact.
docker info --format '{{.ServerVersion}}'
# Première tentative bloquée par sandbox ; seconde autorisée : daemon non démarré.
```

Le TypeScript global n’est **pas validé**. Certaines erreurs concernent des lignes existantes de pages dans lesquelles le composant PDF a été inséré. Aucun nettoyage général de typage n’a été entrepris. Aucun build Next n’a été lancé, notamment pour éviter le chargement de la configuration réelle ou des accès de génération aux services configurés.

ESLint : première tentative avec `--extends` invalide ; essais avec la configuration Next normale ensuite bloqués par des directives `@typescript-eslint/no-explicit-any` dont le plugin n’est pas installé. Aucune installation. Contrôle limité aux règles Next présentes, avec directives inline désactivées : **0 erreur, 12 avertissements** (images et dépendances de hooks existants).

Commande finale reproductible :

```sh
node_modules/.bin/eslint --no-eslintrc --no-inline-config --config tests/eslint-lot2a.cjs src/lib/chantier-documents.ts src/lib/report-photos.ts src/lib/normalize-image.ts src/components/documents/ChantierDocuments.tsx src/components/reports/PhotoUploader.tsx src/components/reports/ReportForm.tsx 'src/app/api/interventions/[id]/documents/route.ts' src/app/api/report-photos/route.ts 'src/app/api/reports/[id]/docx/route.ts' 'src/app/(dashboard)/reports/validate/[id]/page.tsx' 'src/app/(dashboard)/chantiers/[id]/page.tsx' 'src/app/(dashboard)/technician/chantier/[id]/page.tsx' src/components/calendar/InterventionDetailSheet.tsx src/components/interventions/InterventionForm.tsx
```

## Vérifications bloquantes avant livraison

1. Préparer un environnement Supabase explicitement isolé avec uniquement des fixtures fictives et des sorties email/SMS/push/webhook désactivées. Appliquer la migration PDF uniquement là. Vérifier les politiques effectives, y compris l’absence de règle Storage globale permissive additionnelle.
2. Exécuter les six acceptations PDF contre le vrai Storage : secrétaire, rechargement, affectation technicien, autre utilisateur avec clé/lien, fichier invalide/volumineux, panne d’envoi sans perte du chantier. Tester aussi changement d’affectation, suppression/refus de suppression, absence de session et accès direct à l’API Storage.
3. Exécuter les acceptations photos avec de vrais fichiers fictifs et persistance : 5 sélectionnées, retrait d’une, deuxième sélection dans la limite de 5 par catégorie, sauvegarde/réouverture, anciennes photos, panne partielle puis reprise, échec DB puis reprise, texte intact. Contrôler la lecture des images dans la validation secrétariat et dans l’export DOCX/PDF.
4. Sur les appareils du client : iPhone/Safari et Android/navigateur effectivement utilisés, galerie multiple, permission photo limitée, prise de vue, JPEG/HEIC, orientation EXIF, mémoire sur 5 gros fichiers, réseau mobile interrompu/rétabli et téléchargement PDF. **Non réalisés ici**.
5. Vérifier les limites de taille du reverse proxy/hébergement sur la route PDF multipart : elles peuvent être inférieures aux 20 Mio du stockage. Aucun test d’hébergement ni déploiement dans ce lot.
6. Résoudre ou qualifier les erreurs TypeScript globales et confirmer le build dans la configuration isolée avant livraison.

Arrêt après le LOT 2A. Aucun développement de dictée, rappels automatiques, rapport journalier, RH/paie, géolocalisation ou import Bexio.
