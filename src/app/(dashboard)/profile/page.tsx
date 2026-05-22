'use client';

import { useState, useEffect } from 'react';
import { User as UserIcon, Mail, Shield, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ChangePasswordSection } from '@/components/profile/ChangePasswordSection';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  secretary: 'Secrétariat',
  technician: 'Technicien',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role')
        .eq('id', user.id)
        .single();
      if (error) {
        toast.error('Erreur lors du chargement du profil');
      } else {
        setProfile(data as UserProfile);
      }
      setIsLoading(false);
    };
    load();
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center text-gray-500 py-12">Profil introuvable.</div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl font-bold text-blue-600">
            {profile.first_name.charAt(0)}
            {profile.last_name.charAt(0)}
          </span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {profile.first_name} {profile.last_name}
        </h1>
        <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          {ROLE_LABELS[profile.role] || profile.role}
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-blue-600" />
            Mes informations
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="px-5 py-4 flex items-center gap-3">
            <Mail className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
              <p className="text-gray-900 font-medium">{profile.email}</p>
            </div>
          </div>
          <div className="px-5 py-4 flex items-center gap-3">
            <Shield className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Rôle</p>
              <p className="text-gray-900 font-medium">
                {ROLE_LABELS[profile.role] || profile.role}
              </p>
            </div>
          </div>
        </div>
      </div>

      <ChangePasswordSection />
    </div>
  );
}
