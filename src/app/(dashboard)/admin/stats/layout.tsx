import { requireAdmin } from '@/lib/auth-guard';

export default async function StatsLayout({ children }: { children: React.ReactNode }) {
  try {
    const access = await requireAdmin();
    if (!access.authorized) {
      return <p role="alert" className="p-4 text-red-700">{access.error}</p>;
    }
    return <>{children}</>;
  } catch {
    return <p role="alert" className="p-4 text-red-700">Impossible de vérifier vos droits. Rechargez la page pour réessayer.</p>;
  }
}
