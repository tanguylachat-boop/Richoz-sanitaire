'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, UserRole } from '@/types/database';
import type { User as AuthUser } from '@supabase/supabase-js';

interface UseUserReturn {
  user: User | null;
  authUser: AuthUser | null;
  role: UserRole | null;
  isLoading: boolean;
  error: Error | null;
  isAdmin: boolean;
  isAdminOrSecretary: boolean;
  isTechnician: boolean;
  refetch: () => Promise<void>;
}

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const supabase = createClient();

  const fetchUser = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get authenticated user
      const { data: { user: auth }, error: authError } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!auth) {
        setAuthUser(null);
        setUser(null);
        return;
      }

      setAuthUser(auth);

      // Get user profile from our users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', auth.id)
        .single();

      if (profileError) throw profileError;

      setUser(profile);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Erreur lors du chargement du profil'));
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await fetchUser();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setAuthUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const role = user?.role ?? null;

  return {
    user,
    authUser,
    role,
    isLoading,
    error,
    isAdmin: role === 'admin',
    isAdminOrSecretary: role === 'admin' || role === 'secretary',
    isTechnician: role === 'technician',
    refetch: fetchUser,
  };
}
