import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import type { User } from '@/types/database';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch user profile with role
  const { data: profileData, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profileData) {
    redirect('/login');
  }

  const profile = profileData as User;

  // For technicians, render without admin chrome (sidebar, header)
  // The technician layout will handle its own navigation
  if (profile.role === 'technician') {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - Visible on tablet/laptop and up (md = 768px) */}
      <Sidebar user={profile} className="hidden md:flex" />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header user={profile} />

        {/* Page Content - Scrollable */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-6 md:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile Navigation - Only on small screens (hidden from md up) */}
      <MobileNav role={profile.role} className="md:hidden" />
    </div>
  );
}
