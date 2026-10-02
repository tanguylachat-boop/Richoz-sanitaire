// LOT A (impôt à la source + 13e dans le brut + modèle) & LOT B (fériés/ponts).
// Supabase local, données fictives 2038. Vérifie que les ajouts sont STRICTEMENT
// additifs : IS = ligne cotisation existante, 13e inclus au brut déterminant,
// override IS préservé, modèle seedé ; et la chaîne pont non payé → congé
// sans_solde → autosync → retenue de paie (systèmes existants, non modifiés).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const config = JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS, 'utf8'));
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = crypto.randomUUID();
const ok = (r) => { assert.equal(r.error, null, r.error?.message); return r.data; };
const fails = (r, pattern) => { assert.notEqual(r.error, null, 'action censée être refusée'); if (pattern) assert.match(r.error.message, pattern); };
const num = (v) => (v == null ? null : Number(v));

const actors = {};
async function login(credentials) {
  const db = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await db.auth.signInWithPassword(credentials));
  return db;
}
async function makeUser(name, role) {
  const credentials = { email: `lotab-${name}-${run}@example.invalid`, password: 'Local-Fictif-LotAB-2026!' };
  const { user } = ok(await service.auth.admin.createUser({ ...credentials, email_confirm: true }));
  ok(await service.from('users').insert({ id: user.id, email: credentials.email, role, is_active: true, first_name: 'FictifAB', last_name: name }));
  actors[name] = { id: user.id, db: await login(credentials), credentials };
  return actors[name];
}

const draftFor = async (techId, periodEnd) => {
  const rows = ok(await actors.sec.db.from('payroll_drafts')
    .select('*, lines:payroll_draft_lines(*)')
    .eq('technician_id', techId).eq('period_end', periodEnd).order('version', { ascending: false }));
  return rows[0];
};
const line = (draft, type) => draft.lines.find((l) => l.line_type === type);
const linesOf = (draft, type) => draft.lines.filter((l) => l.line_type === type);
const gen = (ref) => actors.sec.db.rpc('generate_payroll_drafts', { p_reference: ref, p_dry: false });
const addComponent = async (configId, patch) => ok(await actors.sec.db.from('salary_config_component').insert({ config_id: configId, ...patch }).select().single());

before(async () => {
  // Idempotence : les tests fériés/ponts utilisent des dates fixes (2038). On purge
  // d'éventuelles lignes d'un run précédent (l'unicité férié/date les refuserait).
  await service.from('public_holidays').delete().gte('holiday_date', '2038-05-01').lte('holiday_date', '2038-06-30');
  await makeUser('sec', 'secretary');
  await makeUser('is', 'technician');      // impôt à la source
  await makeUser('t13', 'technician');     // 13e inclus au brut
  await makeUser('isovr', 'technician');   // override IS
  await makeUser('pont', 'technician');    // pont non payé
});
after(() => Object.values(actors).forEach((a) => a.db.auth.stopAutoRefresh()));

// ─── LOT A ──────────────────────────────────────────────────────────────────

test('IS : retenue = taux × brut, ligne cotisation, net réduit', async () => {
  ok(await actors.sec.db.from('employee_salary_config').insert({
    technician_id: actors.is.id, pay_type: 'monthly', monthly_base_chf: 5000, hourly_rate_chf: 50,
    is_source_tax: true, source_tax_rate: 10, effective_from: '2030-01-01', created_by: actors.sec.id,
  }));
  ok(await gen('2038-04-25'));
  const d = await draftFor(actors.is.id, '2038-04-25');
  const is = linesOf(d, 'cotisation').find((l) => /impôt à la source/i.test(l.label));
  assert.ok(is, 'ligne impôt à la source présente');
  assert.equal(num(is.amount_chf), 500);       // 10% de 5000
  assert.equal(is.component_id, null);          // pas un composant → clé override 'cotisation'
  assert.equal(num(d.net_chf), 4500);           // 5000 − 500
});

test('IS honnêteté : soumis sans taux refusé', async () => {
  fails(await actors.sec.db.from('employee_salary_config').insert({
    technician_id: actors.is.id, pay_type: 'monthly', monthly_base_chf: 1, hourly_rate_chf: 1,
    is_source_tax: true, source_tax_rate: null, effective_from: '2031-01-01', created_by: actors.sec.id,
  }));
});

test('13e « dans le brut » : cotisations ET IS calculés sur base + 13e', async () => {
  const cfg = ok(await actors.sec.db.from('employee_salary_config').insert({
    technician_id: actors.t13.id, pay_type: 'monthly', monthly_base_chf: 6000, hourly_rate_chf: 60,
    is_source_tax: true, source_tax_rate: 10, effective_from: '2030-01-01', created_by: actors.sec.id,
  }).select().single());
  // 13e mensualisé = addition fixe 500, MARQUÉE incluse au brut déterminant.
  await addComponent(cfg.id, { label: '13e salaire', direction: 'addition', basis: 'fixed', amount_chf: 500, included_in_gross: true, sort_order: 1 });
  // Cotisation AVS-like 5% : doit tomber sur 6500 (base + 13e), pas 6000.
  await addComponent(cfg.id, { label: 'AVS', direction: 'deduction', basis: 'pct_gross', pct: 5, sort_order: 2 });

  ok(await gen('2038-04-25'));
  const d = await draftFor(actors.t13.id, '2038-04-25');
  const avs = linesOf(d, 'cotisation').find((l) => l.label === 'AVS');
  const is = linesOf(d, 'cotisation').find((l) => /impôt à la source/i.test(l.label));
  assert.equal(num(line(d, 'ajout').amount_chf), 500);
  assert.equal(num(avs.amount_chf), 325);   // 5% de 6500 (et non 300 sur 6000)
  assert.equal(num(is.amount_chf), 650);    // 10% de 6500
  assert.equal(num(d.net_chf), 6000 + 500 - 325 - 650); // 5525
});

test('IS : override préservé au rafraîchissement (clé cotisation)', async () => {
  ok(await actors.sec.db.from('employee_salary_config').insert({
    technician_id: actors.isovr.id, pay_type: 'monthly', monthly_base_chf: 4000, hourly_rate_chf: 40,
    is_source_tax: true, source_tax_rate: 8, effective_from: '2030-01-01', created_by: actors.sec.id,
  }));
  ok(await gen('2038-05-25'));
  let d = await draftFor(actors.isovr.id, '2038-05-25');
  let is = linesOf(d, 'cotisation').find((l) => /impôt à la source/i.test(l.label));
  assert.equal(num(is.amount_chf), 320); // 8% de 4000
  ok(await actors.sec.db.from('payroll_draft_lines').update({ amount_chf: 300, amount_state: 'amount_set', overridden: true }).eq('id', is.id));
  ok(await gen('2038-05-25')); // rafraîchissement : ne doit pas écraser l'override IS
  d = await draftFor(actors.isovr.id, '2038-05-25');
  is = linesOf(d, 'cotisation').find((l) => /impôt à la source/i.test(l.label));
  assert.equal(is.overridden, true);
  assert.equal(num(is.amount_chf), 300);
});

test('modèle de cotisations : seedé (6 lignes réelles, éditables)', async () => {
  const rows = ok(await actors.sec.db.from('salary_component_template').select('*').eq('is_active', true).order('sort_order'));
  assert.ok(rows.length >= 6, 'au moins 6 lignes de modèle');
  assert.ok(rows.every((r) => r.direction === 'deduction' && r.basis === 'pct_gross'));
  assert.ok(rows.some((r) => /AVS/i.test(r.label)) && rows.some((r) => /LPP/i.test(r.label)));
  // Taux fins possibles (numeric(6,3)) : une maternité < 0.1 % existe.
  assert.ok(rows.some((r) => Number(r.pct) > 0 && Number(r.pct) < 0.1), 'taux fin (<0.1%) représentable');
});

// ─── LOT B ──────────────────────────────────────────────────────────────────

test('schéma ponts : plusieurs ponts/date OK, férié unique/date imposé', async () => {
  // Deux ponts la même date : autorisé (pas d'unicité sur les ponts).
  ok(await actors.sec.db.from('public_holidays').insert({ holiday_date: '2038-05-14', label: 'Pont A', kind: 'pont', pay_effect: 'unpaid' }));
  ok(await actors.sec.db.from('public_holidays').insert({ holiday_date: '2038-05-14', label: 'Pont B', kind: 'pont', pay_effect: 'leave' }));
  // Deux fériés la même date : refusé (index unique partiel kind='ferie').
  ok(await actors.sec.db.from('public_holidays').insert({ holiday_date: '2038-05-15', label: 'Férié X', kind: 'ferie' }));
  fails(await actors.sec.db.from('public_holidays').insert({ holiday_date: '2038-05-15', label: 'Férié Y', kind: 'ferie' }));
});

test('périmètre technicien : lien holiday↔technicien, RLS lecture', async () => {
  const h = ok(await actors.sec.db.from('public_holidays').insert({ holiday_date: '2038-05-20', label: 'Pont ciblé', kind: 'pont', pay_effect: 'unpaid' }).select().single());
  ok(await actors.sec.db.from('public_holiday_technicians').insert({ holiday_id: h.id, technician_id: actors.pont.id }));
  // Le technicien peut LIRE les fériés/ponts et le périmètre (affichage calendrier).
  assert.ok(ok(await actors.pont.db.from('public_holidays').select('*').eq('id', h.id)).length === 1);
  assert.ok(ok(await actors.pont.db.from('public_holiday_technicians').select('*').eq('holiday_id', h.id)).length === 1);
  // Mais ne peut PAS écrire (gestion staff only).
  fails(await actors.pont.db.from('public_holidays').insert({ holiday_date: '2038-05-21', label: 'Pirate', kind: 'pont' }));
});

test('chaîne pont non payé : congé sans_solde → autosync → retenue de paie', async () => {
  // Config horaire (le taux valorise le sans_solde).
  ok(await actors.sec.db.from('employee_salary_config').insert({
    technician_id: actors.pont.id, pay_type: 'monthly', monthly_base_chf: 5000, hourly_rate_chf: 40,
    effective_from: '2030-01-01', created_by: actors.sec.id,
  }));
  // Ce que fait le modal pour un pont « non payé » : un congé sans_solde approuvé.
  ok(await actors.sec.db.from('leave_requests').insert({
    technician_id: actors.pont.id, start_date: '2038-06-10', end_date: '2038-06-10',
    status: 'approved', leave_type: 'sans_solde', reason: 'Pont : test',
  }));
  // L'autosync (00035) a créé un salary_item sans_solde (pending) depuis le congé.
  const items = ok(await service.from('salary_items').select('*')
    .eq('technician_id', actors.pont.id).eq('item_type', 'sans_solde'));
  assert.equal(items.length, 1, 'autosync a créé 1 salary_item sans_solde');
  assert.equal(num(items[0].minutes), 480); // 1 jour = 8 h
  // La secrétaire valide l'élément avant la paie (décision humaine, 00035).
  ok(await actors.sec.db.from('salary_items').update({ status: 'approved', reviewed_by: actors.sec.id, reviewed_at: new Date().toISOString() }).eq('id', items[0].id));
  // Génération : retenue = 8 h × 40 = 320, net = 5000 − 320.
  ok(await gen('2038-06-25'));
  const d = await draftFor(actors.pont.id, '2038-06-25');
  assert.equal(num(line(d, 'sans_solde').amount_chf), 320);
  assert.equal(num(d.net_chf), 4680);
});
