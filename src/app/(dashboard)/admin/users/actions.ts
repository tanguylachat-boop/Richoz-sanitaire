'use server';

import { createClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { UserRole } from '@/types/database';
import { requireAdminOrSecretary, requireAdmin } from '@/lib/auth-guard';

const VALID_ROLES: UserRole[] = ['admin', 'secretary', 'technician'];

interface UpdateUserPayload {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  role: UserRole;
  interventionTypePreference?: 'depannage' | 'chantier';
  calendarColor?: string | null;
  annualLeaveWeeks?: number;
}

export async function updateUser(payload: UpdateUserPayload) {
  const auth = await requireAdminOrSecretary();
  if (!auth.authorized) return { success: false, error: auth.error };

  const { id, firstName, lastName, email, phone, birthDate, role, interventionTypePreference, calendarColor, annualLeaveWeeks } = payload;

  if (!firstName?.trim() || !lastName?.trim()) {
    return { success: false, error: 'Le nom et le prénom sont requis.' };
  }
  if (!email?.trim() || !email.includes('@')) {
    return { success: false, error: 'Adresse email invalide.' };
  }
  if (!VALID_ROLES.includes(role)) {
    return { success: false, error: 'Rôle invalide.' };
  }

  try {
    const supabase = createClient();

    // Update public.users table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileError } = await (supabase as any)
      .from('users')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        birth_date: birthDate?.trim() || null,
        role,
        intervention_type_preference: role === 'technician' ? (interventionTypePreference || 'depannage') : null,
        calendar_color: role === 'technician' ? (calendarColor || null) : null,
        annual_leave_weeks: typeof annualLeaveWeeks === 'number' && annualLeaveWeeks >= 0 ? Math.round(annualLeaveWeeks) : 5,
      })
      .eq('id', id);

    if (profileError) {
      console.error('Profile update error:', profileError);
      return { success: false, error: 'Erreur lors de la mise à jour du profil.' };
    }

    // Sync auth user metadata
    const { error: authError } = await supabase.auth.admin.updateUserById(id, {
      email: email.trim().toLowerCase(),
      user_metadata: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
      },
    });

    // Auth update errors are non-blocking (profile was already updated)

    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    console.error('updateUser unexpected error:', err);
    return { success: false, error: 'Erreur serveur inattendue.' };
  }
}

interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  birthDate: string;
  role: UserRole;
  interventionTypePreference?: 'depannage' | 'chantier';
}

export async function createUser(payload: CreateUserPayload) {
  const auth = await requireAdminOrSecretary();
  if (!auth.authorized) return { success: false, error: auth.error };

  const { firstName, lastName, email, password, birthDate, role, interventionTypePreference } = payload;

  // Validation
  if (!firstName?.trim() || !lastName?.trim()) {
    return { success: false, error: 'Le nom et le prénom sont requis.' };
  }
  if (!email?.trim() || !email.includes('@')) {
    return { success: false, error: 'Adresse email invalide.' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: 'Le mot de passe doit contenir au moins 6 caractères.' };
  }
  if (!VALID_ROLES.includes(role)) {
    return { success: false, error: 'Rôle invalide.' };
  }

  try {
    const supabase = createClient();

    // 1) Create auth user via admin API (requires service_role key)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
      },
    });

    if (authError) {
      // Handle duplicate email
      if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
        return { success: false, error: 'Un utilisateur avec cet email existe déjà.' };
      }
      console.error('Auth createUser error:', authError);
      return { success: false, error: authError.message || 'Erreur lors de la création du compte.' };
    }

    if (!authData.user) {
      return { success: false, error: 'Erreur inattendue : utilisateur non créé.' };
    }

    // 2) Insert into public.users table
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: email.trim().toLowerCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: birthDate?.trim() || null,
        role,
        is_active: true,
        intervention_type_preference: role === 'technician' ? (interventionTypePreference || 'depannage') : null,
      });

    if (profileError) {
      console.error('Profile insert error:', profileError);
      // Attempt cleanup: delete the auth user since profile creation failed
      await supabase.auth.admin.deleteUser(authData.user.id);
      return { success: false, error: 'Erreur lors de la création du profil. Le compte auth a été annulé.' };
    }

    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    console.error('createUser unexpected error:', err);
    return { success: false, error: 'Erreur serveur inattendue.' };
  }
}

interface DeleteUserResult {
  success: boolean;
  error?: string;
  /** true when the user could not be hard-deleted (linked history) and was deactivated instead. */
  deactivated?: boolean;
}

/**
 * Delete a collaborator (e.g. a fired employee).
 *
 * Admin-only and destructive. A full hard-delete (auth account + profile) is
 * attempted first. If the collaborator already has linked records (reports,
 * piquet reports, etc. protected by RESTRICT/NO ACTION foreign keys), the row
 * cannot be erased without losing business history — so we fall back to a soft
 * delete: the profile is deactivated and the auth account is banned, which
 * revokes access immediately while preserving the historical data.
 */
export async function deleteUser(payload: { id: string }): Promise<DeleteUserResult> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { success: false, error: auth.error };

  const { id } = payload;
  if (!id) return { success: false, error: 'Utilisateur introuvable.' };
  if (id === auth.userId) {
    return { success: false, error: 'Vous ne pouvez pas supprimer votre propre compte.' };
  }

  try {
    const supabase = createClient();

    // 1) Try to hard-delete the profile row first. Foreign keys with
    // RESTRICT / NO ACTION (reports, piquet_reports, quotes, ...) will block
    // this for any collaborator who already has history.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileError } = await (supabase as any)
      .from('users')
      .delete()
      .eq('id', id);

    if (profileError) {
      // 23503 = foreign_key_violation → collaborator has linked records.
      if (profileError.code === '23503') {
        // Soft delete: deactivate the profile and ban the auth account so the
        // fired collaborator loses access while history stays intact.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deactivateError } = await (supabase as any)
          .from('users')
          .update({ is_active: false })
          .eq('id', id);

        if (deactivateError) {
          console.error('Deactivate user error:', deactivateError);
          return { success: false, error: 'Impossible de désactiver le collaborateur.' };
        }

        // Ban the auth account (~100 years) to revoke login. Non-blocking.
        await supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' });

        revalidatePath('/admin/users');
        return { success: true, deactivated: true };
      }

      console.error('Delete user profile error:', profileError);
      return { success: false, error: 'Erreur lors de la suppression du collaborateur.' };
    }

    // 2) Profile removed → delete the auth account. Non-blocking: the profile
    // is already gone, an orphaned auth account would just be unusable.
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
    if (authDeleteError) {
      console.error('Delete auth user error (profile already removed):', authDeleteError);
    }

    revalidatePath('/admin/users');
    return { success: true, deactivated: false };
  } catch (err) {
    console.error('deleteUser unexpected error:', err);
    return { success: false, error: 'Erreur serveur inattendue.' };
  }
}
