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
  Phone, FileText, Mic, Play, Pause, Image as ImageIcon, Package,
  CreditCard, Loader2, AlertTriangle, CheckCircle2, MessageSquare,
  X, ZoomIn, Archive, PenTool, Download,
} from 'lucide-react';

interface Report {
  id: string;
  intervention_id: string;
  technician_id: string;
  text_content: string | null;
  vocal_url: string | null;
  vocal_transcription: string | null;
  photos: (string | { url: string; caption?: string; category?: string })[];
  checklist: { item: string; done: boolean }[];
  is_billable: boolean;
  billable_reason: string | null;
  work_duration_minutes: number | null;
  materials_used: { product_id?: string; name: string; quantity: number; unit_price: number }[];
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
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

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
      setReport(data as Report);
      setIsLoading(false);
    };
    fetchReport();
  }, [reportId, router, supabase]);

  useEffect(() => {
    return () => { if (audioElement) audioElement.pause(); };
  }, [audioElement]);

  const handleValidate = async () => {
    if (!report) return;
    setIsValidating(true);
    try {
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
        .from('reports').update({ status: 'rejected', billable_reason: rejectReason }).eq('id', report.id);
      if (error) throw error;
      toast.success('Rapport renvoyé au technicien');
      setShowRejectModal(false);
      router.push('/reports/validate');
      router.refresh();
    } catch (error) {
      console.error('Rejection error:', error);
      toast.error('Erreur lors du rejet');
    } finally {
      setIsRejecting(false);
    }
  };

  const toggleAudio = () => {
    if (!report?.vocal_url) return;
    if (!audioElement) {
      const audio = new Audio(report.vocal_url);
      audio.onended = () => setIsPlayingAudio(false);
      setAudioElement(audio);
      audio.play();
      setIsPlayingAudio(true);
    } else if (isPlayingAudio) {
      audioElement.pause();
      setIsPlayingAudio(false);
    } else {
      audioElement.play();
      setIsPlayingAudio(true);
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

  const checklist = report.checklist || [];
  const materials = report.materials_used || [];
  const completedChecks = checklist.filter(c => c.done).length;
  const totalMaterialsCost = materials.reduce((sum, m) => sum + m.quantity * m.unit_price, 0);
  const hourlyRate = 110;
  const laborCost = report.work_duration_minutes ? (report.work_duration_minutes / 60) * hourlyRate : 0;
  const totalEstimate = laborCost + totalMaterialsCost;

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
          {!report.is_billable && (<span className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-200 text-gray-600">NON FACTURABLE</span>)}
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${report.status === 'submitted' ? 'bg-blue-100 text-blue-700' : report.status === 'validated' ? 'bg-emerald-100 text-emerald-700' : report.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            {report.status === 'submitted' ? 'À valider' : report.status === 'validated' ? '✓ Validé' : report.status === 'rejected' ? '⚠️ Rejeté' : report.status === 'draft' ? 'Brouillon' : report.status}
          </span>
        </div>
      </div>

      {/* PDF Banner - visible en haut si PDF dispo */}
      {report.pdf_url && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Rapport PDF disponible</p>
              <p className="text-sm text-gray-500">Généré automatiquement à la validation</p>
            </div>
          </div>
          <a
            href={report.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 py-2.5 px-5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all active:scale-[0.98] shadow-lg shadow-red-600/30"
          >
            <Download className="w-4 h-4" />
            Télécharger PDF
          </a>
        </div>
      )}

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

          {/* Checklist */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" />Points de contrôle</span>
              <span className="text-sm font-normal text-gray-500">{completedChecks}/{checklist.length} validés</span>
            </h2>
            <div className="space-y-2">
              {checklist.map((item, index) => (
                <div key={index} className={`flex items-center gap-3 p-3 rounded-lg ${item.done ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                  {item.done ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-gray-300" />}
                  <span className={item.done ? 'text-emerald-800' : 'text-gray-500'}>{item.item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-600" />Description du travail</h2>
            {report.vocal_url && (
              <div className="mb-4 p-4 bg-blue-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <button onClick={toggleAudio} className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors">
                    {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                  </button>
                  <div className="flex-1"><p className="font-medium text-blue-900">Enregistrement vocal</p><p className="text-sm text-blue-600">Cliquez pour écouter</p></div>
                  <Mic className="w-5 h-5 text-blue-400" />
                </div>
                {report.vocal_transcription && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <p className="text-xs text-blue-600 font-medium mb-1">Transcription :</p>
                    <p className="text-sm text-blue-800">{report.vocal_transcription}</p>
                  </div>
                )}
              </div>
            )}
            {report.text_content ? (
              <div className="p-4 bg-gray-50 rounded-xl"><p className="text-gray-700 whitespace-pre-wrap">{report.text_content}</p></div>
            ) : !report.vocal_url && (<p className="text-gray-400 italic">Aucune description fournie</p>)}
          </div>

          {/* Materials */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Package className="w-5 h-5 text-amber-600" />Matériaux utilisés</h2>
            {materials.length > 0 ? (
              <div className="space-y-2">
                {materials.map((material, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div><p className="font-medium text-gray-900">{material.name}</p><p className="text-sm text-gray-500">{material.unit_price.toFixed(2)} CHF × {material.quantity}</p></div>
                    <p className="font-semibold text-gray-900">{(material.unit_price * material.quantity).toFixed(2)} CHF</p>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg mt-3">
                  <p className="font-medium text-amber-800">Total matériaux</p>
                  <p className="font-bold text-amber-800">{totalMaterialsCost.toFixed(2)} CHF</p>
                </div>
              </div>
            ) : (<p className="text-gray-400 italic">Aucun matériau utilisé</p>)}
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

          {/* Billing Summary */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-600" />Récapitulatif facturation</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3"><Clock className="w-5 h-5 text-gray-400" /><div><p className="font-medium text-gray-900">Temps de travail</p><p className="text-sm text-gray-500">{hourlyRate} CHF/heure</p></div></div>
                <div className="text-right"><p className="text-2xl font-bold text-gray-900">{report.work_duration_minutes || 0} min</p><p className="text-sm text-gray-500">≈ {laborCost.toFixed(2)} CHF</p></div>
              </div>
              <div className={`p-4 rounded-xl ${report.is_billable ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <div className="flex items-start gap-3">
                  {report.is_billable ? <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />}
                  <div>
                    <p className={`font-medium ${report.is_billable ? 'text-emerald-800' : 'text-amber-800'}`}>{report.is_billable ? 'Intervention facturable' : 'Non facturable'}</p>
                    {!report.is_billable && report.billable_reason && (<p className="text-sm text-amber-600 mt-1">Raison : {report.billable_reason}</p>)}
                  </div>
                </div>
              </div>
              <div className="p-4 bg-blue-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-blue-800">Estimation totale</p>
                  <p className="text-2xl font-bold text-blue-800">{totalEstimate.toFixed(2)} CHF</p>
                </div>
                <p className="text-xs text-blue-600 mt-1">Main d&apos;œuvre ({laborCost.toFixed(2)}) + Matériaux ({totalMaterialsCost.toFixed(2)})</p>
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
                <AlertTriangle className="w-5 h-5" />Demander des précisions
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
                <div><h3 className="font-semibold text-gray-900">Demander des précisions</h3><p className="text-sm text-gray-500">Le technicien sera notifié</p></div>
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