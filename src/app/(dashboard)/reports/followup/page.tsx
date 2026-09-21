'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { filterFollowup, followupDate, followupInputInstant, followupLabels, type ReportFollowupRow } from '@/lib/report-followup';

export default function ReportFollowupPage() {
  const [db] = useState(() => createClient());
  const [rows, setRows] = useState<ReportFollowupRow[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [technician, setTechnician] = useState(''), [state, setState] = useState('');
  const [newest, setNewest] = useState(false), [interval, setInterval] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [intervention, setIntervention] = useState(''), [reference, setReference] = useState(''), [due, setDue] = useState('');
  const lock = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, error } = await db.rpc('get_report_followup');
      if (error) throw new Error('Suivi inaccessible. Vérifiez votre session et vos droits, puis réessayez.');
      setRows(data as unknown as ReportFollowupRow[]);
    } catch (e) { setRows([]); setError(e instanceof Error ? e.message : 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [db]);
  useEffect(() => { void load(); }, [load]);
  async function act(action: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      const data = result.data as { result?: string; reason?: string } | null;
      setMessage(data?.result === 'excluded' ? data.reason || 'Rappel exclu.' : data?.result === 'created' ? 'Rappel interne créé.' : 'Obligation confirmée.');
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Action non confirmée. Rechargez avant de réessayer.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const tracked = rows.filter(r => r.state !== 'unconfirmed' && r.exclusion !== 'Intervention annulée');
  const excluded = rows.filter(r => !tracked.includes(r));
  const visible = filterFollowup(tracked, technician, state, newest);
  const technicians = Array.from(new Map(rows.filter(r => r.technician_id).map(r => [r.technician_id!, r.technician_name])).entries());
  const input = 'rounded-lg border border-gray-300 bg-white p-2 w-full';
  if (loading) return <p role="status">Chargement du suivi…</p>;
  if (error) return <div role="alert"><p>{error}</p><button onClick={load} className={input}>Réessayer</button></div>;
  return <section className="space-y-4">
    <h2 className="text-xl font-semibold">Suivi des rapports attendus</h2>
    <p className="text-sm text-gray-600">Automatisation non activée. Les dates sont affichées en Europe/Zurich. Une date prévisionnelle dépassée ne crée aucune obligation.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label>Technicien<select aria-label="Technicien" className={input} value={technician} onChange={e => setTechnician(e.target.value)}><option value="">Tous</option>{technicians.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>État<select aria-label="État" className={input} value={state} onChange={e => setState(e.target.value)}><option value="">Tous</option>{Object.entries(followupLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Tri<select aria-label="Tri" className={input} value={newest ? 'new' : 'old'} onChange={e => setNewest(e.target.value === 'new')}><option value="old">Plus anciens en premier</option><option value="new">Plus récents en premier</option></select></label>
    </div>
    <p role="status">{visible.length} intervention(s) affichée(s) · {visible.filter(r => !r.exclusion).length} en attente de remise ou correction</p>
    <label className="block max-w-lg">Intervalle minimal pour ce rappel manuel (minutes, à renseigner explicitement)
      <input aria-label="Intervalle minimal en minutes" className={input} type="number" min="1" step="1" value={interval} onChange={e => setInterval(e.target.value)} />
    </label>
    <p className="text-sm text-gray-600">Le délai choisi protège aussi les rappels suivants. Un nouveau clic nécessite une vue à jour. Aucun délai métier n’est prérempli.</p>
    {message && <p role="status" className="rounded-lg bg-blue-50 p-3">{message}</p>}
    {visible.length === 0 ? <p>Aucun élément pour ces filtres.</p> : <ul className="space-y-3">{visible.map(r => <li key={r.intervention_id} className="rounded-xl border bg-white p-4 space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{r.title}</h3><span>{followupLabels[r.state] || 'État à vérifier'}</span></div>
      <p>{r.technician_name || 'Responsable non défini'} · {r.intervention_type}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-3"><div><dt>Référence</dt><dd>{followupDate(r.reference_at)}</dd></div><div><dt>Échéance</dt><dd>{followupDate(r.due_at)}</dd></div><div><dt>Dernier rappel</dt><dd>{r.last_reminder_at ? followupDate(r.last_reminder_at) : 'Aucun'}</dd></div></dl>
      {r.exclusion && <p className="text-sm text-gray-600">{r.exclusion}</p>}
      <div className="flex flex-wrap gap-4 items-center">
        <Link className="text-blue-700 underline" href={r.report_id ? `/reports/validate/${r.report_id}` : r.intervention_type === 'chantier' ? `/chantiers/${r.intervention_id}` : `/calendar?intervention=${r.intervention_id}`}>{r.report_id ? 'Ouvrir le rapport exact' : 'Ouvrir l’intervention'}</Link>
        {!r.exclusion && <button className="rounded-lg bg-blue-700 text-white px-4 py-2 disabled:opacity-50" disabled={busy || !Number.isInteger(Number(interval)) || Number(interval) < 1} onClick={() => act(() => db.rpc('remind_report', { p_intervention: r.intervention_id, p_interval_seconds: Number(interval) * 60, p_expected: r.last_reminder_id }))}>Rappeler</button>}
        {r.state === 'unconfirmed' && r.exclusion !== 'Intervention annulée' && <button className="text-blue-700 underline" onClick={() => setIntervention(r.intervention_id)}>Préparer la confirmation</button>}
      </div>
    </li>)}</ul>}
    {excluded.length > 0 && <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer">Éléments exclus du suivi ({excluded.length})</summary>
      <ul className="mt-3 space-y-2">{excluded.map(r => <li key={r.intervention_id}>
        <span className="font-medium">{r.title}</span> — {r.exclusion}
        {r.state === 'unconfirmed' && r.exclusion !== 'Intervention annulée' && <button className="ml-3 text-blue-700 underline" onClick={() => setIntervention(r.intervention_id)}>Préparer la confirmation</button>}
      </li>)}</ul>
    </details>}
    <details className="rounded-xl border bg-white p-4" open={!!intervention}>
      <summary className="cursor-pointer font-semibold">Confirmer explicitement un rapport attendu</summary>
      <p className="my-2 text-sm">Une seule obligation commune à l’intervention, portée par son responsable principal. Confirmez uniquement une demande métier établie. Les rapports multiples restent à clarifier.</p>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act(() => db.rpc('confirm_report_expectation', { p_intervention: intervention, p_reference: followupInputInstant(reference), p_due: due ? followupInputInstant(due) : null })); }}>
        <label className="block">Intervention<select aria-label="Intervention" required className={input} value={intervention} onChange={e => setIntervention(e.target.value)}><option value="">Choisir une intervention</option>{rows.filter(r => !r.confirmed && r.report_count <= 1 && r.exclusion !== 'Intervention annulée').map(r => <option key={r.intervention_id} value={r.intervention_id}>{r.title} — {r.technician_name || 'Sans responsable'}</option>)}</select></label>
        <label className="block">Date de référence (heure de Zurich)<input type="datetime-local" required className={input} value={reference} onChange={e => setReference(e.target.value)} /></label>
        <label className="block">Échéance (heure de Zurich, facultative)<input type="datetime-local" className={input} value={due} onChange={e => setDue(e.target.value)} /></label>
        <button className="rounded-lg bg-blue-700 text-white px-4 py-2" disabled={busy}>Confirmer l’obligation commune</button>
      </form>
    </details>
  </section>;
}
