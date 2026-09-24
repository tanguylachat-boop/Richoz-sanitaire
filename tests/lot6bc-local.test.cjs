// LOTS 6B/6C — brouillon de paie : fenêtre 26→25, idempotence, clôture,
// régularisation. Supabase local, données fictives 2037.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const config = JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS, 'utf8'));
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = crypto.randomUUID();
const actors = {};
const ok = (r) => { assert.equal(r.error, null, r.error?.message); return r.data; };
const fails = (r, pattern) => { assert.notEqual(r.error, null, 'action censée être refusée'); if (pattern) assert.match(r.error.message, pattern); };

async function login(credentials) {
  const db = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await db.auth.signInWithPassword(credentials));
  return db;
}

// Un seul technicien actif fictif dédié : on filtre toutes les assertions sur lui.
let inWindow26, inWindow25, outBefore, outAfter;
const draftsFor = async (techId) => ok(await actors.secretary.db.from('payroll_drafts')
  .select('*, lines:payroll_draft_lines(*)').eq('technician_id', techId)
  .order('version'));

before(async () => {
  for (const [name, role] of [['secretary', 'secretary'], ['tech', 'technician'], ['viewer', 'technician']]) {
    const credentials = { email: `lot6bc-${name}-${run}@example.invalid`, password: 'Local-Fictif-Lot6BC-2026!' };
    const { user } = ok(await service.auth.admin.createUser({ ...credentials, email_confirm: true }));
    ok(await service.from('users').insert({ id: user.id, email: credentials.email, role, is_active: true, first_name: 'Fictif 6BC', last_name: name }));
    actors[name] = { id: user.id, db: await login(credentials), credentials };
  }
  const mk = async (date, extra = {}) => ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'heures_sup', item_date: date, minutes: 60,
    status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
    created_by: actors.secretary.id, ...extra,
  }).select().single());
  // Fenêtre attendue pour référence 2037-03-25 : 2037-02-26 → 2037-03-25 inclus
  inWindow26 = await mk('2037-02-26');
  inWindow25 = await mk('2037-03-25');
  outBefore = await mk('2037-02-25'); // appartient à la période précédente
  outAfter = await mk('2037-03-26'); // appartient à la période suivante
});

after(() => Object.values(actors).forEach((a) => a.db.auth.stopAutoRefresh()));

test('simulation : aucune écriture, périmètre annoncé', async () => {
  const summary = ok(await actors.secretary.db.rpc('generate_payroll_drafts', { p_reference: '2037-03-25', p_dry: true }));
  assert.equal(summary.dry, true);
  assert.equal(summary.period_start, '2037-02-26');
  assert.equal(summary.period_end, '2037-03-25');
  assert.ok(summary.would_process >= 1);
  const drafts = await draftsFor(actors.tech.id);
  assert.equal(drafts.length, 0);
});

test('génération réelle : frontière 25/26 exacte, salaire de base « à configurer », sources détaillées', async () => {
  const summary = ok(await actors.secretary.db.rpc('generate_payroll_drafts', { p_reference: '2037-03-25', p_dry: false }));
  assert.equal(summary.dry, false);
  assert.ok(summary.drafts_created >= 1);

  const drafts = await draftsFor(actors.tech.id);
  assert.equal(drafts.length, 1);
  const draft = drafts[0];
  assert.equal(draft.status, 'draft');
  assert.equal(draft.period_start, '2037-02-26');
  assert.equal(draft.period_end, '2037-03-25');

  const itemIds = draft.lines.filter((l) => l.salary_item_id).map((l) => l.salary_item_id);
  assert.ok(itemIds.includes(inWindow26.id)); // le 26 du mois précédent : dedans
  assert.ok(itemIds.includes(inWindow25.id)); // le 25 courant : dedans
  assert.ok(!itemIds.includes(outBefore.id)); // le 25 précédent : dehors
  assert.ok(!itemIds.includes(outAfter.id)); // le 26 courant : dehors

  const base = draft.lines.find((l) => l.line_type === 'salaire_base');
  assert.equal(base.amount_state, 'requires_rule');
  assert.equal(base.amount_chf, null); // jamais un faux zéro
  const hs = draft.lines.find((l) => l.salary_item_id === inWindow26.id);
  assert.equal(hs.amount_state, 'requires_rule'); // taux non validé
  assert.equal(hs.source_snapshot.minutes, 60); // source justifiée
});

test('idempotence : réexécution sans doublon ; événement tardif du 25 repris au rafraîchissement', async () => {
  const late = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'amende_parc', item_date: '2037-03-25', amount_chf: 40,
    status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
    created_by: actors.secretary.id,
  }).select().single());

  ok(await actors.secretary.db.rpc('generate_payroll_drafts', { p_reference: '2037-03-25', p_dry: false }));
  ok(await actors.secretary.db.rpc('generate_payroll_drafts', { p_reference: '2037-03-25', p_dry: false }));

  const drafts = await draftsFor(actors.tech.id);
  assert.equal(drafts.length, 1); // toujours une seule fiche v1
  const lines = drafts[0].lines;
  assert.equal(lines.filter((l) => l.line_type === 'salaire_base').length, 1);
  assert.equal(lines.filter((l) => l.salary_item_id === late.id).length, 1); // repris, sans doublon
});

test('clôture refusée tant que des lignes « à configurer » subsistent', async () => {
  const [draft] = await draftsFor(actors.tech.id);
  fails(await actors.secretary.db.from('payroll_drafts').update({
    status: 'validated', validated_by: actors.secretary.id,
  }).eq('id', draft.id), /VALIDATION_INCOMPLETE/);
});

test('clôture après résolution simulée : éléments figés ; correction ultérieure = régularisation explicite', async () => {
  const [draft] = await draftsFor(actors.tech.id);
  // Simulation « règles configurées » : montants posés par la clé service
  // (représente la future configuration validée par le client/la fiduciaire).
  ok(await service.from('payroll_draft_lines').update({ amount_state: 'amount_set', amount_chf: 0.01 })
    .eq('draft_id', draft.id).eq('amount_state', 'requires_rule'));

  ok(await actors.secretary.db.from('payroll_drafts').update({
    status: 'validated', validated_by: actors.secretary.id,
  }).eq('id', draft.id));

  const included = ok(await service.from('salary_items').select('id, payroll_status, payroll_reference')
    .in('id', [inWindow26.id, inWindow25.id]));
  assert.ok(included.every((i) => i.payroll_status === 'included' && i.payroll_reference === draft.id));

  // Fiche figée : lignes et fiche non modifiables, suppression refusée
  fails(await actors.secretary.db.from('payroll_draft_lines').update({ amount_chf: 99 }).eq('draft_id', draft.id), /PAIE_FIGEE/);
  fails(await actors.secretary.db.from('payroll_drafts').delete().eq('id', draft.id), /PAIE_FIGEE/);
  // L'élément salarial intégré est figé aussi (00031)
  fails(await actors.secretary.db.from('salary_items').update({ minutes: 90 }).eq('id', inWindow26.id), /PAIE_FIGEE/);

  // Nouvel élément approuvé dans la période APRÈS clôture → régularisation v2
  const lateFix = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'retard', item_date: '2037-03-10',
    expected_time: '08:00', actual_time: '08:15',
    status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
    created_by: actors.secretary.id,
  }).select().single());
  ok(await actors.secretary.db.rpc('generate_payroll_drafts', { p_reference: '2037-03-25', p_dry: false }));

  const drafts = await draftsFor(actors.tech.id);
  assert.equal(drafts.length, 2);
  const regul = drafts.find((d) => d.version === 2);
  assert.equal(regul.is_regularization, true);
  assert.equal(regul.status, 'draft');
  assert.ok(regul.lines.some((l) => l.salary_item_id === lateFix.id));
  assert.ok(!regul.lines.some((l) => l.line_type === 'salaire_base')); // pas de double salaire de base
  // La v1 validée est restée intacte
  assert.equal(drafts.find((d) => d.version === 1).status, 'validated');
});

test('droits : un technicien ne voit ni ne génère les brouillons de paie', async () => {
  const seen = ok(await actors.viewer.db.from('payroll_drafts').select('id'));
  assert.equal(seen.length, 0);
  const seenLines = ok(await actors.viewer.db.from('payroll_draft_lines').select('id'));
  assert.equal(seenLines.length, 0);
  fails(await actors.viewer.db.rpc('generate_payroll_drafts', { p_reference: '2037-03-25', p_dry: true }), /ACCES_REFUSE/);
});

test('changement de mois/année : référence 2037-01-25 → fenêtre 2036-12-26 → 2037-01-25', async () => {
  const summary = ok(await actors.secretary.db.rpc('generate_payroll_drafts', { p_reference: '2037-01-25', p_dry: true }));
  assert.equal(summary.period_start, '2036-12-26');
  assert.equal(summary.period_end, '2037-01-25');
});
