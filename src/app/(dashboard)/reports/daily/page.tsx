'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { dailyInterventionLink, dailyStatusLabels, shiftDailyDate, zurichToday, type DailyActivity, type DailyFollowup } from '@/lib/daily-activity';
import { followupDate, followupLabels } from '@/lib/report-followup';

function dailyDateLabel(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? followupDate(value) : 'Non renseignée'; }

function ActionList({ rows }: { rows: DailyFollowup[] }) {
  return <ul className="space-y-2">{rows.map(r => <li key={r.intervention_id} className="rounded-lg border bg-white p-3">
    <Link className="font-medium text-blue-700 underline" href={r.report_count === 1 && r.report_id ? `/reports/validate/${r.report_id}` : dailyInterventionLink({ id: r.intervention_id, intervention_type: r.intervention_type })}>{r.title}</Link>
    <p className="text-sm">{r.technician_name || 'Sans responsable'} · {followupLabels[r.state] || 'À vérifier'}</p>
  </li>)}</ul>;
}
export default function DailyActivityPage() {
  const [date, setDate] = useState(() => zurichToday());
  const [technician, setTechnician] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<DailyActivity | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    async function load() {
      try {
        const params = new URLSearchParams({ date, technician });
        const response = await fetch(`/api/reports/daily?${params}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Chargement impossible.');
        if (!controller.signal.aborted) setData(body);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Chargement impossible.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [date, technician, refresh]);
  const input = 'rounded-lg border border-gray-300 bg-white px-3 py-2';
  function move(days: number) { try { setDate(shiftDailyDate(date, days)); } catch { setError('Choisissez une date valide.'); } }
  return <section className="space-y-5 pb-8" aria-busy={loading}>
    <header><h2 className="text-xl font-semibold">Bilan journalier</h2><p className="mt-1 text-sm text-gray-600">Calculé à la consultation. Journée en Europe/Zurich ; planification, affectations et statuts affichés dans leur état actuel.</p></header>
    <div className="flex flex-wrap items-end gap-3">
      <button className={input} aria-label="Jour précédent" onClick={() => move(-1)}>←</button>
      <label className="flex flex-col gap-1">Journée<input aria-label="Journée" className={input} type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <button className={input} aria-label="Jour suivant" onClick={() => move(1)}>→</button>
      <button className={input} onClick={() => setDate(zurichToday())}>Aujourd’hui</button>
      <label className="flex flex-col gap-1">Technicien<select aria-label="Technicien" className={`${input} max-w-full`} value={technician} onChange={e => setTechnician(e.target.value)} disabled={loading}>
        <option value="">Tous les techniciens</option>
        {data?.technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>
      <button className={input} disabled={loading} onClick={() => setRefresh(v => v + 1)}>Actualiser</button>
    </div>
    <p className="text-sm text-gray-600">Le filtre porte sur le responsable actuellement affecté. L’auteur de chaque rapport est indiqué séparément ; aucune équipe ni affectation passée n’est reconstituée.</p>
    {loading ? <p role="status">Chargement du bilan…</p> : error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800"><p>{error}</p><button className={`${input} mt-3`} onClick={() => setRefresh(v => v + 1)}>Réessayer</button></div> : data && <>
      <p className="text-sm text-gray-600">Dernière actualisation : {dailyDateLabel(data.refreshedAt)}. Vue recalculée avec les données disponibles maintenant, sans état figé à la fin de cette journée.</p>
      <section aria-label="Synthèse de la journée" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Planifiées, hors annulations', data.counts.planned, 'Début dans la journée ou chevauchement avec une fin explicite.'],
          ['Fins datées pour ce jour', data.counts.completed, 'Date de fin renseignée et statut actuel terminé ou facturé.'],
          ['Rapports créés ce jour', data.counts.reportsCreated, 'Création d’un rapport, y compris un brouillon.'],
          ['Rapports envoyés ce jour', 'Indisponible', 'La date d’envoi n’est pas enregistrée de façon exploitable.']].map(([label, count, help]) => <div key={label} className="rounded-xl border bg-white p-4"><h3 className="text-sm text-gray-600">{label}</h3><p className="my-2 text-2xl font-semibold">{count}</p><p className="text-xs text-gray-600">{help}</p></div>)}
      </section>
      {data.counts.missingCompletionDates > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm">{data.counts.missingCompletionDates} intervention(s) de cette sélection ont un statut terminé mais pas de date de fin : leur réalisation ne peut pas être attribuée à un jour.</p>}
      {data.entries.length === 0 ? <p className="rounded-xl border bg-white p-5">Aucune intervention planifiée ni activité datée enregistrée pour cette journée et ce filtre. Les envois de rapports sans date ne peuvent pas être dénombrés.</p> : <>
        <section className="space-y-3"><h3 className="font-semibold">Détail des interventions ({data.entries.length})</h3>
          <p className="text-sm text-gray-600">Une intervention multijour apparaît si sa période planifiée chevauche la journée, une seule fois. Sans fin renseignée, seule la journée de début est retenue. Les horaires ci-dessous sont prévisionnels.</p>
          <ul className="space-y-3">{data.entries.map(i => <li key={i.id} className={`rounded-xl border p-4 ${i.cancelled ? 'bg-gray-100' : 'bg-white'}`}>
            <div className="flex flex-wrap justify-between gap-2"><Link href={dailyInterventionLink(i)} className="font-semibold text-blue-700 underline">{i.title}</Link><span>{i.work_order_number ? `Réf. ${i.work_order_number}` : 'Référence non renseignée'}</span></div>
            <p className="mt-2">{i.technician_name} · État actuel : {dailyStatusLabels[i.status || ''] || 'Non renseigné'}</p>
            {i.cancelled && <p className="text-sm font-medium">Intervention annulée — exclue des totaux de planification et de réalisation.</p>}
            <dl className="my-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">Horaires planifiés</dt><dd>{i.date_planned ? dailyDateLabel(i.date_planned) : 'Début non renseigné'} → {i.date_end ? dailyDateLabel(i.date_end) : 'Fin non renseignée'}</dd></div>
              <div><dt className="text-gray-500">Date de fin actuellement renseignée</dt><dd>{i.date_completed ? dailyDateLabel(i.date_completed) : 'Non renseignée — réalisation non datable'}</dd></div>
            </dl>
            <p className="text-sm">Rapport — état actuel : {i.followup ? followupLabels[i.followup.state] || 'À vérifier' : 'Obligation non définie'}</p>
            {i.followup?.exclusion && <p className="text-sm text-gray-600">Suivi : {i.followup.exclusion}</p>}
            {i.reports.length > 0 && <ul className="mt-2 space-y-2">{i.reports.map(r => <li key={r.id} className="text-sm"><Link href={`/reports/validate/${r.id}`} className="text-blue-700 underline">Ouvrir le rapport</Link> · {r.author_name} · Créé : {dailyDateLabel(r.created_at)}{r.createdOnDay ? ' (journée sélectionnée)' : ''}</li>)}</ul>}
          </li>)}</ul>
        </section>
        <section className="space-y-3"><h3 className="font-semibold">Détail par responsable actuel</h3><ul className="grid gap-3 sm:grid-cols-2">{data.technicianSummary.map(t => <li key={t.id || 'unassigned'} className="rounded-xl border bg-white p-4"><p className="font-medium">{t.name}</p><p className="text-sm">{t.planned} planifiée(s) · {t.completed} fin(s) datée(s) · {t.reportsCreated} rapport(s) créé(s)</p></li>)}</ul></section>
      </>}
      <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h3 className="font-semibold">Points à traiter — situation actuelle</h3>
        <p className="text-sm">Couverture partielle : les absences concernent uniquement les obligations confirmées dans le suivi 3A. Les brouillons et corrections déjà ouverts sont également suivis. Aucun taux de conformité global ne peut être déduit.</p>
        <h4 className="font-medium">Liés aux interventions de la journée ({data.dayActions.length})</h4>
        {data.dayActions.length ? <ActionList rows={data.dayActions} /> : <p className="text-sm">Aucun point actif parmi les obligations suivies liées à cette journée.</p>}
        <details><summary className="cursor-pointer font-medium">Arriéré actuellement ouvert hors de cette journée ({data.backlog.length})</summary>
          <p className="my-2 text-sm">Toutes dates confondues, au moment de la consultation. Ce n’est pas l’arriéré qui existait à la fin de la journée sélectionnée.</p>
          {data.backlog.length ? <ActionList rows={data.backlog} /> : <p className="text-sm">Aucun autre point actif parmi les obligations suivies.</p>}
        </details>
        <Link className="inline-block text-blue-700 underline" href="/reports/followup">Ouvrir le suivi des rapports</Link>
      </section>
    </>}
  </section>;
}
