import { createClient } from '@/lib/supabase/server';

/**
 * Verify the current user has an admin or secretary role.
 * Use in server actions to prevent privilege escalation.
 * Returns the user ID if authorized, or an error result.
 */
export async function requireAdminOrSecretary(): Promise<
  { authorized: true; userId: string } | { authorized: false; error: string }
> {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { authorized: false, error: 'Non authentifié.' };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'secretary'].includes((profile as { role: string }).role)) {
    return { authorized: false, error: 'Accès non autorisé.' };
  }

  return { authorized: true, userId: user.id };
}

/**
 * Verify the current user has the admin role.
 * Use in server actions for destructive operations (e.g. deleting users).
 * Returns the user ID if authorized, or an error result.
 */
export async function requireAdmin(): Promise<
  { authorized: true; userId: string } | { authorized: false; error: string }
> {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { authorized: false, error: 'Non authentifié.' };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single<{ role: string; is_active: boolean }>();

  if (!profile?.is_active || profile.role !== 'admin') {
    return { authorized: false, error: 'Accès réservé aux administrateurs.' };
  }

  return { authorized: true, userId: user.id };
}
