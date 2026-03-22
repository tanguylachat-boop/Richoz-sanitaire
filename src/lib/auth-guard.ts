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
