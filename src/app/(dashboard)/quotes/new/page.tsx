'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Loader2,
  FileText,
  CheckCircle,
  Sparkles,
  Send,
  RotateCcw,
} from 'lucide-react';

const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || 'https://primary-production-66b7.up.railway.app';

type Status = 'idle' | 'generating' | 'done' | 'error';

interface QuoteResult {
  message: string;
  quote_id?: string;
}

const EXAMPLES = [
  "Devis pour Régie Naef, installation WC suspendu Geberit avec bâti-support, salle de bain 3ème étage",
  "Remplacement chauffe-eau 200L et pose groupe de sécurité pour M. Dupont, ch. des Acacias 5",
  "Réparation fuite tuyau cuivre + remplacement vanne d'arrêt, cuisine, Régie Comptoir Immobilier",
  "Pose lavabo double vasque avec robinetterie Grohe, salle de bain, Mme Martin",
];

export default function NewQuotePage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [input, setInput] = useState('');
  const [sentText, setSentText] = useState('');
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendQuote = async (text: string) => {
    if (!text.trim()) return;

    setSentText(text.trim());
    setStatus('generating');
    setError('');
    setResult(null);

    try {
      const response = await fetch(`${N8N_WEBHOOK_URL}/webhook/quote-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!response.ok) {
        throw new Error(`Erreur serveur: ${response.status}`);
      }

      const data = await response.json();

      setResult({
        message: data.message || data.output || 'Devis généré avec succès.',
        quote_id: data.quote_id,
      });
      setStatus('done');
    } catch (err) {
      console.error('[QUOTE ERROR]', err);
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de contacter l'agent. Vérifiez que le workflow est actif dans n8n."
      );
      setStatus('error');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuote(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuote(input);
    }
  };

  const reset = () => {
    setStatus('idle');
    setInput('');
    setSentText('');
    setResult(null);
    setError('');
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/quotes')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            Nouveau devis
          </h1>
        </div>
        {(status === 'done' || status === 'error') && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Nouveau
          </button>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl">

          {/* === IDLE === */}
          {status === 'idle' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-7 h-7 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Créer un devis
                </h2>
                <p className="text-gray-500">
                  Décrivez les travaux, le client et le matériel — l&apos;IA génère le devis
                </p>
              </div>

              {/* Input */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ex: Devis pour Régie Naef, pose WC suspendu Geberit avec bâti-support, remplacement lavabo, salle de bain 3ème..."
                    rows={4}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  Générer le devis
                </button>
              </form>

              {/* Quick examples */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 font-medium mb-3">Exemples — cliquez pour utiliser</p>
                <div className="grid grid-cols-1 gap-2">
                  {EXAMPLES.map((example, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(example)}
                      className="text-left p-3 text-sm text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-100 hover:border-blue-200 rounded-xl transition-all"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* === GENERATING === */}
          {status === 'generating' && (
            <div className="text-center space-y-6">
              <div className="relative mx-auto w-20 h-20">
                <Loader2 className="w-20 h-20 animate-spin text-blue-500" />
                <Sparkles className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Génération du devis...
                </h2>
                <p className="text-gray-500">
                  Analyse des travaux, recherche des prix, création du devis
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-left">
                <p className="text-xs font-medium text-gray-400 mb-1">Votre demande</p>
                <p className="text-sm text-gray-700">{sentText}</p>
              </div>
            </div>
          )}

          {/* === DONE === */}
          {status === 'done' && result && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Devis créé !
                </h2>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-400 mb-1">Votre demande</p>
                <p className="text-sm text-gray-600">{sentText}</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-600">Résultat</span>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {result.message}
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={() => router.push('/quotes')}
                  className="w-full py-3.5 px-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  Voir les devis
                </button>
                <button
                  onClick={reset}
                  className="w-full py-3 px-4 bg-white text-gray-600 font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Créer un autre devis
                </button>
              </div>
            </div>
          )}

          {/* === ERROR === */}
          {status === 'error' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Erreur</h2>
                <p className="text-sm text-red-500">{error}</p>
              </div>
              <button
                onClick={reset}
                className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
              >
                Réessayer
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}