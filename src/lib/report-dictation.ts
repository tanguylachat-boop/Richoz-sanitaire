export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
}
export type RecognitionConstructor = new () => Recognition;
export type DictationState = { phase: 'idle' | 'starting' | 'listening' | 'stopping' | 'review'; text: string; interim: string; message: string };
export const emptyDictation: DictationState = { phase: 'idle', text: '', interim: '', message: '' };

export function recognitionConstructor(scope: unknown): RecognitionConstructor | undefined {
  const w = scope as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function appendDictation(current: string, passage: string) {
  return passage.trim() ? current + (current ? '\n\n' : '') + passage.trim() : current;
}

// Each instance belongs to one mounted report. Final result indices, not words,
// identify deliveries: spoken repetitions must remain intact.
export class DictationSession {
  state: DictationState = { ...emptyDictation };
  private recognition?: Recognition;
  private seen = new Set<number>();
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private publish: (state: DictationState) => void) {}
  private update(change: Partial<DictationState>) {
    this.state = { ...this.state, ...change };
    this.publish(this.state);
  }
  private detach() {
    clearTimeout(this.timer);
    const r = this.recognition;
    this.recognition = undefined;
    if (r) {
      r.onresult = r.onerror = r.onend = r.onstart = null;
      try { r.abort(); } catch { /* Already stopped. */ }
    }
  }
  dispose() { this.detach(); }
  cancel() { this.detach(); this.update({ ...emptyDictation }); }
  edit(text: string) { this.update({ text }); }
  take() {
    if (this.state.phase !== 'review' || !this.state.text.trim()) return '';
    const text = this.state.text.trim();
    this.cancel(); // Synchronous consumption also protects rapid double clicks.
    return text;
  }
  start(Constructor?: RecognitionConstructor) {
    if (this.state.phase !== 'idle') return;
    if (!Constructor) { this.update({ message: 'Dictée indisponible dans ce navigateur. La saisie manuelle reste disponible.' }); return; }
    this.seen.clear();
    this.update({ ...emptyDictation, phase: 'starting' });
    try {
      const r = new Constructor();
      this.recognition = r;
      r.lang = 'fr-CH';
      r.continuous = true;
      r.interimResults = true;
      const current = () => this.recognition === r;
      r.onstart = () => { if (current() && this.state.phase === 'starting') this.update({ phase: 'listening' }); };
      r.onresult = event => {
        if (!current()) return;
        let added = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal && !this.seen.has(i)) {
            this.seen.add(i);
            added += (added ? ' ' : '') + result[0].transcript.trim();
          }
        }
        const interim = Array.from(event.results).filter(r => !r.isFinal).map(r => r[0].transcript).join(' ');
        this.update({ text: this.state.text + (added && this.state.text ? ' ' : '') + added, interim });
      };
      r.onerror = event => {
        if (!current()) return;
        const messages: Record<string, string> = {
          'not-allowed': 'Accès au microphone refusé. Vérifiez les autorisations du navigateur ou saisissez le texte.',
          'service-not-allowed': 'Service de reconnaissance non autorisé. Utilisez la saisie manuelle.',
          'audio-capture': 'Microphone indisponible. Vérifiez son branchement et les autorisations.',
          'no-speech': 'Aucune parole reconnue. Vous pouvez réessayer ou saisir le texte.',
          network: 'Erreur réseau du service de reconnaissance. Le texte déjà reconnu reste à relire.',
          'language-not-supported': 'Le service ne prend pas en charge le français demandé (fr-CH). Utilisez la saisie manuelle.',
        };
        this.finish(messages[event.error] || 'La reconnaissance a été interrompue. Relisez le texte disponible.');
      };
      r.onend = () => {
        if (current()) this.finish(this.state.phase === 'stopping' ? '' : 'Le service a arrêté la dictée. Relisez le texte disponible.');
      };
      r.start();
    } catch { this.finish('Impossible de démarrer le microphone ou la reconnaissance. Utilisez la saisie manuelle.'); }
  }
  private finish(message: string) {
    this.detach();
    this.update({ phase: 'review', interim: '', message: message || (this.state.text.trim() ? '' : 'Aucune parole reconnue. Vous pouvez réessayer ou saisir le texte.') });
  }
  stop() {
    if (!this.recognition || !['starting', 'listening'].includes(this.state.phase)) return;
    this.update({ phase: 'stopping' });
    // Keep callbacks until end so the service can deliver its last final results.
    this.timer = setTimeout(() => this.finish('Le service ne répond plus. Seul le texte confirmé est disponible ; relisez-le.'), 5000);
    try { this.recognition.stop(); } catch { this.finish('Arrêt du service interrompu. Relisez le texte disponible.'); }
  }
}
