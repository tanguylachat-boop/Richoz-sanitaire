'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Trash2, AlertCircle } from 'lucide-react';

interface VoiceRecorderProps {
  onRecordingComplete: (transcription: string) => void;
}

// Type for Web Speech API
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

export function VoiceRecorder({ onRecordingComplete }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [interimText, setInterimText] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptionRef = useRef('');
  const interimTextRef = useRef('');
  const isStoppingRef = useRef(false);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setError(
        'La reconnaissance vocale n\'est pas supportée par ce navigateur. Utilisez Chrome ou Safari.'
      );
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const stopRecordingCleanup = () => {
    setIsRecording(false);
    setInterimText('');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = useCallback(() => {
    setError(null);
    setInterimText('');
    isStoppingRef.current = false;

    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Reconnaissance vocale non supportée.');
      return;
    }

    const recognition = new (SpeechRecognition as new () => SpeechRecognitionInstance)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'fr-CH';

    recognition.onstart = () => {
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = transcriptionRef.current;
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const newText = result[0].transcript.trim();
          if (newText) {
            finalText = finalText ? `${finalText} ${newText}` : newText;
          }
        } else {
          interim = result[0].transcript;
        }
      }

      transcriptionRef.current = finalText;
      setTranscription(finalText);
      setInterimText(interim);
      interimTextRef.current = interim;
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);

      if (event.error === 'not-allowed') {
        setError(
          'Accès au microphone refusé. Autorisez l\'accès dans les paramètres de votre navigateur.'
        );
        stopRecordingCleanup();
      } else if (event.error === 'no-speech') {
        // Pas d'erreur affichée, on continue d'écouter
      } else if (event.error === 'network') {
        setError(
          'Erreur réseau. La reconnaissance vocale nécessite une connexion internet.'
        );
        stopRecordingCleanup();
      } else if (event.error !== 'aborted') {
        setError(`Erreur de reconnaissance vocale: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart si on n'a pas demandé l'arrêt (le navigateur coupe parfois)
      if (!isStoppingRef.current && recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          stopRecordingCleanup();
        }
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError('Impossible de démarrer la reconnaissance vocale.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    isStoppingRef.current = true;

    // Merge any pending interim text into the final transcription
    if (interimTextRef.current) {
      const pending = interimTextRef.current.trim();
      if (pending) {
        transcriptionRef.current = transcriptionRef.current
          ? `${transcriptionRef.current} ${pending}`
          : pending;
        setTranscription(transcriptionRef.current);
      }
      interimTextRef.current = '';
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    stopRecordingCleanup();

    // Notify parent with transcription text
    const finalText = transcriptionRef.current;
    onRecordingComplete(finalText);
  }, [onRecordingComplete]);

  const deleteTranscription = () => {
    setTranscription('');
    setInterimText('');
    setRecordingTime(0);
    setError(null);
    transcriptionRef.current = '';
    onRecordingComplete('');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Not supported */}
      {!isSupported && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Navigateur non supporté
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Utilisez Chrome ou Safari pour la dictée vocale. Vous pouvez
                toujours taper votre rapport manuellement.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Start button */}
      {!isRecording && !transcription && isSupported && (
        <button
          onClick={startRecording}
          className="w-full flex items-center justify-center gap-3 py-5 border-2 border-dashed rounded-xl transition-all active:scale-[0.98] bg-red-50 hover:bg-red-100 border-red-200"
        >
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500">
            <Mic className="w-7 h-7 text-white" />
          </div>
          <span className="font-semibold text-red-700">
            Appuyer pour dicter
          </span>
        </button>
      )}

      {/* Recording in progress */}
      {isRecording && (
        <div className="flex flex-col items-center gap-4 py-6 bg-red-50 rounded-xl">
          <div className="relative">
            <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
              <Mic className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full animate-ping" />
          </div>
          <p className="text-2xl font-mono font-bold text-red-700">
            {formatTime(recordingTime)}
          </p>
          <p className="text-sm text-red-600">Parlez maintenant...</p>

          {/* Live transcription preview */}
          {(transcription || interimText) && (
            <div className="w-full px-4">
              <div className="p-3 bg-white rounded-lg border border-red-200 max-h-32 overflow-y-auto">
                <p className="text-sm text-gray-800">
                  {transcription}
                  {interimText && (
                    <span className="text-gray-400 italic"> {interimText}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-8 py-4 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 active:scale-95 transition-all shadow-lg"
          >
            <Square className="w-5 h-5" />
            Arrêter
          </button>
        </div>
      )}

      {/* Transcription result */}
      {!isRecording && transcription && (
        <div className="p-4 bg-gray-50 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">📝 Texte dicté</p>
            <div className="flex items-center gap-2">
              <button
                onClick={startRecording}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors active:scale-95"
              >
                <Mic className="w-4 h-4" />
                Compléter
              </button>
              <button
                onClick={deleteTranscription}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors active:scale-95"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-3 bg-white rounded-lg border border-gray-200">
            <p className="text-sm text-gray-800 leading-relaxed">
              {transcription}
            </p>
          </div>
          <p className="text-xs text-gray-400">
            Durée d&apos;enregistrement : {formatTime(recordingTime)}
          </p>
        </div>
      )}
    </div>
  );
}
