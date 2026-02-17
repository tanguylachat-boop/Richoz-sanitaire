'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Mic, Square, Play, Pause, Trash2, Upload, AlertCircle, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
  interventionId: string;
  existingUrl?: string;
  onRecordingComplete: (url: string, transcription?: string) => void;
}

const BUCKET_NAME = 'audio';

export function VoiceRecorder({
  interventionId,
  existingUrl,
  onRecordingComplete,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(existingUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const supabase = createClient();

  // Check microphone permission on mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then((result) => {
          setMicPermission(result.state as 'granted' | 'denied' | 'prompt');
          result.onchange = () => {
            setMicPermission(result.state as 'granted' | 'denied' | 'prompt');
          };
        })
        .catch(() => {
          // Permissions API not supported
        });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Start recording
  const startRecording = async () => {
    setError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      streamRef.current = stream;

      // Check for supported mimeType
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Use browser default
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      
      setMicPermission('granted');
    } catch (error: unknown) {
      console.error('Microphone error:', error);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setMicPermission('denied');
          setError('Accès au microphone refusé. Autorisez l\'accès dans les paramètres de votre navigateur.');
        } else if (error.name === 'NotFoundError') {
          setError('Aucun microphone détecté sur cet appareil.');
        } else {
          setError('Impossible d\'accéder au microphone. Vérifiez vos paramètres.');
        }
      }
      toast.error('Impossible d\'accéder au microphone');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Play/pause audio
  const togglePlayback = () => {
    if (!audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Delete recording
  const deleteRecording = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setRecordingTime(0);
    setError(null);
  };

  // Upload and transcribe
  const uploadRecording = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    setError(null);
    
    try {
      const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `${interventionId}/${Date.now()}.${ext}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, audioBlob, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        
        if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found')) {
          setError(`Le bucket "${BUCKET_NAME}" n'existe pas. Demandez à l'administrateur de le créer.`);
          return;
        }
        
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      toast.success('Enregistrement sauvegardé');

      // Try transcription via webhook (optional - n8n will handle it)
      try {
        const response = await fetch('/api/webhooks/transcribe-audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_WEBHOOK_SECRET || ''}`,
          },
          body: JSON.stringify({
            audio_url: publicUrl,
            intervention_id: interventionId,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          onRecordingComplete(publicUrl, data.transcription);
          toast.success('Transcription effectuée');
        } else {
          // Even if transcription fails, save the URL
          onRecordingComplete(publicUrl);
        }
      } catch {
        // Transcription service unavailable, but recording is saved
        onRecordingComplete(publicUrl);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erreur lors de l\'upload');
      setError('Une erreur est survenue lors de l\'upload. Veuillez réessayer.');
    } finally {
      setIsUploading(false);
    }
  };

  // Format time as MM:SS
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

      {/* Microphone permission denied */}
      {micPermission === 'denied' && !error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Microphone bloqué</p>
              <p className="text-xs text-amber-600 mt-1">
                Autorisez l&apos;accès au microphone dans les paramètres de votre navigateur.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recording controls */}
      {!audioUrl && !isRecording && (
        <button
          onClick={startRecording}
          disabled={micPermission === 'denied'}
          className={cn(
            'w-full flex items-center justify-center gap-3 py-5 border-2 border-dashed rounded-xl transition-all active:scale-[0.98]',
            micPermission === 'denied'
              ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
              : 'bg-red-50 hover:bg-red-100 border-red-200'
          )}
        >
          <div className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center',
            micPermission === 'denied' ? 'bg-gray-400' : 'bg-red-500'
          )}>
            <Mic className="w-7 h-7 text-white" />
          </div>
          <span className={cn(
            'font-semibold',
            micPermission === 'denied' ? 'text-gray-400' : 'text-red-700'
          )}>
            Appuyer pour enregistrer
          </span>
        </button>
      )}

      {/* Recording in progress */}
      {isRecording && (
        <div className="flex flex-col items-center gap-4 py-8 bg-red-50 rounded-xl">
          <div className="relative">
            <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center recording-pulse">
              <Mic className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full animate-pulse" />
          </div>
          <p className="text-3xl font-mono font-bold text-red-700">
            {formatTime(recordingTime)}
          </p>
          <p className="text-sm text-red-600">Enregistrement en cours...</p>
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-8 py-4 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 active:scale-95 transition-all shadow-lg"
          >
            <Square className="w-5 h-5" />
            Arrêter
          </button>
        </div>
      )}

      {/* Playback controls */}
      {audioUrl && !isRecording && (
        <div className="p-4 bg-gray-50 rounded-xl space-y-4">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlayback}
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95',
                isPlaying
                  ? 'bg-gray-800 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6 ml-1" />
              )}
            </button>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">
                Enregistrement vocal
              </p>
              <p className="text-sm text-gray-500">
                {recordingTime > 0 ? formatTime(recordingTime) : 'Prêt à écouter'}
              </p>
            </div>
            <button
              onClick={deleteRecording}
              className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95"
            >
              <Trash2 className="w-6 h-6" />
            </button>
          </div>

          {/* Upload button - only show for new recordings */}
          {audioBlob && (
            <button
              onClick={uploadRecording}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sauvegarde en cours...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Sauvegarder l&apos;enregistrement
                </>
              )}
            </button>
          )}

          {/* Already uploaded indicator */}
          {!audioBlob && existingUrl && (
            <div className="flex items-center justify-center gap-2 py-2 text-emerald-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium">Enregistrement sauvegardé</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
