# PRD — RICHOZ SANITAIRE — Modifications Post-Démo Artan
# Version 1.0 — 13 mars 2026
# À placer dans : CLAUDE.md ou .claude/prd-richoz-v2.md

---

## CONTEXTE

Ce document décrit TOUTES les modifications à apporter au dashboard Richoz Sanitaire (Next.js + Supabase + n8n).  
Repo : `ics-sanitaire` — Déployé sur Vercel : `richoz-sanitaire.vercel.app`  
n8n : `primary-production-66b7.up.railway.app`  
Supabase : `yuumzhlvmqcbogqzuonp.supabase.co`

### RÈGLES ABSOLUES POUR CLAUDE CODE

1. **LIRE les fichiers existants AVANT de modifier** — ne JAMAIS deviner les colonnes, les noms de tables, ou la structure
2. **Vérifier le schéma DB** en lisant `src/types/database.ts` ou en faisant un SELECT sur `information_schema.columns`
3. **Ne PAS ajouter de colonnes** sans les lister dans la section "Migrations DB" de la tâche correspondante
4. **Tester après chaque modification** — `npm run build` doit passer sans erreur
5. **Un commit par tâche** — message format : `feat(inbox): filtre par régie` ou `fix(calendar): bloquer tech en congé`
6. **Ne JAMAIS modifier** des fichiers non listés dans la tâche
7. **Garder le style existant** — Tailwind CSS, composants existants, même patterns que le code actuel
8. **Tables DB** : sans préfixe (pas de `lx_`). Tables : `users`, `interventions`, `quotes`, `quote_items`, `invoices`, `regies`, `reports`, `leave_requests`, `emails`, `services_catalog`
9. **user_id** = `auth.users.id` (UUID Supabase Auth)
10. **total_price** dans `quote_items` est une colonne GENERATED — ne JAMAIS l'inclure dans un INSERT

---

## MODULE 1 — INBOX & EMAILS

### Tâche 1.1 — Filtre par régie dans l'inbox
**Fichier** : `src/app/(dashboard)/inbox/page.tsx`  
**Description** : Ajouter un dropdown en haut de l'inbox pour filtrer les emails par régie.  
**Spécifications** :
- Dropdown avec : "Toutes les régies" (défaut) + liste des régies actives depuis la table `regies`
- Quand une régie est sélectionnée, ne montrer que les emails de cette régie
- Le filtre est côté client (filter sur les emails déjà chargés)
- Le dropdown est placé à côté de la barre de recherche existante
- Style : même style que les select existants dans le dashboard (`h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg`)

### Tâche 1.2 — Bouton Urgence cliquable
**Fichier** : `src/app/(dashboard)/inbox/page.tsx`  
**Description** : Le bouton/badge "Urgence" en haut de l'inbox doit être cliquable et filtrer les emails marqués comme urgents.  
**Spécifications** :
- Toggle : clic active le filtre urgences, re-clic le désactive
- Quand actif : bordure rouge, fond rouge clair (`bg-red-50 border-red-500 text-red-700`)
- Filtrer sur le champ `is_urgent` ou `priority` des emails (vérifier le schéma)
- Combinable avec le filtre régie (les deux filtres s'additionnent)

### Tâche 1.3 — Bouton Planifier manquant sur certains mails
**Fichier** : `src/app/(dashboard)/inbox/page.tsx` et/ou le composant email detail  
**Description** : Certains emails avec bon d'intervention n'ont pas de bouton "Planifier".  
**Spécifications** :
- Le bouton "Planifier" doit apparaître sur TOUS les emails qui contiennent un `work_order_number` dans leurs données extraites
- Vérifier la logique conditionnelle actuelle qui affiche/masque le bouton
- Le bouton ouvre le modal de planification pré-rempli avec les infos du mail

### Tâche 1.4 — Tri par date (plus récents en haut)
**Fichier** : `src/app/(dashboard)/inbox/page.tsx`  
**Description** : Les emails doivent toujours être triés par date de réception, les plus récents en haut.  
**Spécifications** :
- `.order('received_at', { ascending: false })` ou équivalent
- Le classement par régie est maintenu comme regroupement visuel, mais à l'intérieur de chaque groupe, c'est par date desc
- OU : si pas de regroupement par régie, simplement trier par date desc globalement

### Tâche 1.5 — Notifications nouveaux mails + redirection
**Fichier** : `src/components/layout/Sidebar.tsx` (badges) + `src/app/(dashboard)/inbox/page.tsx`  
**Description** : Les nouveaux mails doivent apparaître dans les notifications de la sidebar, et cliquer dessus redirige vers le mail.  
**Spécifications** :
- Le badge rouge sur "Boîte de réception" dans la sidebar affiche le nombre d'emails non lus
- Requête Supabase : `SELECT COUNT(*) FROM emails WHERE is_read = false`
- Si la colonne `is_read` n'existe pas, l'ajouter : `ALTER TABLE emails ADD COLUMN is_read BOOLEAN DEFAULT false;`
- Quand on clique sur un email dans l'inbox, le marquer comme lu
- Les notifications cliquables dans le header redirigent vers `/inbox?email_id=<id>` et scrollent/ouvrent le mail

### Tâche 1.6 — Extraction IA complète des bons d'intervention
**Fichier** : Workflow n8n `[MASTER] INBOX_ROUTER` (ID: `SkSyB6FBW0p1NZfp`) + `Email Richoz` (ID: `O76zvkDVEHxJV9Er`)  
**Description** : L'agent IA doit extraire TOUTES les infos du bon d'intervention pour pré-remplir automatiquement la planification.  
**Champs à extraire** :
- `work_order_number` (numéro de bon de travail)
- `client_name` (nom du locataire)
- `client_phone` (téléphone)
- `client_email` (email)
- `address` (adresse complète de l'immeuble)
- `regie_name` → matcher avec `regies.name` pour obtenir `regie_id`
- `owner_name` (propriétaire)
- `description` (description du problème/travaux)
- `priority` (urgence si mentionnée)
- `keys_info` (info sur les clés : "chez le locataire", "chez le concierge", etc.)
**Stockage** : Ces infos sont stockées dans la table `emails` dans un champ JSONB `extracted_data` ou dans des colonnes dédiées.  
**Côté dashboard** : Quand on clique "Planifier" sur un email, le formulaire de création d'intervention est pré-rempli avec ces données.

---

## MODULE 2 — EMAILS DE CONFIRMATION

### Tâche 2.1 — Choix d'envoi de confirmation
**Fichier** : Le composant/modal de planification d'intervention (probablement dans `src/components/interventions/InterventionForm.tsx` ou le split view dans `calendar/page.tsx`)  
**Description** : Après planification, proposer le choix d'envoyer ou non un email de confirmation, et à qui.  
**Spécifications** :
- Après le submit du formulaire de planification, afficher un écran/modal de confirmation avec :
  - Checkbox : "Envoyer un email de confirmation à la régie" (coché par défaut si régie sélectionnée)
  - Checkbox : "Envoyer un email de confirmation au locataire" (décoché par défaut)
  - Champ email régie : pré-rempli depuis `regies.email` (éditable)
  - Champ email locataire : pré-rempli depuis `client_info.email` si disponible (éditable)
  - Bouton "Envoyer" et "Passer" (skip)
- L'envoi appelle le webhook n8n `[MASTER] CONFIRMATION_REGIE` avec les destinataires choisis

### Tâche 2.2 — Option désabonnement dans les mails
**Description** : Les mails de confirmation incluent un lien "Ne plus recevoir ces confirmations automatiques".  
**Spécifications** :
- Ajouter un footer dans le template HTML du mail de confirmation (côté n8n)
- Le lien pointe vers une page publique `/unsubscribe?token=<token_régie>` 
- La table `regies` a une colonne `receive_confirmations BOOLEAN DEFAULT true`
- Quand la régie se désabonne, le workflow n8n vérifie ce flag avant d'envoyer

---

## MODULE 3 — CALENDRIER

### Tâche 3.1 — Deux calendriers séparés (Chantier / Dépannage)
**Fichiers** : `src/app/(dashboard)/calendar/page.tsx` + `src/components/calendar/TimeGridView.tsx`  
**Description** : Ajouter des onglets pour basculer entre la vue Chantier et la vue Dépannage.  
**Spécifications** :
- Ajouter un second niveau d'onglets sous Mois/Semaine/Jour : **"Tout" | "Dépannage" | "Chantier"**
- "Tout" = vue actuelle (les deux types)
- "Dépannage" = filtre `intervention_type = 'depannage'`
- "Chantier" = filtre `intervention_type = 'chantier'`
- Le filtre s'applique à toutes les vues (mois, semaine, jour)
- Style des onglets : pills comme les onglets Mois/Semaine/Jour existants, mais plus petits. Couleurs : rouge pour Dépannage, bleu pour Chantier, gris pour Tout.

### Tâche 3.2 — Couleurs par technicien
**Fichiers** : `src/app/(dashboard)/calendar/page.tsx` + `src/components/calendar/TimeGridView.tsx`  
**Description** : Les blocs d'intervention dans le calendrier sont colorés par technicien assigné, pas par type.  
**Spécifications** :
- Définir une palette de 8-10 couleurs distinctes (pas les mêmes que les couleurs de statut)
- Chaque technicien se voit attribuer une couleur basée sur son index dans la liste des techniciens
- Palette suggérée : `['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']`
- Le type (chantier/dépannage) est indiqué par une icône 🏗️/🔧 dans le bloc, pas par la couleur
- Ajouter une légende en bas du calendrier avec les couleurs des techniciens
- La table `users` peut avoir une colonne `color` (optionnel) — sinon utiliser l'index

### Tâche 3.3 — Anniversaires et congés plus visibles
**Fichiers** : `src/components/calendar/TimeGridView.tsx`  
**Description** : Rendre les anniversaires et congés plus visibles dans le calendrier.  
**Spécifications** :
- Congés : barre pleine en haut de la colonne du jour, hauteur 32px minimum, couleur verte plus saturée (`bg-emerald-200 border-emerald-400`), texte plus gros
- Anniversaires : badge avec emoji 🎂 plus grand, fond violet plus saturé, position fixe en haut
- En vue mois : les congés et anniversaires sont affichés AVANT les interventions dans chaque cellule

### Tâche 3.4 — Bloquer technicien en congé lors de la planification
**Fichier** : Le composant de planification (split view dans `calendar/page.tsx` + `InterventionForm.tsx`)  
**Description** : Si un technicien est en congé le jour sélectionné, il ne peut pas être assigné.  
**Spécifications** :
- Quand une date est sélectionnée dans le formulaire de planification, vérifier les congés approuvés
- Requête : `SELECT technician_id FROM leave_requests WHERE status = 'approved' AND start_date <= :date AND end_date >= :date`
- Les techniciens en congé ce jour-là sont grisés dans le dropdown avec la mention "(En congé)"
- Ils sont désactivés (`disabled`) — on ne peut pas les sélectionner
- Si on change la date et que le technicien assigné est en congé sur la nouvelle date, afficher un warning

---

## MODULE 4 — RAPPORTS D'INTERVENTION

### Tâche 4.1 — Format rapport identique à l'existant
**Fichier** : Workflow n8n `Rapport Intervention Richoz` (ID: `chtGnkr3nBHUbEV9`) + template HTML Gotenberg  
**Description** : Le rapport généré doit reproduire exactement le format du PDF Richoz existant.  
**Structure du rapport (d'après le PDF fourni)** :
1. **Header** : "RICHOZ SANITAIRE" en gros, bleu et rouge + "Rapport d'intervention" avec icône
2. **Bon de travail numéro** : bandeau bleu avec le numéro
3. **Propriétaire & Régie** : section avec icône 🏠, champs propriétaire, régie, téléphone, email
4. **Locataire** : section centrée, adresse de l'immeuble, chez Madame/Monsieur, téléphone/email, clés
5. **Description de l'intervention** : sections structurées :
   - **Constat à l'arrivée** (titre rouge gras)
   - **Investigations réalisées** (titre souligné gras)
   - **Analyse de la situation** (titre rouge gras)
   - **Conclusion** (titre souligné gras)
6. **Date de l'intervention** : bandeau bleu, date + "Terminée : oui/non"
7. **Photos Avant** : bandeau bleu, photos avec possibilité d'annotations (flèches bleues avec texte)
8. **Photos Après** : idem
9. **Footer** : RICHOZ SANITAIRE 50 Route de Chancy 1213 Petit-Lancy — email — téléphone — pagination
10. **Watermark** : goutte d'eau bleue en filigrane sur chaque page

**Important** : Le rapport est généré en **Word (.docx)** et non en PDF. La secrétaire doit pouvoir :
- Modifier le texte
- Ajouter des flèches/annotations sur les photos
- Restructurer les sections

### Tâche 4.2 — Export en .docx
**Fichier** : Nouveau endpoint ou modification du workflow n8n rapport  
**Description** : Quand le technicien soumet un rapport, il est généré en .docx (pas en PDF).  
**Spécifications** :
- Utiliser la librairie `docx` (JavaScript) dans n8n via un Code Node pour générer le .docx
- Le .docx doit reproduire la structure du PDF (voir 4.1) avec :
  - Le logo Richoz en haut
  - Les sections avec styles (titres rouges, bandeaux bleus)
  - Les photos insérées dans le document
  - Le watermark goutte d'eau (si possible en .docx, sinon en fond de page)
  - Le footer Richoz avec pagination
- Le .docx est uploadé dans Supabase Storage (bucket `reports/`) et l'URL est stockée dans `reports.docx_url`
- La secrétaire voit le bouton "Télécharger Word" au lieu de "Télécharger PDF" dans la validation rapport
- **Migration DB** : `ALTER TABLE reports ADD COLUMN docx_url TEXT;`

### Tâche 4.3 — Supprimer l'audio
**Fichier** : `src/components/reports/ReportForm.tsx` ou équivalent (le formulaire technicien)  
**Description** : Retirer complètement la fonction d'enregistrement audio des rapports.  
**Spécifications** :
- Supprimer le composant VoiceRecorder / bouton micro du formulaire de rapport
- Supprimer toute référence à `audio_url` dans le formulaire
- Ne PAS supprimer la colonne `audio_url` de la DB (garder pour compatibilité)
- Ne pas afficher l'audio dans la vue de validation non plus

---

## MODULE 5 — SESSION TECHNICIEN CHANTIER

### Tâche 5.1 — Nouvelle interface technicien chantier
**Fichiers** : Nouveau composant `src/components/technician/ChantierSession.tsx` + page dédiée  
**Description** : Les techniciens assignés à des chantiers ont une interface différente des techniciens dépannage.  
**Spécifications de l'interface chantier** :

**Vue principale : Tableau de bord chantier**
- Nom du chantier + adresse
- Progression globale (barre de progression)
- Contacts clés :
  - Architecte : nom, téléphone, email
  - Chef de chantier : nom, téléphone, email  
  - Régie : nom, téléphone, email
  - Propriétaire : nom, téléphone
- Section **Clés & Accès** :
  - Où sont les clés (chez concierge, boîte à clés, code d'accès)
  - Notes d'accès
- Section **Messages / Journal de chantier** :
  - Fil de messages chronologique (comme un chat)
  - Le technicien peut poster des messages d'avancement avec photos
  - La secrétaire/patron voit les messages dans le dashboard
  - Chaque message a : date, auteur, texte, photos optionnelles
- Section **Avis de coupure** :
  - Bouton "Déclarer une coupure" → formulaire : type (eau/électricité/gaz), date début, date fin estimée, étages concernés, message pour locataires
  - Génère automatiquement un avis à afficher dans l'immeuble (template A4)
  - Historique des coupures passées
- Section **Documents** :
  - Plans (PDF/images uploadés)
  - Rapport de chantier (distinct du rapport dépannage)

**Migration DB** :
```sql
-- Table pour les chantiers (lié à une intervention de type 'chantier')
CREATE TABLE chantier_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE,
  architect_name TEXT,
  architect_phone TEXT,
  architect_email TEXT,
  site_manager_name TEXT,
  site_manager_phone TEXT,
  keys_location TEXT,
  access_notes TEXT,
  progress_percent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages de chantier (journal)
CREATE TABLE chantier_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Avis de coupure
CREATE TABLE chantier_cutoff_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE,
  cutoff_type TEXT NOT NULL, -- 'eau', 'electricite', 'gaz'
  start_date TIMESTAMPTZ NOT NULL,
  end_date_estimated TIMESTAMPTZ,
  floors_affected TEXT,
  message TEXT,
  notice_pdf_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tâche 5.2 — Différencier la session technicien dépannage vs chantier
**Fichier** : `src/app/(dashboard)/technician/page.tsx` ou la page de session technicien  
**Description** : Quand le technicien se connecte, il voit ses interventions. Si c'est un dépannage → interface actuelle. Si c'est un chantier → nouvelle interface ChantierSession.  
**Spécifications** :
- Dans la liste des interventions du technicien, ajouter un badge de type (🔧 Dépannage / 🏗️ Chantier)
- Cliquer sur un dépannage → formulaire rapport actuel
- Cliquer sur un chantier → ChantierSession (nouvelle interface)

---

## MODULE 6 — RELANCES FACTURES

### Tâche 6.1 — Première relance à 40 jours
**Fichier** : Workflow n8n `Richoz - Relance Factures` (ID: `ZcJMKC744VFAe61o`)  
**Description** : La première relance automatique est envoyée 40 jours après la date de facture (pas 30).  
**Spécifications** :
- Modifier le nœud Schedule/Cron ou le nœud IF qui vérifie le délai
- Condition : `NOW() - invoice_date >= 40 days` pour la première relance
- Deuxième relance : 60 jours
- Troisième relance : 90 jours (avec mention "mise en demeure")

### Tâche 6.2 — Mention "message automatique" dans le mail
**Fichier** : Template email dans le workflow n8n relance  
**Description** : Le mail de relance doit clairement indiquer que c'est un envoi automatique.  
**Spécifications** :
- Ajouter en bas du mail, avant le footer :
  > *Ce message a été envoyé automatiquement par notre système de gestion. Pour toute question, veuillez contacter notre secrétariat au +41 22 313 00 27 ou par email à info@rz-sanitaire.ch*
- Le ton du mail ne doit PAS donner l'impression que c'est le patron qui écrit personnellement
- Signature : "Service comptabilité — RICHOZ Sanitaire" (pas un nom de personne)

---

## ORDRE D'EXÉCUTION RECOMMANDÉ

### Sprint 1 — Quick wins (permet une démo fonctionnelle)
1. Tâche 1.4 — Tri inbox par date
2. Tâche 1.2 — Bouton Urgence cliquable
3. Tâche 1.1 — Filtre par régie inbox
4. Tâche 1.3 — Bouton Planifier manquant
5. Tâche 4.3 — Supprimer audio rapports
6. Tâche 3.4 — Bloquer technicien en congé
7. Tâche 6.1 + 6.2 — Relances factures 40j + mention auto

### Sprint 2 — Fonctionnalités métier
8. Tâche 3.1 — Onglets Chantier/Dépannage calendrier
9. Tâche 3.2 — Couleurs par technicien
10. Tâche 3.3 — Congés/anniversaires plus visibles
11. Tâche 2.1 — Choix envoi confirmation
12. Tâche 1.5 — Notifications nouveaux mails
13. Tâche 4.2 — Export rapport .docx (reproduire format Richoz)

### Sprint 3 — IA & nouveau module chantier
14. Tâche 1.6 — Extraction IA bons d'intervention
15. Tâche 5.1 — Interface technicien chantier
16. Tâche 5.2 — Différencier dépannage/chantier
17. Tâche 2.2 — Option désabonnement mails
18. Tâche 4.1 — Format rapport identique existant

---

## MIGRATIONS DB RÉCAPITULATIVES

```sql
-- Module 1 : Inbox
ALTER TABLE emails ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}';

-- Module 2 : Confirmation
ALTER TABLE regies ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE regies ADD COLUMN IF NOT EXISTS receive_confirmations BOOLEAN DEFAULT true;

-- Module 4 : Rapports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS docx_url TEXT;

-- Module 5 : Chantier
CREATE TABLE IF NOT EXISTS chantier_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE,
  architect_name TEXT,
  architect_phone TEXT,
  architect_email TEXT,
  site_manager_name TEXT,
  site_manager_phone TEXT,
  keys_location TEXT,
  access_notes TEXT,
  progress_percent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chantier_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chantier_cutoff_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE,
  cutoff_type TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date_estimated TIMESTAMPTZ,
  floors_affected TEXT,
  message TEXT,
  notice_pdf_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## NOTES TECHNIQUES

- **Webhook n8n quote-pdf** : `https://primary-production-66b7.up.railway.app/webhook/quote-pdf`
- **Gotenberg** : `https://gotenberggotenberg8-production-7f2f.up.railway.app/forms/chromium/convert/html`
- **Logo Richoz** : `https://yuumzhlvmqcbogqzuonp.supabase.co/storage/v1/object/public/photos/logo%20richoz/Logo%20Richoz%20Sanitaire%20(1).png`
- **Supabase Storage** : Ajouter header `x-upsert: true` pour l'upload de fichiers existants
- **Format rapport Word** : Utiliser la librairie `docx` en JavaScript (node n8n Code) — pas de conversion HTML→DOCX