import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get user role to redirect appropriately
  const { data: profileData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { role: string } | null;

  if (profile?.role === 'technician') {
    redirect('/technician/today');
  }

  redirect('/calendar');
}
