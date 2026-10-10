'use client';
import { useEffect, useMemo, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { validatePdf, emailPdfUrls, emailAttachmentName, uploadInterventionPdf, PDF_MAX_BYTES } from '@/lib/chantier-documents';

const endpointFor = (interventionId: string) => `/api/interventions/${encodeURIComponent(interventionId)}/documents`;

async function postJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result: { error?: string; document?: unknown } = await response.json().catch(() => ({}));
  if (!response.ok || !result.document) throw new Error(result.error || 'Enregistrement non confirmé.');
}

/**
 * PDFs chosen while creating an intervention. Nothing is uploaded before the
 * intervention exists: call `attach(id)` right after the insert succeeded.
 * PDFs of the source email are pre-selected (they can be unticked).
 */
export function usePdfAttachments(email?: { id: string; attachment_urls: string[] | null } | null) {
  const emailPdfs = useMemo(() => emailPdfUrls(email?.attachment_urls), [email?.attachment_urls]);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedEmailUrls, setSelectedEmailUrls] = useState<string[]>(emailPdfs);
  useEffect(() => { setSelectedEmailUrls(emailPdfs); }, [emailPdfs]);

  async function attach(interventionId: string) {
    const endpoint = endpointFor(interventionId);
    const failed: string[] = [];
    let saved = 0;
    for (const url of email ? selectedEmailUrls : []) {
      try {
        await postJson(`${endpoint}/from-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailId: email!.id, url, token: crypto.randomUUID() }) });
        saved++;
      } catch (e) { console.error('PDF email non rattaché', e); failed.push(emailAttachmentName(url)); }
    }
    for (const file of files) {
      try {
        await uploadInterventionPdf(createClient().storage, interventionId, file, crypto.randomUUID());
        saved++;
      } catch (e) { console.error('PDF non rattaché', e); failed.push(file.name); }
    }
    if (saved) toast.success(`${saved} PDF rattaché(s) à l'intervention`);
    if (failed.length) toast.error(`PDF non rattaché(s) : ${failed.join(', ')}. Ajoutez-les depuis la fiche de l'intervention.`, { duration: 12000 });
    return { saved, failed };
  }

  return { emailPdfs, files, setFiles, selectedEmailUrls, setSelectedEmailUrls, attach };
}

type PdfAttachments = ReturnType<typeof usePdfAttachments>;

export function PdfAttachmentPicker({ attachments, disabled }: { attachments: PdfAttachments; disabled?: boolean }) {
  const { emailPdfs, files, setFiles, selectedEmailUrls, setSelectedEmailUrls } = attachments;
  const [error, setError] = useState('');
  async function add(list: File[]) {
    const accepted: File[] = []; const rejected: string[] = [];
    for (const file of list) {
      try { await validatePdf(file); accepted.push(file); } catch (e) { rejected.push(`${file.name} : ${(e as Error).message}`); }
    }
    setFiles(current => [...current, ...accepted.filter(f => !current.some(c => c.name === f.name && c.size === f.size))]);
    setError(rejected.join(' · '));
  }
  const toggle = (url: string) => setSelectedEmailUrls(current =>
    current.includes(url) ? current.filter(u => u !== url) : [...current, url]);
  const total = files.length + selectedEmailUrls.length;

  return <div className="space-y-2 rounded-lg border border-gray-200 p-3">
    <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
      <Paperclip className="w-4 h-4" />PDF pour le technicien {total > 0 && <span className="text-gray-500">({total})</span>}
    </p>
    {emailPdfs.length > 0 && <ul className="space-y-1">{emailPdfs.map(url => <li key={url}>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" disabled={disabled} checked={selectedEmailUrls.includes(url)} onChange={() => toggle(url)} className="w-4 h-4 rounded border-gray-300" />
        <FileText className="w-3.5 h-3.5 text-red-500 flex-shrink-0" /><span className="truncate">{emailAttachmentName(url)}</span>
        <span className="text-xs text-gray-400 flex-shrink-0">(email)</span>
      </label>
    </li>)}</ul>}
    {files.length > 0 && <ul className="space-y-1">{files.map((file, i) => <li key={`${file.name}-${file.size}-${i}`} className="flex items-center gap-2 text-sm text-gray-700">
      <FileText className="w-3.5 h-3.5 text-red-500 flex-shrink-0" /><span className="truncate flex-1">{file.name}</span>
      <button type="button" disabled={disabled} aria-label={`Retirer ${file.name}`} onClick={() => setFiles(current => current.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
    </li>)}</ul>}
    <label className="block text-sm text-blue-700 cursor-pointer">
      + Ajouter un ou plusieurs PDF
      <input type="file" accept="application/pdf,.pdf" multiple disabled={disabled} className="sr-only" onChange={event => {
        const list = Array.from(event.target.files || []); event.target.value = '';
        if (list.length) void add(list);
      }} />
    </label>
    <p className="text-xs text-gray-400">Visibles par le technicien assigné · {PDF_MAX_BYTES / 1024 / 1024} Mio max par fichier</p>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </div>;
}
