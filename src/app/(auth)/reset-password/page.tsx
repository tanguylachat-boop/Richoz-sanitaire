'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Loader2, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';

const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Supabase places a recovery session into the URL hash after the email link is clicked.
  // The supabase-js client picks it up automatically; we just verify a session exists.
  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data.session);
    };
    check();
  }, [supabase]);

  const isValid = next.length >= MIN_LENGTH && next === confirm;
  let hint = '';
  if (next && next.length < MIN_LENGTH) hint = `Minimum ${MIN_LENGTH} caractères.`;
  else if (confirm && confirm !== next) hint = 'Les deux mots de passe ne correspondent pas.';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: next });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/'), 1500);
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Mot de passe mis à jour</h2>
        <p className="text-gray-600 mb-6">Tu vas être redirigé dans un instant…</p>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Lien invalide ou expiré</h2>
        <p className="text-gray-600 mb-6">
          Le lien de réinitialisation n&apos;est plus valide. Redemande un nouveau lien.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          Recevoir un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Nouveau mot de passe</h2>
      <p className="text-gray-600 mb-6">Choisis un nouveau mot de passe sécurisé.</p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={show ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              required
              className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              required
              className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {hint && <p className="text-xs text-red-600">{hint}</p>}
        <button
          type="submit"
          disabled={!isValid || submitting}
          className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Enregistrement…
            </>
          ) : (
            'Définir le nouveau mot de passe'
          )}
        </button>
      </form>
    </div>
  );
}
