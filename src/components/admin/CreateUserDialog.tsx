'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types/database';
import { Plus, Loader2, User, Mail, Shield, Cake, Wrench, CheckCircle, Copy, Phone } from 'lucide-react';

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: 'technician', label: 'Technicien', description: 'Accès mobile, rapports terrain' },
  { value: 'secretary', label: 'Secrétariat', description: 'Gestion des interventions et factures' },
  { value: 'admin', label: 'Administrateur', description: 'Accès complet à toutes les fonctionnalités' },
];

const TECH_TYPE_OPTIONS: { value: 'depannage' | 'chantier'; label: string; emoji: string }[] = [
  { value: 'depannage', label: 'Dépannage', emoji: '🔧' },
  { value: 'chantier', label: 'Chantier', emoji: '🏗️' },
];

export function CreateUserDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Success state
  const [successData, setSuccessData] = useState<{ tempPassword: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    role: 'technician' as UserRole,
    interventionTypePreference: 'depannage' as 'depannage' | 'chantier',
    calendarColor: '',
  });

  const [fieldError, setFieldError] = useState('');

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', email: '', phone: '', birthDate: '', role: 'technician', interventionTypePreference: 'depannage', calendarColor: '' });
    setFieldError('');
    setSuccessData(null);
    setCopied(false);
  };

  const handleOpen = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setIsOpen(false);
      resetForm();
    }
  };

  const handleSuccessClose = () => {
    setSuccessData(null);
    setIsOpen(false);
    resetForm();
    router.refresh();
  };

  const handleCopyPassword = async () => {
    if (!successData) return;
    await navigator.clipboard.writeText(successData.tempPassword);
    setCopied(true);
    toast.success('Mot de passe copié !');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');

    // Client-side validation
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFieldError('Le prénom et le nom sont requis.');
      return;
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      setFieldError('Adresse email invalide.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: form.email.trim().toLowerCase(),
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          role: form.role,
          phone: form.phone.trim() || null,
          intervention_type_preference: form.role === 'technician' ? form.interventionTypePreference : null,
          birth_date: form.birthDate || null,
          calendar_color: form.role === 'technician' && form.calendarColor ? form.calendarColor : null,
        },
      });

      if (error) {
        setFieldError(error.message || 'Erreur lors de la création.');
        toast.error(error.message || 'Erreur lors de la création.');
        return;
      }

      if (data?.error) {
        setFieldError(data.error);
        toast.error(data.error);
        return;
      }

      if (data?.success) {
        setSuccessData({
          tempPassword: data.temp_password,
          email: form.email.trim().toLowerCase(),
        });
        toast.success('Utilisateur créé avec succès !');
      } else {
        setFieldError('Réponse inattendue du serveur.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur réseau.';
      setFieldError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success modal content
  if (successData) {
    return (
      <>
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nouvel utilisateur</span>
        </button>

        <Modal isOpen={isOpen} onClose={handleSuccessClose} title="Utilisateur créé" size="md">
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Utilisateur créé avec succès !</h3>
            <p className="text-sm text-gray-500 mb-6">
              Transmettez ces identifiants au nouvel utilisateur.
            </p>

            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3 mb-6">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
                <p className="text-sm font-medium text-gray-900">{successData.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mot de passe provisoire</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-base font-mono font-bold text-gray-900 select-all">
                    {successData.tempPassword}
                  </code>
                  <button
                    onClick={handleCopyPassword}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Copier"
                  >
                    {copied ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              L&apos;utilisateur pourra changer son mot de passe à la première connexion.
            </p>

            <button
              onClick={handleSuccessClose}
              className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Fermer
            </button>
          </div>
        </Modal>
      </>
    );
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Nouvel utilisateur</span>
      </button>

      {/* Dialog */}
      <Modal isOpen={isOpen} onClose={handleClose} title="Nouvel utilisateur" size="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error banner */}
          {fieldError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {fieldError}
            </div>
          )}

          {/* Name fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Prénom
                </span>
              </label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Jean"
                required
                disabled={isSubmitting}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nom
              </label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Dupont"
                required
                disabled={isSubmitting}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                Adresse email
              </span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jean.dupont@richoz.ch"
              required
              disabled={isSubmitting}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                Téléphone
              </span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+41 79 123 45 67"
              disabled={isSubmitting}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />
          </div>

          {/* Date de naissance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Cake className="w-3.5 h-3.5" />
                Date de naissance
              </span>
            </label>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              disabled={isSubmitting}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Rôle
              </span>
            </label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    form.role === option.value
                      ? 'border-blue-300 bg-blue-50/50 ring-1 ring-blue-200'
                      : 'border-gray-200 hover:bg-gray-50'
                  } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={form.role === option.value}
                    onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                    disabled={isSubmitting}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      form.role === option.value ? 'border-blue-600' : 'border-gray-300'
                    }`}
                  >
                    {form.role === option.value && (
                      <div className="w-2 h-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{option.label}</p>
                    <p className="text-xs text-gray-500">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Tech Type (only for technicians) */}
          {form.role === 'technician' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />
                  Type de technicien
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TECH_TYPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                      form.interventionTypePreference === option.value
                        ? 'border-blue-300 bg-blue-50/50 ring-1 ring-blue-200'
                        : 'border-gray-200 hover:bg-gray-50'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="techType"
                      value={option.value}
                      checked={form.interventionTypePreference === option.value}
                      onChange={(e) => setForm({ ...form, interventionTypePreference: e.target.value as 'depannage' | 'chantier' })}
                      disabled={isSubmitting}
                      className="sr-only"
                    />
                    <span className="text-lg">{option.emoji}</span>
                    <span className="text-sm font-medium text-gray-900">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Création...
                </>
              ) : (
                'Créer l\'utilisateur'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
