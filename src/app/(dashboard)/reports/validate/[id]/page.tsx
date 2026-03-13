'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ChevronLeft, User, MapPin, Building2, Clock, CheckCircle, XCircle,
  Phone, FileText, Image as ImageIcon, Package,
  CreditCard, Loader2, AlertTriangle, MessageSquare,
  X, ZoomIn, Archive, PenTool, Download, FileDown,
} from 'lucide-react';
import { generateReportDocx } from '@/lib/generate-report-docx';

interface Report {
  id: string;
  intervention_id: string;
  technician_id: string;
  text_content: string | null;
  vocal_url: string | null;
  vocal_transcription: string | null;
  photos: (string | { url: string; caption?: string; category?: string })[];
  is_billable: boolean;
  billable_reason: string | null;
  work_duration_minutes: number | null;
  supplies_text: string | null;
  is_completed: boolean;
  status: string;
  created_at: string;
  client_signature: string | null;
  pdf_url: string | null;
  technician?: {
    id: string; first_name: string; last_name: string; phone: string | null;
  } | null;
  intervention?: {
    id: string; title: string; description: string | null; address: string;
    date_planned: string | null; work_order_number?: string | null;
    client_info: { name?: string; phone?: string } | null;
    regie?: { id: string; name: string } | null;
  } | null;
}

export default function ValidateReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = params.id as string;

  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  // Editable fields for secretary
  const [editTextContent, setEditTextContent] = useState('');
  const [editSuppliesText, setEditSuppliesText] = useState('');
  const [editWorkDuration, setEditWorkDuration] = useState<number>(0);
  const [revisionMessage, setRevisionMessage] = useState('');

  const supabase = createClient();

  useEffect(() => {
    const fetchReport = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *, technician:users!reports_technician_id_fkey(id, first_name, last_name, phone),
          intervention:interventions(id, title, description, address, date_planned, work_order_number, client_info, regie:regies(id, name))
        `)
        .eq('id', reportId)
        .single();

      if (error) {
        console.error('Erreur fetch rapport:', error);
        toast.error('Erreur lors du chargement du rapport');
        router.push('/reports/validate');
        return;
      }
      if (!data) {
        toast.error('Rapport introuvable');
        router.push('/reports/validate');
        return;
      }
      const r = data as Report;
      setReport(r);
      setEditTextContent(r.text_content || '');
      setEditSuppliesText(r.supplies_text || '');
      setEditWorkDuration(r.work_duration_minutes || 0);
      setIsLoading(false);
    };
    fetchReport();
  }, [reportId, router, supabase]);

  const handleValidate = async () => {
    if (!report) return;
    setIsValidating(true);
    try {
      // ÉTAPE 0: SAUVEGARDER LES MODIFICATIONS DE LA SECRÉTAIRE
      console.log('[VALIDATE] Étape 0: Sauvegarde des modifications...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: saveError } = await (supabase as any)
        .from('reports')
        .update({
          text_content: editTextContent || null,
          supplies_text: editSuppliesText || null,
          work_duration_minutes: editWorkDuration || null,
          vocal_transcription: null,
        })
        .eq('id', report.id);
      if (saveError) throw saveError;

      // ÉTAPE 1: GÉNÉRER LE PDF RAPPORT
      console.log('[VALIDATE] Étape 1: Génération du PDF rapport...');
      try {
        const pdfResponse = await fetch(
          'https://primary-production-66b7.up.railway.app/webhook/report-pdf',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report_id: report.id }),
          }
        );
        if (pdfResponse.ok) {
          const pdfResult = await pdfResponse.json();
          console.log('[VALIDATE] PDF généré:', pdfResult.pdf_url);
        } else {
          console.warn('[VALIDATE] PDF non généré:', pdfResponse.status);
        }
      } catch (pdfError) {
        console.warn('[VALIDATE] Erreur PDF (non bloquant):', pdfError);
      }

      // ÉTAPE 2: VALIDER LE RAPPORT
      console.log('[VALIDATE] Étape 2: Validation du rapport...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: reportError } = await (supabase as any)
        .from('reports')
        .update({ status: 'validated', validated_at: new Date().toISOString() })
        .eq('id', report.id);
      if (reportError) throw reportError;

      // ÉTAPE 3: INTERVENTION (seulement si facturable)
      if (!report.intervention_id) {
        throw new Error('intervention_id manquant sur le rapport');
      }
      if (report.is_billable) {
        console.log('[VALIDATE] Étape 3: Intervention → ready_to_bill...');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: interventionError } = await (supabase as any)
          .from('interventions')
          .update({ status: 'ready_to_bill' })
          .eq('id', report.intervention_id);
        if (interventionError) throw interventionError;
      } else {
        console.log('[VALIDATE] Non facturable → Intervention → archived');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: interventionError } = await (supabase as any)
          .from('interventions')
          .update({ status: 'archived' })
          .eq('id', report.intervention_id);
        if (interventionError) throw interventionError;
      }

      // ÉTAPE 4: REDIRECTION
      toast.success('Rapport validé ! PDF généré et prêt à facturer. 🎉');
      router.push('/reports/history');
      router.refresh();
    } catch (error) {
      console.error('[VALIDATE ERROR]', error);
      toast.error('Erreur lors de la validation.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleReject = async () => {
    if (!report || !rejectReason.trim()) { toast.error('Veuillez indiquer une raison'); return; }
    setIsRejecting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('reports').update({
          revision_requested: true,
          revision_message: rejectReason.trim(),
        }).eq('id', report.id);
      if (error) throw error;
      toast.success('Demande d\'informations envoyée au technicien');
      setShowRejectModal(false);
      router.push('/reports/validate');
      router.refresh();
    } catch (error) {
      console.error('Rejection error:', error);
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!report) return;
    setIsGeneratingDocx(true);
    try {
      const intervention = report.intervention;
      const technician = report.technician;
      const clientInfo = intervention?.client_info as { name?: string; phone?: string } | null;

      // Build photo arrays for docx
      const rawPhotos = report.photos || [];
      const docxPhotosBefore: { url: string; caption?: string }[] = [];
      const docxPhotosAfter: { url: string; caption?: string }[] = [];
      rawPhotos.forEach((photo) => {
        if (typeof photo === 'string') {
          docxPhotosBefore.push({ url: photo });
        } else if (photo.category === 'after') {
          docxPhotosAfter.push({ url: photo.url, caption: photo.caption });
        } else {
          docxPhotosBefore.push({ url: photo.url, caption: photo.caption });
        }
      });

      const blob = await generateReportDocx({
        title: intervention?.title || "Rapport d'intervention",
        technicianName: technician ? `${technician.first_name} ${technician.last_name}` : 'Non assigné',
        technicianPhone: technician?.phone || undefined,
        regieName: intervention?.regie?.name,
        address: intervention?.address,
        clientName: clientInfo?.name,
        clientPhone: clientInfo?.phone,
        datePlanned: intervention?.date_planned
          ? format(new Date(intervention.date_planned), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
          : undefined,
        workOrderNumber: intervention?.work_order_number || undefined,
        textContent: editTextContent || undefined,
        suppliesText: editSuppliesText || undefined,
        workDurationMinutes: editWorkDuration || undefined,
        isBillable: report.is_billable,
        billableReason: report.billable_reason || undefined,
        isCompleted: report.is_completed !== false,
        createdAt: format(new Date(report.created_at), "d MMMM yyyy 'à' HH:mm", { locale: fr }),
        photosBefore: docxPhotosBefore.length > 0 ? docxPhotosBefore : undefined,
        photosAfter: docxPhotosAfter.length > 0 ? docxPhotosAfter : undefined,
      });

      const fileName = `rapport-${intervention?.work_order_number || report.id}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Document Word généré');
    } catch (error) {
      console.error('Erreur génération DOCX:', error);
      toast.error('Erreur lors de la génération du document Word');
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement du rapport...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Rapport introuvable</p>
      </div>
    );
  }

  const intervention = report.intervention;
  const technician = report.technician;
  const clientInfo = intervention?.client_info as { name?: string; phone?: string } | null;

  const getPhotoUrl = (path: string): string => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
  };

  const rawPhotos = report.photos || [];
  const photosBefore: { url: string; caption?: string }[] = [];
  const photosAfter: { url: string; caption?: string }[] = [];
  const photosUncategorized: { url: string; caption?: string }[] = [];

  rawPhotos.forEach((photo) => {
    if (typeof photo === 'string') {
      photosUncategorized.push({ url: getPhotoUrl(photo) });
    } else if (photo.category === 'before') {
      photosBefore.push({ url: getPhotoUrl(photo.url), caption: photo.caption });
    } else if (photo.category === 'after') {
      photosAfter.push({ url: getPhotoUrl(photo.url), caption: photo.caption });
    } else {
      photosUncategorized.push({ url: getPhotoUrl(photo.url), caption: photo.caption });
    }
  });

  const hasCategories = photosBefore.length > 0 || photosAfter.length > 0;
  const allPhotosBefore = hasCategories ? photosBefore : photosUncategorized;
  const allPhotosAfter = hasCategories ? photosAfter : [];

  const hourlyRate = 110;

  const PhotoGallery = ({ photos, title, emptyText }: { photos: { url: string; caption?: string }[]; title: string; emptyText: string }) => (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">{title}</h3>
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((photo, index) => (
            <button key={index} onClick={() => setSelectedPhoto(photo.url)} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption || `Photo ${index + 1}`} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic py-4 text-center">{emptyText}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={report.status === 'validated' ? '/reports/history' : '/reports/validate'} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{intervention?.title || "Rapport d'intervention"}</h1>
              {intervention?.work_order_number && (
                <span className="px-2.5 py-1 rounded-lg text-sm font-bold bg-amber-100 text-amber-800 border border-amber-200">Bon N° {intervention.work_order_number}</span>
              )}
            </div>
            <p className="text-sm text-gray-500">Soumis le {format(new Date(report.created_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Statut Terminée */}
          {report.is_completed === false && (
            <span className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">⚠️ NON TERMINÉE</span>
          )}
          {!report.is_billable && (
            <span className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-200 text-gray-600">NON FACTURABLE</span>
          )}
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${report.status === 'submitted' ? 'bg-blue-100 text-blue-700' : report.status === 'validated' ? 'bg-emerald-100 text-emerald-700' : report.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            {report.status === 'submitted' ? 'À valider' : report.status === 'validated' ? '✓ Validé' : report.status === 'rejected' ? '⚠️ Rejeté' : report.status === 'draft' ? 'Brouillon' : report.status}
          </span>
        </div>
      </div>

      {/* Warning si non terminée */}
      {report.is_completed === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Intervention non terminée</p>
            <p className="text-sm text-amber-600">Le technicien a indiqué que l&apos;intervention n&apos;est pas terminée. Un retour sur place sera probablement nécessaire.</p>
          </div>
        </div>
      )}

      {/* PDF & Word Banner */}
      <div className="flex flex-col sm:flex-row gap-3">
        {report.pdf_url && (
          <div className="flex-1 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Rapport PDF</p>
                <p className="text-sm text-gray-500">Généré à la validation</p>
              </div>
            </div>
            <a
              href={report.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 py-2.5 px-5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all active:scale-[0.98] shadow-lg shadow-red-600/30"
            >
              <Download className="w-4 h-4" />
              PDF
            </a>
          </div>
        )}
        <div className={`${report.pdf_url ? '' : 'flex-1'} bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <FileDown className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Rapport Word</p>
              <p className="text-sm text-gray-500">Télécharger en .docx</p>
            </div>
          </div>
          <button
            onClick={handleDownloadDocx}
            disabled={isGeneratingDocx}
            className="flex items-center gap-2 py-2.5 px-5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-blue-600/30"
          >
            {isGeneratingDocx ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {isGeneratingDocx ? 'Génération...' : 'Word'}
          </button>
        </div>
      </div>

      {/* 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Intervention Info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" />Informations intervention</h2>
            <div className="space-y-4">
              {technician && (<div className="flex items-start gap-3"><User className="w-5 h-5 text-gray-400 mt-0.5" /><div><p className="text-sm text-gray-500">Technicien</p><p className="font-medium text-gray-900">{technician.first_name} {technician.last_name}</p>{technician.phone && (<a href={`tel:${technician.phone}`} className="text-sm text-blue-600">{technician.phone}</a>)}</div></div>)}
              {intervention?.regie && (<div className="flex items-start gap-3"><Building2 className="w-5 h-5 text-gray-400 mt-0.5" /><div><p className="text-sm text-gray-500">Régie</p><p className="font-medium text-gray-900">{intervention.regie.name}</p></div></div>)}
              {intervention?.address && (<div className="flex items-start gap-3"><MapPin className="w-5 h-5 text-gray-400 mt-0.5" /><div><p className="text-sm text-gray-500">Adresse</p><p className="font-medium text-gray-900">{intervention.address}</p></div></div>)}
              {clientInfo?.name && (<div className="flex items-start gap-3"><Phone className="w-5 h-5 text-gray-400 mt-0.5" /><div><p className="text-sm text-gray-500">Client</p><p className="font-medium text-gray-900">{clientInfo.name}</p>{clientInfo.phone && (<a href={`tel:${clientInfo.phone}`} className="text-sm text-blue-600">{clientInfo.phone}</a>)}</div></div>)}
              {intervention?.date_planned && (<div className="flex items-start gap-3"><Clock className="w-5 h-5 text-gray-400 mt-0.5" /><div><p className="text-sm text-gray-500">Date planifiée</p><p className="font-medium text-gray-900">{format(new Date(intervention.date_planned), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}</p></div></div>)}
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-600" />Description du travail</h2>
            <textarea
              value={editTextContent}
              onChange={(e) => setEditTextContent(e.target.value)}
              placeholder="Aucune description fournie"
              rows={5}
              className="w-full px-4 py-3 bg-blue-50/50 border-2 border-blue-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-y"
            />
          </div>

          {/* Fournitures (texte libre) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Package className="w-5 h-5 text-amber-600" />Fournitures utilisées</h2>
            <textarea
              value={editSuppliesText}
              onChange={(e) => setEditSuppliesText(e.target.value)}
              placeholder="Aucune fourniture notée"
              rows={4}
              className="w-full px-4 py-3 bg-blue-50/50 border-2 border-blue-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-y"
            />
            <p className="text-xs text-gray-400 mt-3">💡 Les prix des fournitures seront ajoutés lors de la facturation dans Bexio</p>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Photos Before */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-orange-500" />Photos avant ({allPhotosBefore.length})
            </h2>
            <PhotoGallery photos={allPhotosBefore} title="État initial / Problème constaté" emptyText="Aucune photo avant" />
          </div>

          {/* Photos After */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-emerald-500" />Photos après ({allPhotosAfter.length})
            </h2>
            <PhotoGallery photos={allPhotosAfter} title="Travail réalisé / Résultat final" emptyText="Aucune photo après" />
          </div>

          {/* Client Signature */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <PenTool className="w-5 h-5 text-indigo-600" />Signature du client
            </h2>
            {report.client_signature ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={report.client_signature} alt="Signature du client" className="w-full h-auto max-h-48 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                <PenTool className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 italic">Aucune signature</p>
              </div>
            )}
          </div>

          {/* Récapitulatif */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-600" />Récapitulatif</h2>
            <div className="space-y-4">
              {/* Durée */}
              <div className="flex items-center justify-between p-4 bg-blue-50/50 border-2 border-blue-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-gray-900">Temps de travail</p>
                    <p className="text-sm text-gray-500">{hourlyRate} CHF/heure</p>
                  </div>
                </div>
                <div className="text-right flex items-baseline gap-2">
                  <input
                    type="number"
                    min={0}
                    step={15}
                    value={editWorkDuration}
                    onChange={(e) => setEditWorkDuration(Number(e.target.value))}
                    className="w-20 text-right text-2xl font-bold text-gray-900 bg-white border-2 border-blue-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                  />
                  <span className="text-lg font-semibold text-gray-600">min</span>
                  <p className="text-sm text-gray-500 ml-2">≈ {((editWorkDuration / 60) * hourlyRate).toFixed(2)} CHF</p>
                </div>
              </div>

              {/* Terminée */}
              <div className={`p-4 rounded-xl ${report.is_completed !== false ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <div className="flex items-center gap-3">
                  {report.is_completed !== false ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-amber-500" />}
                  <p className={`font-medium ${report.is_completed !== false ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {report.is_completed !== false ? 'Intervention terminée' : 'Intervention non terminée'}
                  </p>
                </div>
              </div>

              {/* Facturable */}
              <div className={`p-4 rounded-xl ${report.is_billable ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <div className="flex items-start gap-3">
                  {report.is_billable ? <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />}
                  <div>
                    <p className={`font-medium ${report.is_billable ? 'text-emerald-800' : 'text-amber-800'}`}>{report.is_billable ? 'Intervention facturable' : 'Non facturable'}</p>
                    {!report.is_billable && report.billable_reason && (<p className="text-sm text-amber-600 mt-1">Raison : {report.billable_reason}</p>)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm lg:sticky lg:top-6">
            <h2 className="font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-3">
              <button onClick={handleValidate} disabled={isValidating || report.status === 'validated'}
                className={`w-full flex items-center justify-center gap-2 py-4 px-6 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg ${report.is_billable ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30' : 'bg-gray-600 hover:bg-gray-700 shadow-gray-600/30'}`}>
                {isValidating ? (<><Loader2 className="w-5 h-5 animate-spin" />Validation en cours...</>) : report.is_billable ? (<><CheckCircle className="w-5 h-5" />Valider &amp; Prêt pour facturation</>) : (<><Archive className="w-5 h-5" />Valider &amp; Archiver (non facturable)</>)}
              </button>
              <button onClick={() => setShowRejectModal(true)} disabled={isValidating || report.status === 'validated'}
                className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-white border-2 border-red-200 text-red-600 rounded-xl font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
                <MessageSquare className="w-5 h-5" />Demander des informations
              </button>
            </div>
            {report.status === 'validated' && (<p className="text-sm text-emerald-600 text-center mt-4">✓ Ce rapport a déjà été validé</p>)}
          </div>
        </div>
      </div>

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
          <button onClick={() => setSelectedPhoto(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-6 h-6 text-white" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedPhoto} alt="Photo agrandie" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
                <div><h3 className="font-semibold text-gray-900">Demander des informations</h3><p className="text-sm text-gray-500">Le technicien sera notifié</p></div>
              </div>
              <button onClick={() => setShowRejectModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Qu&apos;est-ce qui manque ou doit être corrigé ?</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ex: Merci d'ajouter des photos avant/après..." className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">Annuler</button>
              <button onClick={handleReject} disabled={isRejecting || !rejectReason.trim()} className="flex-1 py-2.5 px-4 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}