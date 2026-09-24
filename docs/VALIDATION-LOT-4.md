# Richoz — LOT 4 : import Excel Bexio (contacts)

18 septembre 2026 — **Importeur à mapping configurable livré et testé avec jeu fictif.** Le fichier Excel réel du client n'a PAS été trouvé dans le projet (recherche limitée au dépôt, conformément à la passation) : **ses colonnes réelles n'ont pas été vérifiées et aucun contact client n'a été importé.** Dès que le fichier est déposé dans le projet, l'aperçu + mapping permettent de l'inspecter et d'importer sans développement supplémentaire.

## Fonctionnement

- Page **`/clients/import`** (bouton « Importer Bexio » sur la page Clients ; garde serveur `requireAdminOrSecretary` + contrôle du rôle dans l'API) : sélection du fichier → **aperçu** (en-têtes, 10 premières lignes, mapping pré-suggéré) → **correspondance des colonnes** ajustable (Nr. Bexio, entreprise, nom, prénom, e-mail, téléphones, adresse, NPA, localité, remarques) → import → **bilan** acceptés / ignorés / rejetés avec numéro de ligne et raison.
- **Module existant réutilisé** : insertion dans la table `clients` (CRM en place), pas de nouvelle entité ni connexion à l'API Bexio.
- **Identifiant source stable** : colonne `clients.bexio_nr` (migration `00033`, index unique partiel). Réimport du même fichier → lignes déjà importées ignorées et signalées, **jamais de doublon ni d'écrasement silencieux** ; sans Nr., déduplication par e-mail puis par égalité stricte de toutes les coordonnées. **Deux homonymes aux coordonnées différentes ne sont jamais fusionnés** (testé).
- **Rôles selon les données réellement présentes** : `entreprise` si seule la raison sociale existe, `particulier` sinon. Régies et destinataires de facturation ne sont **pas** inférés (aucune correspondance fiable dans un export contacts) — rattachement manuel comme aujourd'hui.
- **Sécurité fichier** : lecteur XLSX minimal maison (`src/lib/xlsx-lite.ts`, Node zlib, aucune dépendance ajoutée) qui lit **exclusivement les valeurs en cache** — formules, macros et contenu actif jamais évalués ; CSV accepté aussi. Taille ≤ 5 Mo, ≤ 10 000 lignes, whitelist stricte des champs cibles, réponses `no-store`, **aucune coordonnée dans les journaux serveur** (code d'erreur uniquement).
- Import par lots de 500 ; en cas d'erreur, arrêt propre avec compte des insérés — le réimport reprend sans doublon.

## Fichiers

- Migration : `supabase/migrations/00033_clients_bexio_nr.sql` (additive).
- Ajoutés : `src/lib/xlsx-lite.ts`, `src/lib/client-import.ts` (logique pure testable), `src/app/api/clients/import/route.ts`, `src/app/(dashboard)/clients/import/{layout,page}.tsx`, `tests/lot4-import.test.cjs`, ce bilan.
- Modifiés : `src/app/(dashboard)/clients/page.tsx` (bouton), `src/types/database.ts` (`bexio_nr`).

## Tests et preuves (exécutés réellement le 18.09.2026, données fictives uniquement)

| Contrôle | Résultat |
|---|---|
| Unitaires (`node --test tests/lot4-import.test.cjs`) | **5/5** : lecture XLSX fictif (chaînes partagées, inlineStr, entités XML, cellules absentes, **cellule à formule → seule la valeur en cache lue**) ; CSV `;` avec guillemets/multilignes ; suggestion de mapping sur en-têtes Bexio DE/FR ; validation (ni nom ni société rejeté, e-mail invalide rejeté, type selon données présentes) ; plan d'import (doublon dans le fichier, Nr. déjà en base, e-mail déjà en base, contact strictement identique ignoré, **homonymes distincts tous deux insérés**) |
| Base locale (migration 00033 via `supabase migration up`) | Index unique `bexio_nr` vérifié : second insert du même Nr. rejeté, transaction annulée sans résidu |
| TypeScript | **Code 0** (après correction TS2802 itérations `matchAll`) |
| ESLint (fichiers du lot) | **0 erreur, 0 avertissement** |
| Build | Code 0 (consigné dans RICHOZ-REPRISE-ETAT.md) |

## Limites (une fois pour toutes)

- **Fichier client absent** : colonnes réelles non vérifiées ; le mapping suggéré vient d'en-têtes Bexio usuels et se corrige à l'écran. Signalé ici, pas de relance répétée.
- Parcours navigateur (upload réel, drag&drop mobile) non testé dans ce lot — recette à faire sur l'URL déployée.
- Pas de mise à jour de contacts existants (choix anti-écrasement) : un contact modifié dans Bexio est ignoré au réimport et signalé « déjà présent ». Une future option « compléter les champs vides » est possible si le client la demande.
- `.xls` binaire ancien non supporté (export Bexio = `.xlsx`/`.csv`).
