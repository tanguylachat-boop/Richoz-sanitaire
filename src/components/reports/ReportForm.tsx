'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { VoiceRecorder } from './VoiceRecorder';
import { PhotoUploader } from './PhotoUploader';
import { SignatureCanvas } from './SignatureCanvas';
import { cn } from '@/lib/utils';
import type { Intervention, Report, Product } from '@/types/database';
import {
  Save,
  Send,
  XCircle,
  Loader2,
  AlertTriangle,
  Package,
} from 'lucide-react';

interface ReportFormProps {
  intervention: Intervention;
  existingReport: Report | null;
  products: Product[];
  technicianId: string;
}

export function ReportForm({
  intervention,
  existingReport,
  products,
  technicianId,
}: ReportFormProps) {
  const router = useRouter();
  const supabase = createClient();

  // Parse existing photos into before/after categories
  const parseExistingPhotos = () => {
    const existingPhotos = (existingReport?.photos as unknown as (string | { url: string; caption?: string; category?: string })[]) || [];
    const before: { url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[] = [];
    const after: { url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[] = [];
    const uncategorized: { url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[] = [];

    existingPhotos.forEach((photo) => {
      if (typeof photo === 'string') {
        uncategorized.push({ url: photo });
      } else if (photo.category === 'before') {
        before.push({ url: photo.url, caption: photo.caption });
      } else if (photo.category === 'after') {
        after.push({ url: photo.url, caption: photo.caption });
      } else {
        uncategorized.push({ url: photo.url, caption: photo.caption });
      }
    });

    if (before.length === 0 && after.length === 0 && uncategorized.length > 0) {
      return { before: uncategorized, after: [] };
    }

    return { before: [...before, ...uncategorized], after };
  };

  const parsedPhotos = parseExistingPhotos();

  // =============================================
  // FORM STATE
  // =============================================

  const [textContent, setTextContent] = useState(existingReport?.text_content || '');
  const [vocalUrl, setVocalUrl] = useState(existingReport?.vocal_url || '');
  const [vocalTranscription, setVocalTranscription] = useState(
    existingReport?.vocal_transcription || ''
  );
  const [photosBefore, setPhotosBefore] = useState<{ url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[]>(parsedPhotos.before);
  const [photosAfter, setPhotosAfter] = useState<{ url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[]>(parsedPhotos.after);
  const [isBillable, setIsBillable] = useState(existingReport?.is_billable ?? true);
  const [billableReason, setBillableReason] = useState(existingReport?.billable_reason || '');
  const [workDuration, setWorkDuration] = useState(existingReport?.work_duration_minutes || 60);
  const [isCompleted, setIsCompleted] = useState(true);

  // Fournitures texte libre (sans prix)
  const [suppliesText, setSuppliesText] = useState(
    (existingReport as unknown as { supplies_text?: string })?.supplies_text || ''
  );

  // Signature client
  const [clientSignature, setClientSignature] = useState<string | null>(
    (existingReport as unknown as { client_signature?: string })?.client_signature || null
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);

  // =============================================
  // HANDLERS
  // =============================================

  const handleRecordingComplete = (url: string, transcription?: string) => {
    setVocalUrl(url);
    if (transcription) {
      setVocalTranscription(transcription);
    }
  };

  const handlePhotosBeforeChange = (newPhotos: { url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[]) => {
    setPhotosBefore(newPhotos);
  };

  const handlePhotosAfterChange = (newPhotos: { url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[]) => {
    setPhotosAfter(newPhotos);
  };

  const handleSignatureChange = (dataUrl: string | null) => {
    setClientSignature(dataUrl);
  };

  // Total photos count
  const totalPhotos = photosBefore.length + photosAfter.length;

  // =============================================
  // UPLOAD HELPERS
  // =============================================

  const uploadPhotos = async (
    photos: { url: string; file?: File; isLocal?: boolean }[],
    category: string
  ): Promise<{ url: string; category: string }[]> => {
    const results: { url: string; category: string }[] = [];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];

      if (photo.isLocal && photo.file) {
        const fileName = `intervention-${intervention.id}-${category}-${Date.now()}-${i}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, photo.file, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          console.error(`[UPLOAD ERROR] ${fileName}:`, uploadError);
          throw new Error(`Échec upload photo: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('photos')
          .getPublicUrl(fileName);

        results.push({ url: publicUrl, category });
      } else {
        results.push({ url: photo.url, category });
      }
    }

    return results;
  };

  const uploadSignature = async (dataUrl: string): Promise<string> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    const fileName = `signatures/intervention-${intervention.id}-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/png',
      });

    if (uploadError) {
      console.error('[SIGNATURE UPLOAD ERROR]', uploadError);
      throw new Error(`Échec upload signature: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('photos')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  // =============================================
  // BUILD REPORT DATA
  // =============================================

  const buildReportData = (allPhotos: { url: string; category: string }[], signatureUrl: string | null, status: 'draft' | 'submitted') => ({
    intervention_id: intervention.id,
    technician_id: technicianId,
    text_content: textContent || null,
    vocal_url: vocalUrl || null,
    vocal_transcription: vocalTranscription || null,
    photos: allPhotos.length > 0 ? allPhotos : [],
    checklist: [],
    is_billable: isBillable,
    billable_reason: !isBillable ? billableReason : null,
    work_duration_minutes: workDuration,
    materials_used: [],
    supplies_text: suppliesText || null,
    client_signature: signatureUrl,
    is_completed: isCompleted,
    status,
    // Reset revision fields on submit so the banner disappears
    ...(status === 'submitted' ? { revision_requested: false, revision_message: null } : {}),
  });

  // =============================================
  // SAVE DRAFT
  // =============================================

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const beforeUrls = await uploadPhotos(photosBefore, 'before');
      const afterUrls = await uploadPhotos(photosAfter, 'after');
      const allPhotos = [...beforeUrls, ...afterUrls];

      let signatureUrl = null;
      if (clientSignature && clientSignature.startsWith('data:')) {
        signatureUrl = await uploadSignature(clientSignature);
      } else if (clientSignature) {
        signatureUrl = clientSignature;
      }

      const reportData = buildReportData(allPhotos, signatureUrl, 'draft');

      // Determine the report ID to update
      let reportId = existingReport?.id;

      if (!reportId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: foundReport } = await (supabase as any)
          .from('reports')
          .select('id')
          .eq('intervention_id', intervention.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (foundReport) reportId = foundReport.id;
      }

      if (reportId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('reports')
          .update(reportData)
          .eq('id', reportId)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Mise à jour échouée (0 lignes)');
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('reports').insert(reportData);
        if (error) throw error;
      }

      toast.success('Brouillon sauvegardé');
    } catch (error) {
      console.error('[SAVE DRAFT ERROR]', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Erreur sauvegarde: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // =============================================
  // SUBMIT
  // =============================================

  const handleSubmit = async () => {
    console.log('[SUBMIT] Start - existingReport:', existingReport?.id, 'status:', existingReport?.status, 'revision_requested:', (existingReport as Record<string, unknown>)?.revision_requested);

    if (!textContent && !vocalTranscription) {
      toast.error('Veuillez ajouter une description ou un enregistrement vocal');
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress('Préparation du rapport...');

    try {
      // Upload photos
      const allLocalPhotos = [
        ...photosBefore.filter(p => p.isLocal && p.file),
        ...photosAfter.filter(p => p.isLocal && p.file),
      ];

      if (allLocalPhotos.length > 0) {
        setSubmitProgress(`Upload de ${allLocalPhotos.length} photo(s)...`);
      }

      const beforeUrls = await uploadPhotos(photosBefore, 'before');
      const afterUrls = await uploadPhotos(photosAfter, 'after');
      const allPhotos = [...beforeUrls, ...afterUrls];

      if (allLocalPhotos.length > 0) {
        toast.success(`${allLocalPhotos.length} photo(s) uploadée(s)`);
      }

      // Upload signature
      let signatureUrl = null;
      if (clientSignature) {
        setSubmitProgress('Upload de la signature...');
        if (clientSignature.startsWith('data:')) {
          signatureUrl = await uploadSignature(clientSignature);
        } else {
          signatureUrl = clientSignature;
        }
      }

      // Save report
      setSubmitProgress('Sauvegarde du rapport...');
      const reportData = buildReportData(allPhotos, signatureUrl, 'submitted');
      console.log('[SUBMIT] reportData:', JSON.stringify(reportData, null, 2));

      // Determine the report ID to update: use existingReport prop,
      // or look up directly if the prop was null (e.g. RLS/query issue)
      let reportId = existingReport?.id;

      if (!reportId) {
        console.log('[SUBMIT] existingReport is null - looking up report for intervention:', intervention.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: foundReport, error: lookupError } = await (supabase as any)
          .from('reports')
          .select('id')
          .eq('intervention_id', intervention.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lookupError) {
          console.error('[SUBMIT] Report lookup error:', lookupError);
        }
        if (foundReport) {
          reportId = foundReport.id;
          console.log('[SUBMIT] Found existing report via direct lookup:', reportId);
        }
      }

      if (reportId) {
        console.log('[SUBMIT] Updating report:', reportId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updatedData, error } = await (supabase as any)
          .from('reports')
          .update(reportData)
          .eq('id', reportId)
          .select();

        console.log('[SUBMIT] Update result - data:', updatedData, 'error:', error);

        if (error) throw error;
        if (!updatedData || updatedData.length === 0) {
          console.error('[SUBMIT] UPDATE returned 0 rows! Possible RLS issue.');
          throw new Error('La mise à jour du rapport a échoué (aucune ligne modifiée). Vérifiez les permissions.');
        }
      } else {
        console.log('[SUBMIT] No existing report found - inserting new report');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insertedData, error } = await (supabase as any)
          .from('reports')
          .insert(reportData)
          .select();

        console.log('[SUBMIT] Insert result - data:', insertedData, 'error:', error);

        if (error) throw error;
        if (!insertedData || insertedData.length === 0) {
          throw new Error("L'insertion du rapport a échoué. Vérifiez les permissions.");
        }
      }

      // Update intervention status
      setSubmitProgress("Mise à jour de l'intervention...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: intUpdateData, error: interventionError } = await (supabase as any)
        .from('interventions')
        .update({
          status: isCompleted ? 'termine' : 'en_cours',
          date_completed: isCompleted ? new Date().toISOString() : null,
        })
        .eq('id', intervention.id)
        .select();

      console.log('[SUBMIT] Intervention update result - data:', intUpdateData, 'error:', interventionError);

      if (interventionError) {
        console.error('[DB ERROR] Intervention update:', interventionError);
        toast.warning('Rapport sauvegardé mais statut non mis à jour');
      }

      setSubmitProgress('Terminé!');
      toast.success('Rapport soumis avec succès !');

      setTimeout(() => {
        router.push('/technician/today');
        router.refresh();
      }, 500);
    } catch (error) {
      console.error('[SUBMIT ERROR]', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Erreur: ${message}`);
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  };

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="space-y-6 pb-32">
      {/* Progress summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Résumé</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <p className="text-lg font-bold text-blue-700">{totalPhotos}</p>
            <p className="text-xs text-blue-600">Photo{totalPhotos > 1 ? 's' : ''}</p>
          </div>
          <div className="text-center p-2 bg-amber-50 rounded-lg">
            <p className="text-lg font-bold text-amber-700">{workDuration}</p>
            <p className="text-xs text-amber-600">Minutes</p>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded-lg">
            <p className="text-lg font-bold text-emerald-700">{isCompleted ? 'Oui' : 'Non'}</p>
            <p className="text-xs text-emerald-600">Terminée</p>
          </div>
        </div>
      </div>

      {/* ===== TERMINÉE OUI / NON ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">✅ Intervention terminée ?</h2>
            <p className="text-sm text-gray-500">L&apos;intervention est-elle complètement terminée ?</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCompleted(true)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                isCompleted
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Oui
            </button>
            <button
              onClick={() => setIsCompleted(false)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                !isCompleted
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Non
            </button>
          </div>
        </div>
        {!isCompleted && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-700">
              ⚠️ L&apos;intervention restera &quot;en cours&quot;. Vous pourrez revenir compléter le rapport plus tard.
            </p>
          </div>
        )}
      </div>

      {/* ===== DESCRIPTION DE L'INTERVENTION ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">
          ✏️ Description de l&apos;intervention
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Décrivez le travail réalisé, les problèmes rencontrés, les solutions apportées...
        </p>
        <textarea
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          placeholder="Ex: Remplacement du robinet mural mélangeur par un mitigeur 120x220. Coupure d'eau effectuée, test fonctionnement OK..."
          className="w-full h-32 px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* ===== ENREGISTREMENT VOCAL ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">
          🎙️ Ou dictez votre rapport
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Plus simple que de taper sur le téléphone !
        </p>
        <VoiceRecorder
          interventionId={intervention.id}
          existingUrl={vocalUrl}
          onRecordingComplete={handleRecordingComplete}
        />
        {vocalTranscription && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-600 font-medium mb-1">📝 Transcription :</p>
            <p className="text-sm text-blue-800">{vocalTranscription}</p>
          </div>
        )}
      </div>

      {/* ===== FOURNITURES / PIÈCES (texte libre, SANS PRIX) ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-5 h-5 text-gray-700" />
          <h2 className="font-semibold text-gray-900">Fournitures</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Listez les pièces et fournitures utilisées. Pas besoin de mettre les prix.
        </p>
        <textarea
          value={suppliesText}
          onChange={(e) => setSuppliesText(e.target.value)}
          placeholder="Ex: 1 robinet mural mitigeur 120x220, 2 raccords laiton 1/2, ruban teflon, joints fibre..."
          className="w-full h-24 px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* ===== PHOTOS AVANT ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-1">📷 Photos avant</h2>
        <p className="text-sm text-gray-500 mb-3">
          État initial, problème constaté à l&apos;arrivée
        </p>
        <PhotoUploader
          interventionId={intervention.id}
          photos={photosBefore}
          onPhotosChange={handlePhotosBeforeChange}
          maxPhotos={5}
        />
      </div>

      {/* ===== PHOTOS APRÈS ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-1">📸 Photos après</h2>
        <p className="text-sm text-gray-500 mb-3">
          Travail réalisé, résultat final
        </p>
        <PhotoUploader
          interventionId={intervention.id}
          photos={photosAfter}
          onPhotosChange={handlePhotosAfterChange}
          maxPhotos={5}
        />
      </div>

      {/* ===== DURÉE DU TRAVAIL ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">
          ⏱️ Durée du travail
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWorkDuration(Math.max(0, workDuration - 15))}
            className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl text-xl font-bold transition-colors"
          >
            -
          </button>
          <div className="flex-1 text-center">
            <input
              type="number"
              value={workDuration}
              onChange={(e) => setWorkDuration(parseInt(e.target.value) || 0)}
              min={0}
              step={15}
              className="w-24 px-3 py-3 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">minutes</p>
          </div>
          <button
            onClick={() => setWorkDuration(workDuration + 15)}
            className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl text-xl font-bold transition-colors"
          >
            +
          </button>
        </div>
        {/* Quick buttons */}
        <div className="flex gap-2 mt-3">
          {[30, 60, 90, 120].map((mins) => (
            <button
              key={mins}
              onClick={() => setWorkDuration(mins)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                workDuration === mins
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
            </button>
          ))}
        </div>
      </div>

      {/* ===== FACTURABLE ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-gray-900">💰 Facturable</h2>
            <p className="text-sm text-gray-500">Cette intervention sera facturée</p>
          </div>
          <button
            onClick={() => setIsBillable(!isBillable)}
            className={cn(
              'relative w-14 h-8 rounded-full transition-colors',
              isBillable ? 'bg-emerald-500' : 'bg-gray-300'
            )}
          >
            <span
              className={cn(
                'absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform',
                isBillable ? 'left-7' : 'left-1'
              )}
            />
          </button>
        </div>

        {!isBillable && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium">
                Raison de la non-facturation
              </p>
            </div>
            <textarea
              value={billableReason}
              onChange={(e) => setBillableReason(e.target.value)}
              placeholder="Ex: Sous garantie, défaut de fabrication, geste commercial..."
              className="w-full h-20 px-3 py-2 text-base border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none bg-white"
            />
          </div>
        )}
      </div>

      {/* ===== SIGNATURE CLIENT ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-1">✍️ Signature du client</h2>
        <p className="text-sm text-gray-500 mb-3">
          Faites signer le client directement sur l&apos;écran
        </p>
        <SignatureCanvas
          onSignatureChange={handleSignatureChange}
          existingSignature={clientSignature}
        />
      </div>

      {/* ===== ACTIONS FIXES EN BAS ===== */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200 safe-area-pb z-50">
        <div className="flex gap-3 max-w-2xl mx-auto">
          <button
            onClick={handleSaveDraft}
            disabled={isSaving || isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 py-4 px-4 border-2 border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {isSaving ? 'Sauvegarde...' : 'Brouillon'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 py-4 px-4 bg-emerald-600 rounded-xl font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/30"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">{submitProgress || 'Envoi...'}</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Soumettre
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}