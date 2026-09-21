'use client';

import { useEffect, useRef, useState } from 'react';
import { DictationSession, emptyDictation, recognitionConstructor } from '@/lib/report-dictation';

interface VoiceRecorderProps {
  onRecordingComplete: (transcription: string) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onRecordingComplete, disabled = false }: VoiceRecorderProps) {
  const [state, setState] = useState(emptyDictation);
  const [supported, setSupported] = useState<boolean | null>(null);
  const session = useRef<DictationSession | null>(null);
  useEffect(() => {
    const controller = new DictationSession(setState);
    session.current = controller;
    setSupported(Boolean(recognitionConstructor(window)));
    const hide = () => { if (document.hidden) controller.stop(); };
    const leave = () => controller.cancel();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      controller.dispose();
      session.current = null;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  useEffect(() => { if (disabled) session.current?.stop(); }, [disabled]);
  const active = ['starting', 'listening', 'stopping'].includes(state.phase);
  const button = 'min-h-[44px] rounded-lg border px-4 py-2 font-medium disabled:opacity-50';
  return (
    <section aria-label="Dictée du rapport" className="mt-3 space-y-3 rounded-lg border border-gray-200 p-3">
      <p className="text-sm text-gray-600">
        La dictée utilise le microphone après votre clic. Le navigateur peut transmettre l’audio à son service externe de reconnaissance, selon ses propres conditions de traitement et de conservation. Notre application ne stocke pas l’audio.
        Français demandé : fr-CH, selon la disponibilité du service.
      </p>
      {supported === false && <p role="status" className="text-sm text-amber-800">Dictée indisponible dans ce navigateur. Saisissez votre texte ; la dictée du clavier de votre appareil peut aussi être une solution, si disponible (non vérifiée ici).</p>}
      {state.phase === 'idle' && <button type="button" className={button} disabled={disabled || supported !== true} onClick={() => session.current?.start(recognitionConstructor(window))}>Dicter</button>}
      <p role="status" className={active ? 'font-medium text-red-700' : 'text-sm text-gray-600'}>
        {state.phase === 'starting' ? 'Activation du microphone…' : state.phase === 'listening' ? 'Dictée active — microphone en écoute' : state.phase === 'stopping' ? 'Arrêt en cours — attente des derniers résultats…' : state.phase === 'review' ? 'Dictée arrêtée — relisez et corrigez avant ajout.' : ''}
      </p>
      {state.message && <p role="alert" className="text-sm text-amber-800">{state.message}</p>}
      {active && <button type="button" className={button} disabled={state.phase === 'stopping'} onClick={() => session.current?.stop()}>Arrêter</button>}
      {state.phase !== 'idle' && <>
        <label className="block text-sm font-medium">Transcription à relire
          <textarea aria-label="Transcription à relire" className="mt-1 min-h-[120px] w-full rounded-lg border border-gray-300 p-3 text-base" value={state.text} onChange={e => session.current?.edit(e.target.value)} />
        </label>
        {state.interim && <p className="text-sm italic text-gray-500">En cours (non confirmé) : {state.interim}</p>}
        <p className="text-sm text-gray-600">Vérifiez les mots, nombres et prestations. Seul le texte ci-dessus sera ajouté à la fin de la description. Pensez ensuite à enregistrer le rapport.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button + ' bg-blue-600 text-white'} disabled={disabled || state.phase !== 'review' || !state.text.trim()} onClick={() => { const text = session.current?.take(); if (text) onRecordingComplete(text); }}>Ajouter au rapport</button>
          <button type="button" className={button} onClick={() => session.current?.cancel()}>Annuler</button>
        </div>
      </>}
    </section>
  );
}
