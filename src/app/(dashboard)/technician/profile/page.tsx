'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Phone, Shield, Loader2, Save, CheckCircle, Bell, BellOff, BellRing } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { registerPushSubscription, unregisterPushSubscription } from '@/lib/push-notifications';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string;
  avatar_url: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  secretary: 'Secrétariat',
  technician: 'Technicien',
};

export default function TechnicianProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [pushStatus, setPushStatus] = useState<'loading' | 'active' | 'inactive' | 'denied'>('loading');
  const [pushLoading, setPushLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, phone, role, avatar_url')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Erreur fetch profil:', error);
        toast.error('Erreur lors du chargement du profil');
        return;
      }

      const p = data as UserProfile;
      setProfile(p);
      setPhone(p.phone || '');
      setIsLoading(false);

      // Check push notification status
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setPushStatus('inactive');
      } else if (Notification.permission === 'denied') {
        setPushStatus('denied');
      } else {
        // Check if subscription exists in DB
        const { count } = await supabase
          .from('push_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        setPushStatus(count && count > 0 ? 'active' : 'inactive');
      }
    };
    fetchProfile();
  }, [supabase]);

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('users')
        .update({ phone: phone.trim() || null })
        .eq('id', profile.id);

      if (error) throw error;
      setProfile({ ...profile, phone: phone.trim() || null });
      toast.success('Profil mis à jour !');
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Profil introuvable</p>
      </div>
    );
  }

  const hasChanges = phone !== (profile.phone || '');

  const handleEnablePush = async () => {
    setPushLoading(true);
    try {
      const success = await registerPushSubscription();
      if (success) {
        setPushStatus('active');
        toast.success('Notifications push activées');
      } else if (Notification.permission === 'denied') {
        setPushStatus('denied');
        toast.error('Notifications bloquées par le navigateur');
      } else {
        toast.error('Impossible d\'activer les notifications');
      }
    } catch {
      toast.error('Erreur lors de l\'activation');
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePush = async () => {
    setPushLoading(true);
    try {
      await unregisterPushSubscription();
      setPushStatus('inactive');
      toast.success('Notifications push désactivées');
    } catch {
      toast.error('Erreur lors de la désactivation');
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl font-bold text-blue-600">
            {profile.first_name.charAt(0)}{profile.last_name.charAt(0)}
          </span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {profile.first_name} {profile.last_name}
        </h1>
        <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          {ROLE_LABELS[profile.role] || profile.role}
        </span>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            Mes informations
          </h2>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Prenom */}
          <div className="px-5 py-4">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5" />
              Prénom
            </label>
            <p className="text-gray-900 font-medium">{profile.first_name}</p>
          </div>

          {/* Nom */}
          <div className="px-5 py-4">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1 block">
              Nom
            </label>
            <p className="text-gray-900 font-medium">{profile.last_name}</p>
          </div>

          {/* Email - lecture seule */}
          <div className="px-5 py-4">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
              <Mail className="w-3.5 h-3.5" />
              Email
            </label>
            <p className="text-gray-900 font-medium">{profile.email}</p>
          </div>

          {/* Role - lecture seule */}
          <div className="px-5 py-4">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
              <Shield className="w-3.5 h-3.5" />
              Rôle
            </label>
            <p className="text-gray-900 font-medium">{ROLE_LABELS[profile.role] || profile.role}</p>
          </div>

          {/* Telephone - editable */}
          <div className="px-5 py-4">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Phone className="w-3.5 h-3.5" />
              Téléphone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+41 79 123 45 67"
              className="w-full h-11 px-4 text-sm bg-blue-50/50 border-2 border-blue-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Notifications card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            Notifications push
          </h2>
        </div>
        <div className="px-5 py-4">
          {pushStatus === 'loading' ? (
            <div className="flex items-center gap-3 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Vérification...</span>
            </div>
          ) : pushStatus === 'denied' ? (
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
              <BellOff className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Notifications bloquées</p>
                <p className="text-xs text-red-600 mt-0.5">
                  Activez-les dans les réglages de votre téléphone (Safari → Réglages du site)
                </p>
              </div>
            </div>
          ) : pushStatus === 'active' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
                <BellRing className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm font-medium text-green-800 flex-1">Notifications activées</p>
                <div className="w-10 h-6 bg-green-500 rounded-full relative">
                  <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow" />
                </div>
              </div>
              <button
                onClick={handleDisablePush}
                disabled={pushLoading}
                className="w-full py-2.5 px-4 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {pushLoading ? 'Désactivation...' : 'Désactiver les notifications'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <BellOff className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <p className="text-sm text-gray-600 flex-1">Notifications désactivées</p>
                <div className="w-10 h-6 bg-gray-300 rounded-full relative">
                  <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow" />
                </div>
              </div>
              <button
                onClick={handleEnablePush}
                disabled={pushLoading}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {pushLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Activation...</>
                ) : (
                  <><Bell className="w-4 h-4" />Activer les notifications</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isSaving || !hasChanges}
        className="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg shadow-blue-600/30"
      >
        {isSaving ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Enregistrement...
          </>
        ) : hasChanges ? (
          <>
            <Save className="w-5 h-5" />
            Enregistrer
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            Aucune modification
          </>
        )}
      </button>
    </div>
  );
}
