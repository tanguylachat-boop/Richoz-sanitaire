# Richoz — LOT 7 : géolocalisation des dépanneurs (MVP)

18 septembre 2026 — **Développé et testé avec positions fictives uniquement. Livré DÉSACTIVÉ : aucun suivi réel n'est actif par défaut.**

## Fonctionnement

- **Côté technicien** (`/technician/location`, lien « Ma position ») : bouton explicite « Partager ma position » / « Arrêter le partage », état visible (actif / arrêté / permission refusée / erreur), heure du dernier envoi. Position envoyée toutes les 20 s via l'API navigateur pendant que **la page est ouverte** — la limite est affichée à l'écran : une application web ne suit PAS la position écran verrouillé ou app fermée, et rien de tel n'est annoncé. Refus de permission → partage arrêté proprement.
- **Côté responsable** (`/admin/locations`, garde `requireAdminOrSecretary` + RLS) : liste des techniciens en partage avec horodatage, précision (± m) et badge **« Position périmée »** au-delà de 5 minutes — aucun point ancien présenté comme du direct ; les partages arrêtés apparaissent « position effacée ». Actualisation 30 s. Cartographie : lien Google Maps ouvert par l'utilisateur (pattern existant de l'app) — **aucun envoi automatique de positions à un tiers, aucun fournisseur payant ajouté**.
- **Base** (`00034_technician_locations.sql`) : **une seule ligne par technicien** (dernière position, chaque envoi écrase le précédent) → pas d'historique de trajets, pas de score, pas de surveillance dissimulée, par construction. **Conservation minimale garantie par contrainte** : la base REFUSE toute coordonnée quand le partage est inactif ; à l'arrêt, coordonnées et horodatage sont effacés. RLS : le technicien n'écrit que sa propre ligne et ne voit pas ses collègues ; lecture admin/secrétariat ; le secrétariat ne peut pas écrire la position d'un technicien.
- **Activation** : l'interface technicien est gatée par `NEXT_PUBLIC_LOCATION_SHARING_ENABLED='true'` (absent par défaut → écran « dispositif prêt mais non activé »). Aucune coordonnée dans les journaux.

## Fichiers

- Migration : `supabase/migrations/00034_technician_locations.sql` (additive).
- Ajoutés : `src/app/(dashboard)/technician/location/page.tsx`, `src/app/(dashboard)/admin/locations/{layout,page}.tsx`, `tests/lot7-local.test.cjs`, ce bilan.
- Modifiés : `src/lib/constants.ts` (liens nav), `src/components/layout/Sidebar.tsx` (icône map-pin), `src/types/database.ts`.

## Tests et preuves (exécutés réellement le 18.09.2026, positions FICTIVES)

| Contrôle | Résultat |
|---|---|
| Intégration Supabase local (`tests/lot7-local.test.cjs`, migration 00034 appliquée) | **3/3** : publication de SA position et écrasement sans accumulation (1 seule ligne) ; écriture pour autrui refusée, lecture entre techniciens vide, lecture secrétariat OK, écriture secrétariat filtrée ; arrêt → coordonnées effacées, position hors partage REFUSÉE par la contrainte, coordonnées invalides refusées |
| TypeScript | **Code 0** |
| ESLint (fichiers du lot) | **0 erreur, 0 avertissement** |
| Build (`npm run build`) | **Code 0** (`/technician/location`, `/admin/locations` compilées) |

## Conditions préalables à l'activation réelle (à faire valider, consigné une fois)

- **Information préalable des salariés**, finalité et proportionnalité du dispositif (PFPDT) : le bouton d'accord dans l'app ne suffit pas juridiquement. Durée de conservation retenue ici : dernière position uniquement, effacée à l'arrêt — à confirmer.
- **Appareils réels des techniciens** : comportements app ouverte / arrière-plan / verrouillage / réseau perdu / permission révoquée à tester sur les téléphones concernés. Si un suivi continu en arrière-plan est réellement exigé, cela demande une application native — hors de ce lot, expliqué au client sans le construire.
- Navigateur réel non testé dans ce lot (logique DB testée en intégration ; UI compilée).
