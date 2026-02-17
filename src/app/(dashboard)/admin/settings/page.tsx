import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CompanySettingsForm } from '@/components/admin/CompanySettingsForm';
import {
  Building2,
  Bell,
  Database,
  Shield,
} from 'lucide-react';

export default async function SettingsPage() {
  const supabase = createClient();

  // Get current user to verify admin access
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || (profile as { role: string }).role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-gray-500">
          Configuration générale de l&apos;application
        </p>
      </div>

      {/* =============================================
          SECTION : Entreprise & Facturation (formulaire)
          ============================================= */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Entreprise & Facturation</h3>
              <p className="text-sm text-gray-500">
                Informations affichées sur vos factures et devis
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <CompanySettingsForm />
        </div>
      </div>

      {/* =============================================
          SECTION : Notifications (lecture seule pour l'instant)
          ============================================= */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Bell className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              <p className="text-sm text-gray-500">Alertes et communications</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {[
            { label: 'Email nouvelles demandes', value: 'Activé' },
            { label: 'Rappel factures impayées', value: 'Activé' },
            { label: 'Résumé quotidien', value: 'Désactivé' },
          ].map((item, idx) => (
            <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
              <span className="text-sm text-gray-600">{item.label}</span>
              <span className={`text-sm font-medium ${item.value === 'Activé' ? 'text-emerald-600' : 'text-gray-400'}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* =============================================
          SECTION : Intégrations (lecture seule pour l'instant)
          ============================================= */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
              <Database className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Intégrations</h3>
              <p className="text-sm text-gray-500">Services connectés</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {[
            { label: 'Gmail', value: 'Connecté', active: true },
            { label: 'Google Calendar', value: 'Connecté', active: true },
            { label: 'Tayo Comptabilité', value: 'Non configuré', active: false },
          ].map((item, idx) => (
            <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
              <span className="text-sm text-gray-600">{item.label}</span>
              <span className={`text-sm font-medium ${item.active ? 'text-emerald-600' : 'text-gray-400'}`}>
                {item.active ? '✓ ' : ''}{item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* =============================================
          DANGER ZONE
          ============================================= */}
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-red-100 bg-red-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <Shield className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-red-900">Zone sensible</h3>
              <p className="text-sm text-red-700">Actions irréversibles</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Exporter les données</p>
              <p className="text-sm text-gray-500">Télécharger toutes les données au format JSON</p>
            </div>
            <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
              Exporter
            </button>
          </div>
        </div>
      </div>

      {/* Version info */}
      <div className="text-center text-sm text-gray-400">
        <p>Richoz Sanitaire v1.0.0</p>
        <p>© 2026 Tous droits réservés</p>
      </div>
    </div>
  );
}
