'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { createUser } from '@/app/(dashboard)/admin/users/actions';
import type { UserRole } from '@/types/database';
import { Plus, Loader2, User, Mail, Lock, Shield } from 'lucide-react';

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: 'technician', label: 'Technicien', description: 'Accès mobile, rapports terrain' },
  { value: 'secretary', label: 'Secrétariat', description: 'Gestion des interventions et factures' },
  { value: 'admin', label: 'Administrateur', description: 'Accès complet à toutes les fonctionnalités' },
];

export function CreateUserDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'technician' as UserRole,
  });

  const [fieldError, setFieldError] = useState('');

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', email: '', password: '', role: 'technician' });
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

    // Client-side validation
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFieldError('Le prénom et le nom sont requis.');
      return;
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      setFieldError('Adresse email invalide.');
      return;
    }
    if (form.password.length < 6) {
      setFieldError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    startTransition(async () => {
      const result = await createUser(form);

      if (result.success) {
        toast.success('Utilisateur créé avec succès !');
        setIsOpen(false);
        resetForm();
        router.refresh();
      } else {
        setFieldError(result.error || 'Erreur inconnue.');
        toast.error(result.error || 'Erreur lors de la création.');
      }
    });
  };

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
              disabled={isPending}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Mot de passe provisoire
              </span>
            </label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min. 6 caractères"
              required
              minLength={6}
              disabled={isPending}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            />
            <p className="text-xs text-gray-400 mt-1">
              L&apos;utilisateur pourra changer son mot de passe à la première connexion.
            </p>
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
                  } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
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

          {/* Submit */}
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
