'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RefreshCcw } from 'lucide-react';

export function SyncBexioButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/cron/sync-bexio-invoices', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      toast.success(
        `Bexio synchronisé : ${json.upserted} facture(s) mises à jour${
          json.skipped > 0 ? `, ${json.skipped} erreur(s)` : ''
        }`
      );
      router.refresh();
    } catch (e) {
      console.error('Sync error', e);
      toast.error(`Erreur sync Bexio : ${(e as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors disabled:opacity-50"
    >
      {isSyncing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <RefreshCcw className="w-4 h-4" />
      )}
      {isSyncing ? 'Synchronisation…' : 'Synchroniser'}
    </button>
  );
}
