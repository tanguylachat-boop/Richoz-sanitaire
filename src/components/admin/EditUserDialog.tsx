'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { updateUser } from '@/app/(dashboard)/admin/users/actions';
import type { User, UserRole } from '@/types/database';
import { Loader2, User as UserIcon, Mail, Phone, Shield, Cake, Wrench, Palette, Palmtree } from 'lucide-react';
import { TECHNICIAN_COLORS } from '@/components/calendar/TimeGridView';

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: 'technician', label: 'Technicien', description: 'Accès mobile, rapports terrain' },
  { value: 'secretary', label: 'Secrétariat', description: 'Gestion des interventions et factures' },
  { value: 'admin', label: 'Administrateur', description: 'Accès complet à toutes les fonctionnalités' },
];

const TECH_TYPE_OPTIONS: { value: 'depannage' | 'chantier'; label: string; emoji: string }[] = [
  { value: 'depannage', label: 'Dépannage', emoji: '🔧' },
  { value: 'chantier', label: 'Chantier', emoji: '🏗️' },
];

interface EditUserDialogProps {
  user: User;
  children: React.ReactNode;
}

export function EditUserDialog({ user, children }: EditUserDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    phone: user.phone || '',
    birthDate: user.birth_date || '',
    role: user.role as UserRole,
    interventionTypePreference: (user.intervention_type_preference || 'depannage') as 'depannage' | 'chantier',
    calendarColor: (user as Record<string, unknown>).calendar_color as string || '',
    annualLeaveWeeks: ((user as Record<string, unknown>).annual_leave_weeks as number) ?? 5,
  });

  const [fieldError, setFieldError] = useState('');

  const resetForm = () => {
    setForm({
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone || '',
      birthDate: user.birth_date || '',
      role: user.role,
      interventionTypePreference: (user.intervention_type_preference || 'depannage') as 'depannage' | 'chantier',
      calendarColor: (user as Record<string, unknown>).calendar_color as string || '',
      annualLeaveWeeks: ((user as Record<string, unknown>).annual_leave_weeks as number) ?? 5,
    });
    setFieldError('');
  };

  const handleOpen = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleClose = () => {
    if (!isPending) {
      setIsOpen(false);
      resetForm();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFieldError('Le prénom et le nom sont requis.');
      return;
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      setFieldError('Adresse email invalide.');
      return;
    }

    startTransition(async () => {
      const result = await updateUser({
        id: user.id,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        birthDate: form.birthDate,
        role: form.role,
        interventionTypePreference: form.role === 'technician' ? form.interventionTypePreference : undefined,
        calendarColor: form.role === 'technician' ? (form.calendarColor || null) : null,
        annualLeaveWeeks: form.annualLeaveWeeks,
      });

      if (result.success) {
        toast.success('Utilisateur mis à jour !');
        setIsOpen(false);
        router.refresh();
      } else {
        setFieldError(result.error || 'Erreur inconnue.');
        toast.error(result.error || 'Erreur lors de la mise à jour.');
      }
    });
  };

  return (
    <>
      <div
        className="p-4 hover:bg-blue-50/50 transition-colors cursor-pointer"
        onClick={handleOpen}
      >
        {children}
      </div>

      <Modal isOpen={isOpen} onClose={handleClose} title="Modifier l'utilisateur" size="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          {fieldError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {fieldError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5" />
                  Prénom
                </span>
              </label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Jean"
                required
                disabled={isPending}
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
                disabled={isPending}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
              />
            </div>
          </div>

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
              disabled={isPending}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />
          </div>

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
              disabled={isPending}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                disabled={isPending}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Palmtree className="w-3.5 h-3.5" />
                  Semaines de congés / an
                </span>
              </label>
              <input
                type="number"
                min={0}
                max={52}
                step={1}
                value={form.annualLeaveWeeks}
                onChange={(e) => setForm({ ...form, annualLeaveWeeks: Math.max(0, Math.min(52, parseInt(e.target.value) || 0)) })}
                disabled={isPending}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-1">≈ {form.annualLeaveWeeks * 5} jours / {form.annualLeaveWeeks * 5 * 8}h</p>
            </div>
          </div>

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
                  } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="edit-role"
                    value={option.value}
                    checked={form.role === option.value}
                    onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                    disabled={isPending}
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
                    } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="edit-techType"
                      value={option.value}
                      checked={form.interventionTypePreference === option.value}
                      onChange={(e) => setForm({ ...form, interventionTypePreference: e.target.value as 'depannage' | 'chantier' })}
                      disabled={isPending}
                      className="sr-only"
                    />
                    <span className="text-lg">{option.emoji}</span>
                    <span className="text-sm font-medium text-gray-900">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Calendar Color (only for technicians) */}
          {form.role === 'technician' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5" />
                  Couleur calendrier
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {TECHNICIAN_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm({ ...form, calendarColor: color })}
                    disabled={isPending}
                    className={`w-9 h-9 rounded-full border-2 transition-all disabled:opacity-50 ${
                      form.calendarColor === color
                        ? 'border-gray-900 scale-110 ring-2 ring-gray-300'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
                <div className="relative">
                  <input
                    type="color"
                    value={form.calendarColor || '#3B82F6'}
                    onChange={(e) => setForm({ ...form, calendarColor: e.target.value })}
                    disabled={isPending}
                    className="absolute inset-0 w-9 h-9 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    title="Couleur personnalisée"
                  />
                  <div
                    className={`w-9 h-9 rounded-full border-2 border-dashed flex items-center justify-center text-xs font-bold transition-all ${
                      form.calendarColor && !TECHNICIAN_COLORS.includes(form.calendarColor)
                        ? 'border-gray-900 scale-110 ring-2 ring-gray-300'
                        : 'border-gray-300 text-gray-400'
                    }`}
                    style={form.calendarColor && !TECHNICIAN_COLORS.includes(form.calendarColor) ? { backgroundColor: form.calendarColor } : undefined}
                  >
                    {!(form.calendarColor && !TECHNICIAN_COLORS.includes(form.calendarColor)) && '+'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
