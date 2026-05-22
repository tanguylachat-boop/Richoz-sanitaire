'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';

const MIN_LENGTH = 8;

export function ChangePasswordSection() {
  const supabase = createClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValid =
    current.length > 0 &&
    next.length >= MIN_LENGTH &&
    next === confirm &&
    next !== current;

  let hint = '';
  if (next && next.length < MIN_LENGTH) hint = `Minimum ${MIN_LENGTH} caractères.`;
  else if (next && next === current) hint = 'Le nouveau mot de passe doit être différent.';
  else if (confirm && confirm !== next) hint = 'Les deux mots de passe ne correspondent pas.';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      // Verify current password by re-authenticating (signInWithPassword reuses session safely)
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) {
        toast.error('Session expirée — reconnecte-toi');
        return;
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (reauthError) {
        toast.error('Mot de passe actuel incorrect');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Mot de passe mis à jour');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-600" />
          Changer mon mot de passe
        </h2>
      </div>
      <form onSubmit={onSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Mot de passe actuel
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={show ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full h-11 pl-10 pr-10 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
              aria-label={show ? 'Masquer' : 'Afficher'}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={show ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              className="w-full h-11 pl-10 pr-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Confirmer le nouveau mot de passe
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              className="w-full h-11 pl-10 pr-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {hint && <p className="text-xs text-red-600">{hint}</p>}
        <p className="text-xs text-gray-500">
          Minimum {MIN_LENGTH} caractères. Choisis un mot de passe que tu retiens facilement.
        </p>

        <button
          type="submit"
          disabled={!isValid || submitting}
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Mise à jour…
            </>
          ) : (
            'Enregistrer le nouveau mot de passe'
          )}
        </button>
      </form>
    </div>
  );
}
