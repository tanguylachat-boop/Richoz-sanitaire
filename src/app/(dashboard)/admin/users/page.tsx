import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ROLES } from '@/lib/constants';
import type { User } from '@/types/database';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import {
  Users,
  Search,
  MoreVertical,
  UserCheck,
  Mail,
  Phone,
  Shield,
} from 'lucide-react';

export default async function UsersPage() {
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

  // Fetch all users
  const { data: usersData } = await supabase
    .from('users')
    .select('*')
    .order('role')
    .order('first_name');

  const users = usersData as User[] | null;

  // Group users by role
  const usersByRole = users?.reduce((acc, user) => {
    const role = user.role;
    if (!acc[role]) acc[role] = [];
    acc[role].push(user);
    return acc;
  }, {} as Record<string, User[]>) || {};

  // Calculate stats
  const stats = {
    total: users?.length || 0,
    active: users?.filter(u => u.is_active).length || 0,
    admins: users?.filter(u => u.role === 'admin').length || 0,
    technicians: users?.filter(u => u.role === 'technician').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Utilisateurs</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-sm text-gray-500">Actifs</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
              <Shield className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.admins}</p>
              <p className="text-sm text-gray-500">Administrateurs</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.technicians}</p>
              <p className="text-sm text-gray-500">Techniciens</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-gray-500">
            Gestion des comptes et permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              className="w-full sm:w-64 h-10 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <CreateUserDialog />
        </div>
      </div>

      {/* Users by Role */}
      {['admin', 'secretary', 'technician'].map((role) => {
        const roleUsers = usersByRole[role] || [];
        const roleInfo = ROLES[role as keyof typeof ROLES];

        if (roleUsers.length === 0) return null;

        return (
          <div key={role} className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', roleInfo.color)}>
                  {roleInfo.label}
                </span>
                <span className="text-sm text-gray-500">
                  {roleUsers.length} utilisateur{roleUsers.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {roleUsers.map((userItem) => (
                <div key={userItem.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                      userItem.is_active ? 'bg-blue-100' : 'bg-gray-100'
                    )}>
                      <span className={cn(
                        'text-sm font-semibold',
                        userItem.is_active ? 'text-blue-600' : 'text-gray-400'
                      )}>
                        {userItem.first_name.charAt(0)}{userItem.last_name.charAt(0)}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className={cn(
                          'font-medium',
                          userItem.is_active ? 'text-gray-900' : 'text-gray-400'
                        )}>
                          {userItem.first_name} {userItem.last_name}
                        </h4>
                        {!userItem.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Inactif
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{userItem.email}</span>
                        </div>
                        {userItem.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{userItem.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
