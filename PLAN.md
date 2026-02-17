# PLAN DU PROJET (Richoz Sanitaire)

## Status Actuel
- [x] Create SQL schema with tables, RLS, triggers, Realtime, and Storage Buckets
- [x] Create Next.js project structure and package.json
- [x] Create Supabase client configurations
- [x] Create Dashboard Layout with role based navigation
- [x] Create RoleGuard and Sidebar components
- [x] Create API webhook endpoints for n8n
- [x] Create styles (Tailwind Config + globals.css)
- [x] Create Admin Dashboard (Calendar, Interventions, Inbox)
- [x] Create Modal & InterventionForm (create/edit/delete with technician assignment)
- [x] Create Inbox page with grouped view by Régie
- [x] Create Technician mobile-first views (Today, Week, Report)
- [x] Create Report validation page with photo gallery and billing summary
- [x] Create Reports history page with tabs navigation

## En Cours
- [ ] Test de bout en bout avec données réelles
- [ ] Create Storage Buckets (photos, audio) in Supabase Dashboard

## Consignes Strictes (ExitPlanMode)
1. Le Code (noms de variables, fonctions, commentaires) doit rester en Anglais (standard dev).
2. L'Interface Utilisateur (UI) (boutons, labels, menus, messages d'erreur) doit être impérativement en Français.
3. Activer le Realtime sur la table interventions.
4. Créer les Storage Buckets pour les fichiers.
