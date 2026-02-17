'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import type { UserRole } from '@/types/database';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallbackPath?: string;
}

/**
 * Client-side role guard component
 * Redirects users to fallback path if they don't have the required role
 */
export function RoleGuard({
  children,
  allowedRoles,
  fallbackPath = '/technician/today',
}: RoleGuardProps) {
  const { user, role, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && role && !allowedRoles.includes(role)) {
      router.replace(fallbackPath);
    }
  }, [user, role, isLoading, allowedRoles, fallbackPath, router]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  // Not authorized - show nothing while redirecting
  if (!user || !role || !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Higher-order component version for use with page components
 */
export function withRoleGuard<P extends object>(
  Component: React.ComponentType<P>,
  allowedRoles: UserRole[],
  fallbackPath?: string
) {
  return function GuardedComponent(props: P) {
    return (
      <RoleGuard allowedRoles={allowedRoles} fallbackPath={fallbackPath}>
        <Component {...props} />
      </RoleGuard>
    );
  };
}
