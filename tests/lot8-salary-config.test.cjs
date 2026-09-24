// LOT 8 — config de rémunération & fiche nette. Supabase local, données
// fictives 2037. Couvre : base mensuelle/horaire, heures auto→manuelles,
// valorisation variables (suppl%), amende « à configurer » + override,
// composants (%/fixe), net honnête, override préservé au rafraîchissement,
// clôture refusée, PAIE_FIGEE, historique inviolable, RLS employé.
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
  const credentials = { email: `lot8-${name}-${run}@example.invalid`, password: 'Local-Fictif-Lot8-2026!' };
  const { user } = ok(await service.auth.admin.createUser({ ...credentials, email_confirm: true }));
  ok(await service.from('users').insert({ id: user.id, email: credentials.email, role, is_active: true, first_name: 'Fictif8', last_name: name }));
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
const gen = (ref) => actors.sec.db.rpc('generate_payroll_drafts', { p_reference: ref, p_dry: false });
const addComponent = async (configId, patch) => ok(await actors.sec.db.from('salary_config_component').insert({ config_id: configId, ...patch }).select().single());
const addItem = async (techId, patch) => ok(await actors.sec.db.from('salary_items').insert({
  technician_id: techId, status: 'approved', reviewed_by: actors.sec.id, reviewed_at: new Date().toISOString(), created_by: actors.sec.id, ...patch,
}).select().single());

before(async () => {
  await makeUser('sec', 'secretary');
  await makeUser('monthly', 'technician');
  await makeUser('hourly', 'technician');
  await makeUser('override', 'technician');
  await makeUser('noconf', 'technician');
});
after(() => Object.values(actors).forEach((a) => a.db.auth.stopAutoRefresh()));

test('config mensuelle : base chiffrée + composants (%/fixe) + net', async () => {
  const cfg = ok(await actors.sec.db.from('employee_salary_config').insert({
    technician_id: actors.monthly.id, pay_type: 'monthly', monthly_base_chf: 5000, hourly_rate_chf: 50,
    effective_from: '2030-01-01', created_by: actors.sec.id,
  }).select().single());
  await addComponent(cfg.id, { label: 'AVS/AC', direction: 'deduction', basis: 'pct_gross', pct: 6.4, sort_order: 1 });
  await addComponent(cfg.id, { label: 'Allocation enfant', direction: 'addition', basis: 'fixed', amount_chf: 200, sort_order: 2 });

  ok(await gen('2037-04-25'));
  const d = await draftFor(actors.monthly.id, '2037-04-25');
  assert.equal(line(d, 'salaire_base').amount_state, 'amount_set');
  assert.equal(num(line(d, 'salaire_base').amount_chf), 5000);
  assert.equal(num(line(d, 'cotisation').amount_chf), 320); // 6.4% de 5000
  assert.equal(num(line(d, 'ajout').amount_chf), 200);
  assert.equal(num(d.net_chf), 4880); // 5000 - 320 + 200
});

test('config horaire : heures auto=0 → base « à configurer » & net nul', async () => {
  ok(await actors.sec.db.from('employee_salary_config').insert({
    technician_id: actors.hourly.id, pay_type: 'hourly', hourly_rate_chf: 50, overtime_supplement_pct: 25,
    effective_from: '2030-01-01', created_by: actors.sec.id,
  }));
  ok(await gen('2037-05-25'));
  const d = await draftFor(actors.hourly.id, '2037-05-25');
  assert.equal(line(d, 'salaire_base').amount_state, 'requires_rule');
  assert.equal(d.net_chf, null);
});

test('heures manuelles conservées → base = heures × taux', async () => {
  const d0 = await draftFor(actors.hourly.id, '2037-05-25');
  ok(await actors.sec.db.from('payroll_drafts').update({ worked_hours: 100, worked_hours_source: 'manual' }).eq('id', d0.id));
  ok(await gen('2037-05-25'));
  const d = await draftFor(actors.hourly.id, '2037-05-25');
  assert.equal(num(d.worked_hours), 100);
  assert.equal(line(d, 'salaire_base').amount_state, 'amount_set');
  assert.equal(num(line(d, 'salaire_base').amount_chf), 5000); // 100 h × 50
});

test('valorisation heures sup (+25%) et retard, net calculé', async () => {
  await addItem(actors.hourly.id, { item_type: 'heures_sup', item_date: '2037-05-10', minutes: 60 });
  await addItem(actors.hourly.id, { item_type: 'retard', item_date: '2037-05-11', expected_time: '08:00', actual_time: '09:00' });
  ok(await gen('2037-05-25'));
  const d = await draftFor(actors.hourly.id, '2037-05-25');
  assert.equal(num(line(d, 'heures_sup').amount_chf), 62.5); // 60/60 × 50 × 1.25
  assert.equal(num(line(d, 'retard').amount_chf), 50);       // 60/60 × 50
  assert.equal(num(d.net_chf), 5012.5); // 5000 + 62.5 − 50
});

test('amende reste « à configurer » (imputabilité), bloque la clôture, override la résout', async () => {
  await addItem(actors.hourly.id, { item_type: 'amende_parc', item_date: '2037-05-12', amount_chf: 30 });
  ok(await gen('2037-05-25'));
  let d = await draftFor(actors.hourly.id, '2037-05-25');
  const amende = line(d, 'amende_parc');
  assert.equal(amende.amount_state, 'requires_rule');
  assert.equal(amende.amount_chf, null);
  assert.equal(d.net_chf, null); // une ligne à configurer → net non calculé

  fails(await actors.sec.db.from('payroll_drafts').update({ status: 'validated', validated_by: actors.sec.id }).eq('id', d.id), /VALIDATION_INCOMPLETE/);

  // Override : l'admin décide d'imputer l'amende.
  ok(await actors.sec.db.from('payroll_draft_lines').update({ amount_chf: 30, amount_state: 'amount_set', overridden: true }).eq('id', amende.id));
  d = await draftFor(actors.hourly.id, '2037-05-25');
  assert.equal(num(d.net_chf), 4982.5); // 5012.5 − 30
  ok(await actors.sec.db.from('payroll_drafts').update({ status: 'validated', validated_by: actors.sec.id }).eq('id', d.id));
  d = await draftFor(actors.hourly.id, '2037-05-25');
  assert.equal(d.status, 'validated');
});

test('PAIE_FIGEE : lignes d’une fiche validée non modifiables', async () => {
  const d = await draftFor(actors.hourly.id, '2037-05-25');
  fails(await actors.sec.db.from('payroll_draft_lines').update({ amount_chf: 999 }).eq('id', line(d, 'salaire_base').id), /PAIE_FIGEE/);
});

test('override préservé au rafraîchissement', async () => {
  ok(await actors.sec.db.from('employee_salary_config').insert({
    technician_id: actors.override.id, pay_type: 'monthly', monthly_base_chf: 4000, hourly_rate_chf: 40,
    effective_from: '2030-01-01', created_by: actors.sec.id,
  }));
  ok(await gen('2037-06-25'));
  let d = await draftFor(actors.override.id, '2037-06-25');
  ok(await actors.sec.db.from('payroll_draft_lines').update({ amount_chf: 4200, amount_state: 'amount_set', overridden: true }).eq('id', line(d, 'salaire_base').id));
  ok(await gen('2037-06-25')); // rafraîchissement : ne doit PAS écraser l'override
  d = await draftFor(actors.override.id, '2037-06-25');
  assert.equal(line(d, 'salaire_base').overridden, true);
  assert.equal(num(line(d, 'salaire_base').amount_chf), 4200);
});

test('aucune config → base « à configurer », net nul, clôture refusée', async () => {
  ok(await gen('2037-07-25'));
  const d = await draftFor(actors.noconf.id, '2037-07-25');
  assert.equal(line(d, 'salaire_base').amount_state, 'requires_rule');
  assert.equal(d.net_chf, null);
  fails(await actors.sec.db.from('payroll_drafts').update({ status: 'validated', validated_by: actors.sec.id }).eq('id', d.id), /VALIDATION_INCOMPLETE/);
});

test('historique config inviolable + RLS employé', async () => {
  const cfg = ok(await actors.sec.db.from('employee_salary_config').select('id').eq('technician_id', actors.monthly.id).eq('is_active', true).single());
  ok(await actors.sec.db.from('employee_salary_config').update({ hourly_rate_chf: 55 }).eq('id', cfg.id));
  const hist = ok(await actors.sec.db.from('employee_salary_config_history').select('*').eq('config_id', cfg.id).order('changed_at'));
  assert.ok(hist.some((h) => h.action === 'create'));
  assert.ok(hist.some((h) => h.action === 'update'));

  // Écriture directe de l'historique impossible (aucune policy d'écriture).
  fails(await actors.sec.db.from('employee_salary_config_history').insert({ config_id: cfg.id, technician_id: actors.monthly.id, action: 'update' }));

  // Un technicien ne voit NI la config NI l'historique, et ne peut pas écrire.
  assert.equal(ok(await actors.hourly.db.from('employee_salary_config').select('*')).length, 0);
  assert.equal(ok(await actors.hourly.db.from('employee_salary_config_history').select('*')).length, 0);
  fails(await actors.hourly.db.from('employee_salary_config').insert({ technician_id: actors.hourly.id, pay_type: 'monthly', monthly_base_chf: 1, hourly_rate_chf: 1 }));
});
