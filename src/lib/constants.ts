import type { UserRole, InterventionStatus, ReportStatus, InvoiceStatus, QuoteStatus } from '@/types/database';

// ==============================================
// ROLE CONFIGURATION
// ==============================================

export const ROLES: Record<UserRole, { label: string; color: string }> = {
  admin: { label: 'Administrateur', color: 'bg-purple-100 text-purple-800' },
  secretary: { label: 'Secrétariat', color: 'bg-blue-100 text-blue-800' },
  technician: { label: 'Technicien', color: 'bg-green-100 text-green-800' },
};

// ==============================================
// STATUS LABELS (French UI)
// ==============================================

export const INTERVENTION_STATUS: Record<InterventionStatus, { label: string; color: string; icon: string }> = {
  nouveau: { label: 'Nouveau', color: 'bg-blue-100 text-blue-800', icon: 'inbox' },
  planifie: { label: 'Planifié', color: 'bg-yellow-100 text-yellow-800', icon: 'calendar' },
  en_cours: { label: 'En cours', color: 'bg-orange-100 text-orange-800', icon: 'clock' },
  termine: { label: 'Terminé', color: 'bg-green-100 text-green-800', icon: 'check' },
  ready_to_bill: { label: 'Prêt à facturer', color: 'bg-amber-100 text-amber-800', icon: 'file-clock' },
  billed: { label: 'Facturé', color: 'bg-purple-100 text-purple-800', icon: 'file-text' },
  annule: { label: 'Annulé', color: 'bg-gray-100 text-gray-800', icon: 'x' },
};

export const REPORT_STATUS: Record<ReportStatus, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-800' },
  submitted: { label: 'Soumis', color: 'bg-blue-100 text-blue-800' },
  validated: { label: 'Validé', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejeté', color: 'bg-red-100 text-red-800' },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; color: string }> = {
  generated: { label: 'Générée', color: 'bg-cyan-100 text-cyan-800' },
  sent: { label: 'Envoyée', color: 'bg-purple-100 text-purple-800' },
  paid: { label: 'Payée', color: 'bg-green-100 text-green-800' },
};

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-800' },
  sent: { label: 'Envoyé', color: 'bg-blue-100 text-blue-800' },
  accepted: { label: 'Accepté', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Refusé', color: 'bg-red-100 text-red-800' },
  expired: { label: 'Expiré', color: 'bg-yellow-100 text-yellow-800' },
};

// ==============================================
// NAVIGATION ROUTES
// ==============================================

export const ADMIN_ROUTES = [
  { href: '/inbox', label: 'Boîte de réception', icon: 'inbox' },
  { href: '/calendar', label: 'Calendrier', icon: 'calendar' },
  { href: '/interventions', label: 'Interventions', icon: 'wrench' },
  { href: '/reports/validate', label: 'Validation rapports', icon: 'clipboard-check' },
  { href: '/invoices', label: 'Factures', icon: 'file-text' },
  { href: '/quotes', label: 'Devis', icon: 'file-plus' },
  { href: '/products', label: 'Catalogue', icon: 'package' },
];

export const ADMIN_ONLY_ROUTES = [
  { href: '/admin/users', label: 'Utilisateurs', icon: 'users' },
  { href: '/admin/regies', label: 'Régies', icon: 'building' },
  { href: '/admin/settings', label: 'Paramètres', icon: 'settings' },
];

export const TECHNICIAN_ROUTES = [
  { href: '/technician/today', label: "Aujourd'hui", icon: 'calendar-check' },
  { href: '/technician/week', label: 'Ma semaine', icon: 'calendar' },
  { href: '/interventions', label: 'Historique', icon: 'history' },
];

// ==============================================
// PRODUCT CATEGORIES
// ==============================================

export const PRODUCT_CATEGORIES = [
  { value: 'service', label: 'Service' },
  { value: 'plomberie', label: 'Plomberie' },
  { value: 'chauffage', label: 'Chauffage' },
  { value: 'sanitaire', label: 'Sanitaire' },
  { value: 'autre', label: 'Autre' },
];

// ==============================================
// PRIORITY LEVELS
// ==============================================

export const PRIORITY_LEVELS = [
  { value: 0, label: 'Normal', color: 'bg-gray-100 text-gray-800' },
  { value: 1, label: 'Urgent', color: 'bg-orange-100 text-orange-800' },
  { value: 2, label: 'Urgence absolue', color: 'bg-red-100 text-red-800' },
];

// ==============================================
// VAT RATE (Switzerland)
// ==============================================

export const DEFAULT_VAT_RATE = 7.7;

// ==============================================
// CALENDAR CONFIGURATION
// ==============================================

export const CALENDAR_CONFIG = {
  locale: 'fr-CH',
  firstDay: 1, // Monday
  businessHours: {
    startTime: '07:00',
    endTime: '18:00',
    daysOfWeek: [1, 2, 3, 4, 5], // Monday - Friday
  },
  slotDuration: '00:30:00',
  slotMinTime: '06:00:00',
  slotMaxTime: '20:00:00',
};
