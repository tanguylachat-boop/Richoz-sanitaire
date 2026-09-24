'use client';

// LOT 7 — partage de position explicite côté technicien (MVP web).
// Le partage ne fonctionne que PAGE OUVERTE : une application web ne suit pas
// la position écran verrouillé ou application fermée, et cette limite est
// affichée. Aucune position n'est conservée après l'arrêt du partage.
// Activé par décision client (salariés informés, acté le 23.09.2026). Le partage
// reste EXPLICITE (le technicien l'active), avant-plan uniquement, sans rétention.
// Kill-switch : poser NEXT_PUBLIC_LOCATION_SHARING_ENABLED='false' pour désactiver.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { MapPin, Play, Square, AlertTriangle, ShieldCheck } from 'lucide-react';

// Activé en dur (décision client actée) : indépendant de toute variable Vercel.
const FEATURE_ENABLED = true;
const PUSH_INTERVAL_MS = 20000;

type ShareState = 'off' | 'starting' | 'on' | 'denied' | 'error';

export default function TechnicianLocationPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<ShareState>('off');
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPushRef = useRef(0);
  const stateRef = useRef<ShareState>('off');
  stateRef.current = state;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
  }, [supabase]);

  // Reprendre l'état affiché depuis la base (persistance après reconnexion)
  useEffect(() => {
    if (!userId) return;
    supabase.from('technician_locations').select('is_sharing, recorded_at')
      .eq('technician_id', userId).maybeSingle()
      .then(({ data }) => {
        // La base peut dire « partage actif » après un rechargement, mais le
        // suivi navigateur est perdu : on repart proprement à l'arrêt.
        if (data?.is_sharing) {
          supabase.from('technician_locations').update({
            is_sharing: false, latitude: null, longitude: null, accuracy_m: null, recorded_at: null,
          }).eq('technician_id', userId).then(() => {});
        }
      });
  }, [supabase, userId]);

  const stopSharing = useCallback(async (silent = false) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState('off');
    setLastSentAt(null);
    if (userId) {
      const { error } = await supabase.from('technician_locations').upsert({
        technician_id: userId, is_sharing: false, latitude: null, longitude: null, accuracy_m: null, recorded_at: null,
      });
      if (error && !silent) toast.error('Arrêt non confirmé côté serveur, réessayez');
      else if (!silent) toast.success('Partage arrêté — position effacée');
    }
  }, [supabase, userId]);

  // Arrêt propre à la fermeture de la page
  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  const startSharing = async () => {
    if (!userId || !('geolocation' in navigator)) {
      toast.error('Géolocalisation indisponible sur cet appareil');
      return;
    }
    setState('starting');
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (stateRef.current !== 'on') setState('on');
        if (now - lastPushRef.current < PUSH_INTERVAL_MS) return;
        lastPushRef.current = now;
        const { error } = await supabase.from('technician_locations').upsert({
          technician_id: userId,
          is_sharing: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy ?? null,
          recorded_at: new Date(position.timestamp).toISOString(),
        });
        if (error) {
          setState('error');
          toast.error('Envoi de la position impossible');
        } else {
          setLastSentAt(new Date().toLocaleTimeString('fr-CH'));
        }
      },
      (error) => {
        setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
        stopSharing(true);
        toast.error(error.code === error.PERMISSION_DENIED
          ? 'Permission de localisation refusée — partage arrêté'
          : 'Position indisponible — partage arrêté');
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );
  };

  if (!FEATURE_ENABLED) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-gray-400 mx-auto" />
          <h1 className="text-lg font-bold text-gray-900">Partage de position — non activé</h1>
          <p className="text-sm text-gray-500">
            Le dispositif est prêt mais désactivé. Son activation nécessite l&apos;information
            préalable des salariés sur la finalité et l&apos;usage (protection des données).
          </p>
        </div>
      </div>
    );
  }

  const isSharing = state === 'on' || state === 'starting';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <MapPin className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ma position</h1>
          <p className="text-sm text-gray-500">Partage volontaire pour l&apos;organisation des dépannages</p>
        </div>
      </div>

      <div className={`rounded-xl border p-6 text-center space-y-4 ${isSharing ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-gray-200'}`}>
        <p className="text-sm font-medium text-gray-900">
          {state === 'on' && '🟢 Partage actif — position visible par le bureau'}
          {state === 'starting' && 'Démarrage du partage…'}
          {state === 'off' && '⚪ Partage arrêté — aucune position transmise'}
          {state === 'denied' && '🔒 Permission refusée dans le navigateur'}
          {state === 'error' && '⚠️ Erreur de localisation'}
        </p>
        {state === 'on' && lastSentAt && (
          <p className="text-xs text-gray-500">Dernier envoi : {lastSentAt} (toutes les {PUSH_INTERVAL_MS / 1000} s)</p>
        )}
        {isSharing ? (
          <button
            onClick={() => stopSharing()}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
          >
            <Square className="w-4 h-4" /> Arrêter le partage
          </button>
        ) : (
          <button
            onClick={startSharing}
            disabled={!userId}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Partager ma position
          </button>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
        <p className="flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Le partage ne fonctionne que lorsque cette page est ouverte : écran verrouillé ou
          application fermée, la position ne se met plus à jour (limite d&apos;une application web).</p>
        <p>Seule la dernière position est conservée, uniquement pendant le partage. À l&apos;arrêt,
          elle est effacée. Aucun historique de trajets n&apos;est enregistré.</p>
      </div>
    </div>
  );
}
