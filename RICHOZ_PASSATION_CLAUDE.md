# Richoz — Passation Codex → Claude Code

**Préparée le 18 septembre 2026 à partir des demandes et comptes rendus communiqués par Tanguy.**
Le rédacteur de cette passation n’a pas inspecté le dépôt. Les résultats ci-dessous sont rapportés par Codex, pas vérifiés indépendamment. Recouper le contexte avec les fichiers locaux sans refaire un audit général.

## 1. Mission et reprise immédiate

Tu reprends le logiciel client Richoz, entreprise de sanitaire/dépannage. La livraison promise est en retard. Objectif : terminer les modifications demandées et préparer une livraison vérifiable, pas reconstruire le logiciel.

Tu travailles dans **le dossier local exact utilisé par Codex**, avec son état non commité et ses fichiers non suivis. Les conversations Codex ne sont pas ta mémoire : les fichiers, bilans et cette passation le sont. Ne clone pas un dépôt distant à la place de cet état local.

### Première séquence autorisée

1. Vérifier le répertoire, les instructions `CLAUDE.md` et `AGENTS.md` applicables, l’état Git et les nouveaux fichiers. Préserver toutes les modifications préexistantes. Ne lancer aucun `/init` ni audit global automatique.
2. Lire en priorité les sections utiles des bilans ci-dessous. Relever les commandes de test et l’environnement local déjà opérationnel ; ne pas réinstaller le projet sans nécessité.
3. Confirmer brièvement ce qui reste réellement à terminer dans le lot 3B. Si son code et ses preuves sont présents, considérer la phase de développement terminée et avancer. Ne pas reconstruire 3B parce que sa réponse finale a été interrompue.
4. Commencer **le lot 5 — congés et historique RH**, puis poursuivre les lots implémentables dans l’ordre proposé. Les lots 4 et 6 restent connus dès maintenant. L’absence d’Excel ou d’une règle salariale ne bloque pas les travaux indépendants.
5. Maintenir un seul état de reprise court dans `docs/RICHOZ-REPRISE-ETAT.md` : fait, en cours, bloqué, prochains fichiers/actions, derniers tests. Ajouter si utile un bref renvoi dans le `CLAUDE.md` existant, sans le remplacer ni y recopier toute cette passation.

**Mode de travail :** plan court, changements ciblés, tests pertinents, point d’étape bref, puis lot suivant lorsque le périmètre et les règles sont connus. Ne demander une décision que pour une ambiguïté réellement bloquante ou une opération non autorisée. Ne pas s’arrêter après une simple synthèse de l’existant.

## 2. Documents et repères disponibles

Lire les fichiers présents ; un nom manquant doit être signalé, pas inventé :
- `docs/LOT2A-BILAN.md`
- `docs/VALIDATION-LOTS-1-2A.md`
- `docs/VALIDATION-LOT-2B.md`
- `docs/VALIDATION-LOT-3A.md`
- `docs/validation-lot-3a/changes.json`
- `docs/VALIDATION-LOT-3B.md`

Repères rapportés : projet TypeScript avec application Next.js, Supabase/PostgreSQL/Storage et instance de test locale via Docker. Versions et architecture exacte à confirmer dans le dépôt. Fichiers mentionnés : `src/components/reports/ReportForm.tsx`, `src/components/layout/MobileNav.tsx`, `src/lib/intervention-dates.ts`, `src/lib/report-feedback.ts`, `report-dictation.ts`, `VoiceRecorder.tsx`. Ne pas supposer le chemin complet des deux derniers.

Les migrations `00024` et `00029` ont été mentionnées : respecter l’ordre réel du dépôt et ne pas réutiliser un numéro déjà pris.

## 3. Ce qui a déjà été fait — ne pas refaire

| Lot | Fonctionnement rapporté | Réserve à conserver |
|---|---|---|
| 1 / BUG-01 | Lien Statistiques RH ajouté à la navigation mobile administrateur ; protection serveur ; gestion des chargements, erreurs et données vides. | Le lien entre ce défaut mobile et l’incident exact du client reste à confirmer avec son rôle/appareil/version. Ne pas élargir les droits arbitrairement. |
| 1 / BUG-02 | Dates d’intervention : conversions Europe/Zurich, saisie/édition/réouverture, valeurs invalides et cohérence début/fin. | Tester les appareils réels ; une date vide restait permise selon le fonctionnement antérieur. |
| 1 / BUG-03 | Commentaire de retour complet visible, notification et lien vers le rapport exact, contrôle du technicien concerné. Après resoumission, le précédent commentaire apparaît comme historique. | Préserver le cycle sécurisé refus/correction/resoumission et les champs réservés au validateur. |
| 2A / PDF | Ajout multiple aux chantiers, stockage privé, téléchargement authentifié, suppression autorisée et reprise après erreur. | Tests appareils, limites du proxy de déploiement. |
| 2A / photos | Sélection multiple, prévisualisation, retrait, deuxième sélection, photos existantes conservées, reprise sans doublon. | HEIC/EXIF et appareils réels non vérifiés. |
| Stabilisation | Diagnostics TypeScript 31 → 0 ; configuration ESLint réparée ; police Inter locale ; migrations manquantes ajoutées ; correction/resoumission sécurisée en base. Persistance et droits réels testés localement. | Ne pas réintroduire le téléchargement obligatoire de police ou annuler les correctifs de schéma. Aucun état de production n’a été inspecté. |
| 2B / dictée | Dicter → arrêter → relire/corriger → ajouter/annuler. Ajout sans perte du texte. Reconnaissance navigateur, information sur service externe possible, pas de stockage audio applicatif. | Reconnaissance simulée seulement. Microphone réel, iPhone, Android et application installée restent à tester. Ne pas annoncer compatibilité universelle. |
| 3A / suivi | Onglet Suivi des rapports : états, filtres, tri, dates, dernier rappel, liens. Obligation de rapport absent seulement après confirmation explicite. Anti-doublons, reprise et droits testés. Migration additive 00029 locale. | Automatisation testée localement, **non activée**. Types, déclencheur, cardinalité, délais, répétition et date de mise en service à confirmer. |
| 3B / bilan journalier | Dernier extrait : build et TypeScript réussis ; ESLint 0 erreur / 35 avertissements préexistants ; bilan rédigé ; statut « Bilan consultable et calculé automatiquement en local » ; `scheduled_distribution: false`. | La réponse a été interrompue par quota au bilan final. Vérifier le document et les preuves, particulièrement les limites des dates de soumission. Aucun envoi quotidien programmé inclus. |

Le dernier compte rendu du lot 3B indiquait qu’un seul fichier **préexistant** avait changé : la navigation Rapports. Cela n’exclut pas de nouveaux fichiers. Les migrations et le suivi 3A étaient inchangés.

Les compteurs de tests des lots sont distincts : ne pas les additionner pour fabriquer un total de validation. Retrouver les commandes exactes dans les bilans. Ne pas présenter un test simulé comme une preuve navigateur/microphone/Storage réel.

### Contraintes métier déjà retenues

- Une intervention prévue n’est pas nécessairement terminée ; `updated_at` n’est pas une date de réalisation ou de soumission fiable par défaut.
- Un rapport envoyé mais non validé n’est pas manquant. Un rapport refusé est « à corriger ».
- Zéro rapport manquant parmi les obligations confirmées ne signifie pas que toute l’activité est couverte.
- Le bilan passé peut montrer des statuts actuels si aucun historique réel n’existe : l’indiquer.
- Les rappels ne doivent pas rattraper tout l’historique automatiquement.
- Dates métier Europe/Zurich ; ne pas supposer des journées toujours longues de 24 heures.

## 4. Backlog complet restant

Les numéros reprennent le découpage convenu. Ordre proposé : **finir 3B seulement si nécessaire → 5 → 6A → 6B/6C selon règles disponibles → 4 → 7**. Le lot 4 peut être avancé avant les calculs de paie si son fichier est disponible ou si la paie attend une décision.

### LOT 5 — Congés modifiables et historique RH

**Demande :** modifier jours ET heures des congés ; disposer d’un résumé et de l’historique des vacances ; identifier les congés sans solde pour leur traitement salarial.

Livrer dans les écrans existants :
- Modification du début et de la fin, y compris absences partielles, par les personnes habilitées.
- Durée calculée selon le planning contractuel connu du collaborateur et les règles existantes ; aucune hypothèse universelle de huit heures par jour.
- Validation des dates, conflits pertinents et cohérence avec le statut d’approbation existant.
- Historique filtrable : type, période, durée, statut ; résumé des vacances prises, futures approuvées, en attente et solde lorsque les droits de base sont connus.
- Distinction explicite vacances payées / congés sans solde. Aucune déduction des vacances payées dans cette implémentation.
- Traçabilité des changements : auteur, moment, anciennes/nouvelles valeurs. Empêcher le double décompte lors d’une modification.
- Préparer la consommation des congés sans solde approuvés par la paie sans encore inventer le tarif de déduction.

Conserver les mécanismes existants pour temps partiel, jours non travaillés et fermetures ; ne pas ajouter un nouveau module de fermeture non demandé. Un solde inconnu n’est ni zéro ni un crédit annuel inventé.

**Acceptation :** modification d’une absence partielle et d’une absence sur plusieurs jours, recalcul calendrier/historique/solde cohérent, droits serveur testés, persistance après reconnexion. Une période de paie figée ne doit pas être altérée silencieusement par une modification de congé.

### LOT 6A — Saisie des éléments variables de salaire

**Demande explicite du client :** intégrer congés sans solde, arrivées tardives, amendes de stationnement en CHF, heures supplémentaires et piquet de **150 CHF par semaine complète attribuée au technicien**.

Réutiliser les entités existantes plutôt que doubler les données. Chaque élément doit avoir collaborateur, période/date, origine, quantité ou montant pertinent, motif, validation et trace d’intégration en paie.

| Élément | À implémenter | Règle restant nécessaire |
|---|---|---|
| Sans solde | Consommer la durée approuvée issue des congés. | Base de calcul et traitement validés. |
| Retard | Heure attendue/réelle, minutes concernées, justification/récupération et validation. | Effet salarial applicable, sans amende forfaitaire inventée. |
| Amende stationnement | Date, montant en CHF, justificatif si système existant, collaborateur, état d’examen. | Imputabilité et validité d’une éventuelle compensation salariale ; la seule saisie ne déclenche pas une retenue. |
| Heures supplémentaires | Durée, origine, approbation, paiement ou récupération selon règles établies. | Taux/majoration et contrat/CCT pertinents. Ne pas choisir un taux universel. |
| Piquet | Affectation de la semaine et 150 CHF pour la semaine complète concernée. | Semaines partagées, remplacements, prorata et rattachement lors d’une coupure de période. |

Employer la représentation monétaire exacte déjà prévue ou des unités décimales/centimes adaptées, sans erreurs d’arrondi cumulées. Ne pas compter la même heure ou le même piquet via deux sources. Ne pas supprimer les autres composantes du salaire existantes.

**Demande client conservée mais non activée :** il souhaitait une déduction si un rapport n’est pas rendu. Garder rappels/escalade et traçabilité. **Ne pas créer une pénalité salariale automatique liée à un rapport manquant.** Une validation manager seule ne suffit pas à établir la validité d’une retenue ; faire examiner les cas concernés avant activation par les interlocuteurs compétents.

**Acceptation :** un élément admissible n’appartient qu’au bon salarié et à la bonne période ; modification/annulation sans doublon ; refus des actions non autorisées ; semaine complète validée à 150 CHF avec données fictives.

### LOT 6B — Calcul et intégration dans le brouillon de paie

- Réutiliser le moteur, les fiches et règles de paie existants. Ne pas reconstruire une paie suisse complète depuis zéro.
- Mettre à jour automatiquement le **brouillon** à partir des éléments admissibles, approuvés et dotés d’une règle validée ; détailler les lignes et leur source.
- Conserver les distinctions salaire brut, cotisations et autres ajustements selon le modèle existant. Ne pas décider arbitrairement que tous les éléments ont le même traitement.
- Une formule ou un paramètre absent apparaît « à configurer/à valider », jamais comme un montant inventé ou un faux zéro. Ne pas permettre une clôture prétendument complète avec des éléments non résolus.
- Garder les règles et valeurs utilisées pour justifier le calcul ; ne pas changer rétroactivement une fiche figée.
- Prévoir régularisations traçables pour les corrections après clôture.
- Formules de sans-solde, retards, cotisations, compensation d’amendes et heures supplémentaires : rechercher les règles déjà approuvées ; sinon consigner une décision à faire valider par le client/fiduciaire et un juriste pour les retenues litigieuses. Ne pas sélectionner une CCT par simple déduction du secteur.

Implémenter et tester la plomberie et les calculs déterministes connus. Isoler les règles non renseignées sans bloquer les congés, la saisie ou l’import de contacts.

### LOT 6C — Fiches le 25, bascule à partir du 26

**Demandes confirmées :** génération automatique le 25 ; éléments à partir du 26 pour le mois suivant.

**Interprétation de travail, à confirmer avant activation :** variables du 26 du mois précédent au 25 courant inclus ; salaire mensuel de base conservant sa période existante. Ce n’est pas une règle contractuelle déjà confirmée.

- Préparer la génération d’un brouillon le 25, sans perdre les événements intervenant plus tard le même jour. Définir séparément heure de génération et clôture ; ne pas inventer leur valeur de production.
- Une génération par salarié/période/version pertinente, avec idempotence et reprise après panne ; aucune fiche dupliquée par deux exécutions.
- Utiliser le mécanisme de planification existant, authentifié et testable localement. Pas de nouveau service payant.
- Événements du 25 et du 26 rattachés conformément à la règle configurée ; retards de saisie gérés comme régularisations explicites et non déplacement silencieux de paie figée.
- Préserver les fiches déjà validées, permettre relecture/validation par la personne autorisée, reprendre le format de document existant.
- Aucune instruction de paiement, aucun envoi salarié et aucun cron distant activé sans accord explicite.

**Acceptation :** frontière 25/26, changements de mois/année, événements après génération le 25, réexécution sans doublon, corrections après clôture et permissions. Une génération préparée et testée localement ne doit pas être annoncée active chez le client.

### LOT 4 — Import Excel Bexio : facturation et régies

Le client a exporté ses contacts Bexio en Excel. Le fichier n’a pas été fourni dans cette conversation ; il peut avoir été déposé localement depuis. Le chercher uniquement dans le projet ou à un emplacement expressément communiqué, pas dans tout le Mac.

- Import dans le module contacts existant, pas connexion à l’API Bexio.
- Sélection du fichier, aperçu, correspondance des colonnes, validation, doublons et bilan des lignes acceptées/rejetées.
- Distinguer entreprise, personne, régie et destinataire de facturation selon les données réellement présentes. Ne pas inférer ces rôles sans correspondance fiable.
- Réutiliser les identifiants sources stables si disponibles ; ne pas fusionner deux personnes uniquement sur un nom partagé.
- Réimporter le même fichier sans créer de doublons. Pas d’écrasement silencieux de contacts existants.
- Contrôler les droits, la taille/format du fichier et les champs. Ne pas exécuter de formules ou contenu actif du classeur.
- Aucune copie des coordonnées réelles dans les logs, fixtures, commits ou réponse. Le fichier client déposé exprès peut servir à inspecter localement les colonnes ; tests avec données synthétiques, sans import en production.
- Si le fichier manque, préparer un importeur à mapping configurable avec jeu fictif, mais ne prétendre ni avoir vérifié ses colonnes réelles ni importé les contacts client. Signaler une seule fois le fichier nécessaire et poursuivre les tâches indépendantes.

### LOT 7 — Géolocalisation des dépanneurs

**Demande :** permettre au patron de voir la position actuelle des dépanneurs pour organiser les interventions.

MVP limité :
- Interface de partage explicite côté technicien, périodes de service prévues, arrêt du partage, gestion des permissions/refus et indication visible de l’état.
- Vue responsable protégée, positions utiles, horodatage de dernière mise à jour, précision si disponible et statut de position périmée/non disponible.
- Aucun point ancien présenté comme une position en direct. À l’arrêt du partage, cesser les mises à jour et marquer la position comme inactive selon la politique retenue.
- Pas d’historique détaillé des trajets par défaut, pas de score de productivité ni de surveillance dissimulée.
- Accès limité, cloisonnement, durée de conservation minimale explicitement définie avant usage réel ; pas de coordonnées dans les logs.
- Réutiliser la cartographie existante. Pas de fournisseur payant ou d’envoi de positions réelles à un nouveau tiers sans validation.

Une application web ne doit pas être annoncée capable d’un suivi continu écran verrouillé ou application fermée sans preuve sur les appareils concernés. Tester app ouverte, arrière-plan, verrouillage, réseau perdu et permission révoquée. Si le besoin exige une solution native, l’expliquer sans construire une nouvelle application mobile dans ce lot.

L’information des salariés, la finalité et la proportionnalité du dispositif doivent être vérifiées avant activation ; un bouton d’accord n’est pas à lui seul une validation juridique. Développement et tests possibles avec positions fictives ; **pas d’activation du suivi réel par défaut**.

## 5. Autorisations, qualité et efficacité

### Autorisé dès cette passation

Lecture ciblée du dépôt ; modifications locales nécessaires aux demandes ci-dessus ; migrations additives sur une base de test isolée ; tests avec utilisateurs fictifs et droits ordinaires ; corrections de typage/build directement liées aux lots ; documentation de reprise courte.

Réutiliser Docker et les outils déjà opérationnels. Vérifier le moteur et les destinations si leur état est inconnu. Réseau permis pour documentation officielle, téléchargements publics nécessaires et outillage existant, selon les autorisations de l’environnement. Pas d’interdiction réseau artificielle bloquant le build ; pas de nouvelle dépendance ou service payant sans nécessité expliquée et accord.

### Non autorisé

Accès au projet Supabase distant ; application distante des migrations ; consultation/modification des données réelles hormis inspection locale de l’Excel volontairement fourni selon le lot 4 ; envoi externe métier ; suivi GPS réel ; paiement ; déploiement ; push ; commit ; reset/stash/clean destructif ; suppression de volumes ; écrasement de `CLAUDE.md`, `.env` ou travaux précédents ; neutralisation de TypeScript/ESLint/RLS pour faire passer des tests.

Ne pas afficher de clés, jetons, mots de passe ou données personnelles. Une clé privilégiée ne prouve pas les droits ordinaires : tester les sessions et appels directs pour les autorisations sensibles.

### Tests sans gaspillage

- Après chaque changement significatif : tests ciblés et persistance/permissions réelles si le lot touche la base ou Storage.
- À chaque frontière de lot : TypeScript, lint approprié, régressions concernées ; build lorsqu’il est pertinent. Contrôle intégré complet avant proposition de livraison.
- Ne pas relancer toute la batterie inchangée après chaque retouche mineure ; ne pas reproduire quatre fois la même analyse.
- Séparer mocks, intégration, navigateur et appareils réels. Garder les 35 avertissements préexistants comme réserve, sans nettoyage global.
- Les tâches d’écriture sur le même schéma, formulaire ou moteur de paie restent séquentielles. Ne pas lancer plusieurs agents qui modifient les mêmes fichiers pour simuler de la vitesse.

## 6. Conditions de livraison et points à faire confirmer

Le but final est l’utilisation client, pas seulement « codé localement ». Préparer en fin de travail un bilan par demande : fonctionnel localement / testé réellement / en attente de paramètre / non implémenté / à tester appareil / prêt pour recette.

Dossier de livraison minimal : inventaire des migrations nouvelles dans l’ordre, contrôles préalables sur environnement de destination à effectuer **après autorisation**, besoins de sauvegarde, configuration et automatismes à activer, procédure de recette par rôle, stratégie de retour arrière compatible avec les données. Ne pas appliquer ces opérations maintenant. Toute donnée déjà en production reste d’état inconnu jusqu’à une vérification autorisée.

Grouper les seules décisions manquantes, sans les redemander plusieurs fois :
- Rôle/appareil/version et problème précis des statistiques du client.
- Règles d’obligation et cadence des rapports ; heure/destinataires/canal si un envoi journalier est réellement souhaité (la consultation est déjà développée).
- Horaires de travail et droits à congés absents du dépôt.
- Règles de paie, taux, traitements et validation des retenues ; piquets partagés et franchissement de la coupure ; heure de clôture du 25.
- Fichier Excel Bexio exact.
- Appareils des techniciens et cadre opérationnel de la localisation.

Une information bloquante sur la paie ne justifie pas d’arrêter tous les autres lots. Inversement, l’urgence ne justifie pas d’inventer une formule ou de déclarer un suivi automatique activé.

**Première sortie attendue : un état de reprise en quelques lignes, puis le code du lot 5. Pas un audit général et pas une demande de retransmettre l’historique Codex.**

## 7. Références de vérification

Sources officielles consultées le 18 septembre 2026. La documentation technique peut évoluer ; rechercher la version applicable avant un choix sensible. Ces sources ne remplacent pas la vérification du contrat/CCT ni l’examen d’un cas concret.

- Claude Code : démarrage dans le répertoire du projet et mémoire de projet. Les fichiers `CLAUDE.md` servent au contexte persistant ; ne pas supposer que les instructions `AGENTS.md` sont chargées automatiquement.
- SECO : les modalités des heures supplémentaires dépendent notamment des conventions applicables ; ne pas appliquer un taux universel sans validation.
- PFPDT : finalité, proportionnalité, information préalable et limitation d’accès dans la surveillance au travail ; l’accord du salarié ne suffit pas à lui seul à trancher.

```text
https://code.claude.com/docs/en/quickstart
https://code.claude.com/docs/en/memory
https://www.seco.admin.ch/fr/faq-heures-supplementaires
https://www.edoeb.admin.ch/fr/moyens-techniques-de-surveillance-sur-le-lieu-de-travail
```
