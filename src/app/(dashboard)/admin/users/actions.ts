'use server';

import { createClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { UserRole } from '@/types/database';

const VALID_ROLES: UserRole[] = ['admin', 'secretary', 'technician'];

interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
}

export async function createUser(payload: CreateUserPayload) {
  const { firstName, lastName, email, password, role } = payload;

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
        role,
        is_active: true,
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
