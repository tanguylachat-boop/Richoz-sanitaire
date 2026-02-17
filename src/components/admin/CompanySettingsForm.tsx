'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  getCompanySettings,
  updateCompanySettings,
  type CompanySettingsPayload,
} from '@/app/(dashboard)/admin/settings/actions';
import {
  Building2,
  MapPin,
  Mail,
  Phone,
  CreditCard,
  FileText,
  Image as ImageIcon,
  Loader2,
  Save,
  CheckCircle,
} from 'lucide-react';

interface FieldProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
}

function FormField({ label, icon, children, hint }: FieldProps) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
        {icon}
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 disabled:bg-gray-50';
const textareaClass =
  'w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 disabled:bg-gray-50 resize-none';

export function CompanySettingsForm() {
  const [form, setForm] = useState<CompanySettingsPayload>({
    company_name: '',
    address: '',
    email: '',
    phone: '',
    iban: '',
    vat_number: '',
    logo_url: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  // Load existing settings
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const result = await getCompanySettings();
      if (result.success && result.data) {
        setForm({
          company_name: result.data.company_name || '',
          address: result.data.address || '',
          email: result.data.email || '',
          phone: result.data.phone || '',
          iban: result.data.iban || '',
          vat_number: result.data.vat_number || '',
          logo_url: result.data.logo_url || '',
        });
      }
      setIsLoading(false);
    };
    load();
  }, []);

  const handleChange = (field: keyof CompanySettingsPayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      const result = await updateCompanySettings(form);

      if (result.success) {
        toast.success('Paramètres sauvegardés avec succès !');
        setSaved(true);
        router.refresh();
      } else {
        toast.error(result.error || 'Erreur lors de la sauvegarde.');
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chargement des paramètres...</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Section : Identité */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Identité de l&apos;entreprise
        </h3>
        <div className="space-y-4">
          <FormField
            label="Nom de l'entreprise"
            icon={<Building2 className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => handleChange('company_name', e.target.value)}
              placeholder="Ex: Richoz Sanitaire SA"
              required
              disabled={isPending}
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Adresse complète"
            icon={<MapPin className="w-4 h-4 text-gray-400" />}
          >
            <textarea
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Rue, NPA Ville, Canton"
              rows={2}
              disabled={isPending}
              className={textareaClass}
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Email de contact"
              icon={<Mail className="w-4 h-4 text-gray-400" />}
            >
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="info@entreprise.ch"
                disabled={isPending}
                className={inputClass}
              />
            </FormField>

            <FormField
              label="Téléphone"
              icon={<Phone className="w-4 h-4 text-gray-400" />}
            >
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+41 21 000 00 00"
                disabled={isPending}
                className={inputClass}
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* Séparateur */}
      <hr className="border-gray-200" />

      {/* Section : Facturation */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Informations de facturation
        </h3>
        <div className="space-y-4">
          <FormField
            label="IBAN"
            icon={<CreditCard className="w-4 h-4 text-gray-400" />}
            hint="Utilisé pour les bulletins de versement QR"
          >
            <input
              type="text"
              value={form.iban}
              onChange={(e) => handleChange('iban', e.target.value)}
              placeholder="CH93 0076 2011 6238 5295 7"
              disabled={isPending}
              className={`${inputClass} font-mono`}
            />
          </FormField>

          <FormField
            label="Numéro TVA / IDE"
            icon={<FileText className="w-4 h-4 text-gray-400" />}
            hint="Numéro d'identification des entreprises"
          >
            <input
              type="text"
              value={form.vat_number}
              onChange={(e) => handleChange('vat_number', e.target.value)}
              placeholder="CHE-123.456.789"
              disabled={isPending}
              className={`${inputClass} font-mono`}
            />
          </FormField>
        </div>
      </div>

      {/* Séparateur */}
      <hr className="border-gray-200" />

      {/* Section : Logo */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Logo
        </h3>
        <FormField
          label="URL du logo"
          icon={<ImageIcon className="w-4 h-4 text-gray-400" />}
          hint="Lien vers l'image du logo (PNG ou SVG recommandé). Apparaîtra sur les factures."
        >
          <input
            type="url"
            value={form.logo_url || ''}
            onChange={(e) => handleChange('logo_url', e.target.value)}
            placeholder="https://example.com/logo.png"
            disabled={isPending}
            className={inputClass}
          />
        </FormField>

        {/* Logo preview */}
        {form.logo_url && (
          <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs text-gray-500 mb-2">Aperçu :</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.logo_url}
              alt="Logo preview"
              className="max-h-16 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sauvegarde...
            </>
          ) : saved ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Sauvegardé
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Sauvegarder
            </>
          )}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">
            ✓ Modifications enregistrées
          </span>
        )}
      </div>
    </form>
  );
}
