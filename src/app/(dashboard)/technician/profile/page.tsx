'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Phone, Shield, Loader2, Save, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

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
