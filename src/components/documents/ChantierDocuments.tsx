'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { validatePdf } from '@/lib/chantier-documents';

type Document = { key: string; name: string };
type Pending = { file: File; token: string; error?: string };
export function ChantierDocuments({ interventionId }: { interventionId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('Chargement des PDF…');
  const endpoint = `/api/interventions/${encodeURIComponent(interventionId)}/documents`;
  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDocuments(result.documents); setCanManage(result.canManage); setMessage('');
    } catch { setMessage('Impossible de charger les PDF. Réessayez.'); }
  }, [endpoint]);
  useEffect(() => { void load(); }, [load]); // keyed by intervention at call sites
  async function upload(items: Pending[]) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    const failed: Pending[] = [];
    let saved = 0;
    for (const item of items) {
      setMessage(`Envoi de ${item.file.name}…`);
      try {
        await validatePdf(item.file);
        const body = new FormData(); body.set('file', item.file); body.set('token', item.token);
        const response = await fetch(endpoint, { method: 'POST', body });
        const result = await response.json();
        if (!response.ok || !result.document) throw new Error(result.error || 'Enregistrement non confirmé.');
        setDocuments(current => [...current.filter(d => d.key !== result.document.key), result.document]);
        saved++;
      } catch (e) { failed.push({ ...item, error: e instanceof Error ? e.message : 'Envoi impossible.' }); }
    }
    setPending(failed);
    setMessage(`${saved} PDF enregistré(s) et rattaché(s). ${failed.length ? `${failed.length} envoi(s) à reprendre.` : ''}`);
    lock.current = false; setBusy(false);
  }
  async function remove(document: Document) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const response = await fetch(`${endpoint}?key=${encodeURIComponent(document.key)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setDocuments(current => current.filter(d => d.key !== document.key));
      setMessage('PDF supprimé.');
    } catch { setMessage('Suppression impossible. Le PDF reste dans la liste.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section aria-label="Documents du chantier" className="space-y-3 rounded-xl border bg-white p-4">
    <h2 className="font-semibold">Documents PDF du chantier</h2>
    <p className="text-sm text-gray-500">PDF privés · 20 Mio maximum par fichier</p>
    <p role="status" className="text-sm">{message}</p>
    <button type="button" disabled={busy} onClick={load} className="text-blue-700 underline">Actualiser les documents</button>
    {!documents.length && !message && <p>Aucun PDF.</p>}
    <ul className="space-y-2">{documents.map(document => <li key={document.key} className="flex items-center gap-3">
      <a className="break-all text-blue-700 underline" href={`${endpoint}?key=${encodeURIComponent(document.key)}`} target="_blank" rel="noopener noreferrer">{document.name}</a>
      {canManage && <button type="button" disabled={busy} aria-label={`Supprimer ${document.name}`} onClick={() => remove(document)} className="text-red-700">Supprimer</button>}
    </li>)}</ul>
    {canManage && <label className="block text-sm">Ajouter un ou plusieurs PDF
      <input type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={event => {
        const files = Array.from(event.target.files || []); event.target.value = '';
        if (files.length) void upload([...pending, ...files.map(file => ({ file, token: crypto.randomUUID() }))]);
      }} className="block w-full mt-2" />
    </label>}
    {pending.length > 0 && <div role="alert"><ul>{pending.map(item => <li key={item.token}>
      {item.file.name} : {item.error} <button type="button" disabled={busy} onClick={() => setPending(p => p.filter(i => i.token !== item.token))}>Retirer de la sélection</button>
    </li>)}</ul><button type="button" disabled={busy} onClick={() => upload(pending)}>Réessayer les envois restants</button></div>}
  </section>;
}
