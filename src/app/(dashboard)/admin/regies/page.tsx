import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Regie } from '@/types/database';
import { RegiesPageClient } from '@/components/admin/RegiesPageClient';

export default async function RegiesPage() {
  const supabase = createClient();

  // Get current user to verify admin access
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || (profile as { role: string }).role !== 'admin') {
    redirect('/');
  }

  // Fetch all regies
  const { data: regiesData } = await supabase
    .from('regies')
    .select('*')
    .order('name');

  const regies = regiesData as Regie[] | null;

  return <RegiesPageClient regies={regies} />;
}
