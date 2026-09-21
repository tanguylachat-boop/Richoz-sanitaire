'use client';

// LOT 7 — vue responsable : dernières positions des techniciens qui partagent.
// Une position de plus de 5 minutes est marquée « périmée » et n'est JAMAIS
// présentée comme du direct. Cartographie : lien Google Maps (pattern existant
// de l'app) ouvert par l'utilisateur — aucun envoi automatique à un tiers.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MapPin, Loader2, RefreshCw, ExternalLink } from 'lucide-react';

const STALE_AFTER_MS = 5 * 60 * 1000;

interface LocationRow {
  technician_id: string;
  is_sharing: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  recorded_at: string | null;
  updated_at: string;
  technician?: { first_name: string | null; last_name: string | null; email: string } | null;
}

function techName(t: LocationRow['technician']): string {
  if (!t) return 'Inconnu';
  return t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.first_name || t.last_name || t.email;
}

export default function AdminLocationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from('technician_locations')
      .select('*, technician:users!technician_locations_technician_id_fkey(first_name, last_name, email)')
      .order('updated_at', { ascending: false });
    if (error) {
      setLoadError('Lecture des positions impossible. Vérifiez vos droits puis réessayez.');
    } else {
      setLoadError(null);
      setRows((data || []) as unknown as LocationRow[]);
      setRefreshedAt(new Date().toLocaleTimeString('fr-CH'));
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchRows();
    const interval = setInterval(fetchRows, 30000);
    return () => clearInterval(interval);
  }, [fetchRows]);

  const sharing = rows.filter((r) => r.is_sharing && r.latitude != null && r.longitude != null);
  const inactive = rows.filter((r) => !r.is_sharing);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-600" />
            Localisation des dépanneurs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Partage volontaire, dernière position uniquement, aucun historique de trajets.
            {refreshedAt ? ` Actualisé à ${refreshedAt}.` : ''}
          </p>
        </div>
        <button
          onClick={() => { setIsLoading(true); fetchRows(); }}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{loadError}</p>
          <button onClick={fetchRows} className="mt-2 underline">Réessayer</button>
        </div>
      ) : sharing.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Aucun technicien ne partage sa position actuellement.</p>
          <p className="text-xs text-gray-400 mt-1">Le partage se lance depuis « Ma position » côté technicien, page ouverte.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sharing.map((row) => {
            const age = row.recorded_at ? Date.now() - Date.parse(row.recorded_at) : Infinity;
            const isStale = age > STALE_AFTER_MS;
            const ageLabel = row.recorded_at
              ? age < 60000 ? `il y a ${Math.max(1, Math.round(age / 1000))} s` : `il y a ${Math.round(age / 60000)} min`
              : 'horodatage inconnu';
            return (
              <div key={row.technician_id} className={`bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap ${isStale ? 'border-amber-300' : 'border-emerald-200'}`}>
                <div>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    {techName(row.technician)}
                    {isStale ? (
                      <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Position périmée ({ageLabel})</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">Partage actif · {ageLabel}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {row.accuracy_m != null ? `Précision ± ${Math.round(row.accuracy_m)} m · ` : ''}
                    {row.recorded_at ? new Date(row.recorded_at).toLocaleTimeString('fr-CH') : ''}
                  </p>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
                >
                  <ExternalLink className="w-4 h-4" /> Voir sur la carte
                </a>
              </div>
            );
          })}
        </div>
      )}

      {inactive.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Partage arrêté (position effacée)</p>
          <p className="text-sm text-gray-600">{inactive.map((r) => techName(r.technician)).join(' · ')}</p>
        </div>
      )}
    </div>
  );
}
