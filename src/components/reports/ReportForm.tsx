'use client';

import { useState, useEffect } from 'react';
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
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  Wrench,
  Package,
} from 'lucide-react';

interface ReportFormProps {
  intervention: Intervention;
  existingReport: Report | null;
  products: Product[];
  technicianId: string;
}

interface ChecklistItem {
  item: string;
  done: boolean;
}

interface MaterialItem {
  product_id?: string;
  name: string;
  quantity: number;
  unit_price: number;
  code?: string;
  catalog_code?: string;
}

// Default checklist items
const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { item: 'Coupure eau/gaz effectuée', done: false },
  { item: 'Zone de travail protégée', done: false },
  { item: 'Diagnostic effectué', done: false },
  { item: 'Réparation/intervention réalisée', done: false },
  { item: 'Test de fonctionnement', done: false },
  { item: 'Nettoyage zone de travail', done: false },
];

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

  // Form state
  const [textContent, setTextContent] = useState(existingReport?.text_content || '');
  const [vocalUrl, setVocalUrl] = useState(existingReport?.vocal_url || '');
  const [vocalTranscription, setVocalTranscription] = useState(
    existingReport?.vocal_transcription || ''
  );
  const [photosBefore, setPhotosBefore] = useState<{ url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[]>(parsedPhotos.before);
  const [photosAfter, setPhotosAfter] = useState<{ url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[]>(parsedPhotos.after);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    (existingReport?.checklist as unknown as ChecklistItem[]) || DEFAULT_CHECKLIST
  );
  const [isBillable, setIsBillable] = useState(existingReport?.is_billable ?? true);
  const [billableReason, setBillableReason] = useState(existingReport?.billable_reason || '');
  const [workDuration, setWorkDuration] = useState(existingReport?.work_duration_minutes || 60);
  const [materials, setMaterials] = useState<MaterialItem[]>(
    (existingReport?.materials_used as unknown as MaterialItem[]) || []
  );
  // NEW: Free-text supplies field
  const [suppliesText, setSuppliesText] = useState(
    (existingReport as unknown as { supplies_text?: string })?.supplies_text || ''
  );
  const [clientSignature, setClientSignature] = useState<string | null>(
    (existingReport as unknown as { client_signature?: string })?.client_signature || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);

  // Handle checklist toggle
  const toggleChecklistItem = (index: number) => {
    setChecklist((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      )
    );
  };

  // Handle voice recording complete
  const handleRecordingComplete = (url: string, transcription?: string) => {
    setVocalUrl(url);
    if (transcription) {
      setVocalTranscription(transcription);
    }
  };

  // Handle photo changes
  const handlePhotosBeforeChange = (newPhotos: { url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[]) => {
    setPhotosBefore(newPhotos);
  };

  const handlePhotosAfterChange = (newPhotos: { url: string; caption?: string; file?: File; isLocal?: boolean; isUploading?: boolean }[]) => {
    setPhotosAfter(newPhotos);
  };

  // Handle signature change
  const handleSignatureChange = (dataUrl: string | null) => {
    setClientSignature(dataUrl);
  };

  // Add material from catalog
  const addMaterial = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setMaterials((prev) => [
      ...prev,
      {
        product_id: product.id,
        name: product.name,
        quantity: 1,
        unit_price: product.price,
        code: (product as unknown as { code?: string }).code || '',
        catalog_code: (product as unknown as { catalog_code?: string }).catalog_code || '',
      },
    ]);
  };

  // Remove material
  const removeMaterial = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  // Update material quantity
  const updateMaterialQuantity = (index: number, quantity: number) => {
    setMaterials((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  };

  // Calculate total materials cost
  const totalMaterialsCost = materials.reduce(
    (sum, m) => sum + m.quantity * m.unit_price,
    0
  );

  // Calculate checklist completion
  const checklistCompleted = checklist.filter((c) => c.done).length;
  const checklistTotal = checklist.length;

  // Total photos count
  const totalPhotos = photosBefore.length + photosAfter.length;

  // Upload photos helper
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

  // Upload signature to Supabase Storage
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

  // Build report data (shared between save draft and submit)
  const buildReportData = (allPhotos: { url: string; category: string }[], signatureUrl: string | null, status: 'draft' | 'submitted') => ({
    intervention_id: intervention.id,
    technician_id: technicianId,
    text_content: textContent || null,
    vocal_url: vocalUrl || null,
    vocal_transcription: vocalTranscription || null,
    photos: allPhotos.length > 0 ? allPhotos : [],
    checklist,
    is_billable: isBillable,
    billable_reason: !isBillable ? billableReason : null,
    work_duration_minutes: workDuration,
    materials_used: materials,
    supplies_text: suppliesText || null,
    client_signature: signatureUrl,
    status,
  });

  // Save as draft
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

      if (existingReport) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('reports')
          .update(reportData)
          .eq('id', existingReport.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('reports').insert(reportData);
        if (error) throw error;
      }

      toast.success('Brouillon sauvegardé');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit report
  const handleSubmit = async () => {
    if (!textContent && !vocalTranscription) {
      toast.error('Veuillez ajouter une description ou un enregistrement vocal');
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress('Préparation du rapport...');

    try {
      // ÉTAPE 1: UPLOAD DES PHOTOS
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
        toast.success(`${allLocalPhotos.length} photo(s) uploadée(s) avec succès`);
      }

      // ÉTAPE 2: UPLOAD SIGNATURE
      let signatureUrl = null;
      if (clientSignature) {
        setSubmitProgress('Upload de la signature...');
        if (clientSignature.startsWith('data:')) {
          signatureUrl = await uploadSignature(clientSignature);
        } else {
          signatureUrl = clientSignature;
        }
      }

      // ÉTAPE 3: SAUVEGARDE EN BASE DE DONNÉES
      setSubmitProgress('Sauvegarde du rapport...');

      const reportData = buildReportData(allPhotos, signatureUrl, 'submitted');

      if (existingReport) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('reports')
          .update(reportData)
          .eq('id', existingReport.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('reports').insert(reportData);
        if (error) throw error;
      }

      // Mise à jour du statut de l'intervention
      setSubmitProgress('Mise à jour de l\'intervention...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: interventionError } = await (supabase as any)
        .from('interventions')
        .update({
          status: 'termine',
          date_completed: new Date().toISOString(),
        })
        .eq('id', intervention.id);

      if (interventionError) {
        console.error('[DB ERROR] Intervention update:', interventionError);
        toast.warning('Rapport sauvegardé mais statut non mis à jour');
      }

      // ÉTAPE 4: REDIRECTION
      setSubmitProgress('Terminé!');
      toast.success('Rapport soumis avec succès ! 🎉');

      setTimeout(() => {
        router.push('/technician/today');
        router.refresh();
      }, 500);
    } catch (error) {
      console.error('[SUBMIT ERROR]', error);
      toast.error(`Erreur: ${error instanceof Error ? error.message : 'Erreur lors de la soumission'}`);
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  };

  return (
    <div className="space-y-6 pb-32">
      {/* Progress summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Progression</h2>
          <span className="text-sm text-gray-500">
            {checklistCompleted}/{checklistTotal} points validés
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(checklistCompleted / checklistTotal) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
          <span>{totalPhotos} photo{totalPhotos > 1 ? 's' : ''}</span>
          <span>{workDuration} min de travail</span>
          <span>{materials.length} prestation{materials.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Voice recording section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">
          🎙️ Enregistrement vocal
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Dictez votre rapport - plus simple que de taper sur le téléphone !
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

      {/* Text description */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">
          ✏️ Description écrite
        </h2>
        <textarea
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          placeholder="Décrivez l'intervention réalisée, les problèmes rencontrés, les solutions apportées..."
          className="w-full h-32 px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <p className="text-xs text-gray-400 mt-2">
          {textContent.length} caractères
        </p>
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

      {/* Checklist */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">
          ✅ Points de contrôle
        </h2>
        <div className="space-y-2">
          {checklist.map((item, index) => (
            <button
              key={index}
              onClick={() => toggleChecklistItem(index)}
              className={cn(
                'w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left active:scale-[0.98]',
                item.done
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              )}
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                  item.done ? 'bg-emerald-500' : 'border-2 border-gray-300'
                )}
              >
                {item.done && (
                  <CheckCircle className="w-5 h-5 text-white" />
                )}
              </div>
              <span
                className={cn(
                  'text-base',
                  item.done ? 'text-emerald-800 font-medium' : 'text-gray-700'
                )}
              >
                {item.item}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Work duration */}
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

      {/* ===== PRESTATIONS CATALOGUE (renamed from "Matériaux utilisés") ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="w-5 h-5 text-gray-700" />
          <h2 className="font-semibold text-gray-900">Prestations catalogue</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Sélectionnez les prestations de la liste de prix Richoz (poses, raccordements, déplacement, etc.)
        </p>

        {/* Material list */}
        {materials.length > 0 && (
          <div className="space-y-2 mb-4">
            {materials.map((material, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {material.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {material.unit_price.toFixed(2)} CHF × {material.quantity} = {(material.unit_price * material.quantity).toFixed(2)} CHF
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      updateMaterialQuantity(index, material.quantity - 1)
                    }
                    className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded-lg hover:bg-gray-100 active:scale-95"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-bold">
                    {material.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateMaterialQuantity(index, material.quantity + 1)
                    }
                    className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded-lg hover:bg-gray-100 active:scale-95"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => removeMaterial(index)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg active:scale-95"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            ))}

            {/* Total */}
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
              <span className="font-medium text-blue-800">Total prestations</span>
              <span className="font-bold text-blue-800">{totalMaterialsCost.toFixed(2)} CHF</span>
            </div>
          </div>
        )}

        {/* Add material from catalog */}
        {products.length > 0 ? (
          <select
            onChange={(e) => {
              if (e.target.value) {
                addMaterial(e.target.value);
                e.target.value = '';
              }
            }}
            className="w-full px-3 py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">+ Ajouter une prestation</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} - {product.price.toFixed(2)} CHF
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            Aucune prestation disponible
          </p>
        )}
      </div>

      {/* ===== NEW: FOURNITURES / PIÈCES (texte libre) ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-5 h-5 text-gray-700" />
          <h2 className="font-semibold text-gray-900">Fournitures / Pièces utilisées</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Décrivez les pièces et fournitures utilisées (robinets, joints, flexibles, etc.). Le prix sera ajouté lors de la facturation.
        </p>
        <textarea
          value={suppliesText}
          onChange={(e) => setSuppliesText(e.target.value)}
          placeholder="Ex: 1 cloche WC Geberit, 1 flotteur universel, 1 flexible 3/8-3/8, 2 joints fibre..."
          className="w-full h-24 px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        {suppliesText && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700">
              💡 Les prix des fournitures seront ajoutés lors de la validation de la facture
            </p>
          </div>
        )}
      </div>

      {/* Billable toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-gray-900">💰 Facturable</h2>
            <p className="text-sm text-gray-500">Cette intervention sera facturée au client</p>
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
                Raison de la non-facturation (obligatoire)
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

      {/* ===== CLIENT SIGNATURE ===== */}
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

      {/* Fixed bottom actions */}
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
                {submitProgress || 'Envoi...'}
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