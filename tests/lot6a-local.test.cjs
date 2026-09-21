// LOT 6A — éléments variables de salaire : persistance et droits réels sur
// Supabase local. Données fictives 2036. Aucune règle salariale inventée.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const config = JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS, 'utf8'));
assert.match(config.API_URL, /^http:\/\/127\.0\.0\.1:\d+$/);

const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = crypto.randomUUID();
const actors = {};
const ok = (r) => { assert.equal(r.error, null, r.error?.message); return r.data; };
const fails = (r, pattern) => { assert.notEqual(r.error, null, 'écriture censée être refusée'); if (pattern) assert.match(r.error.message, pattern); };

async function login(credentials) {
  const db = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await db.auth.signInWithPassword(credentials));
  return db;
}

let fullWeek, twoWeeks, partialWeek, unpaidLeave, unpaidPartial, pendingUnpaid;

before(async () => {
  for (const [name, role] of [['secretary', 'secretary'], ['tech', 'technician'], ['other', 'technician']]) {
    const credentials = { email: `lot6a-${name}-${run}@example.invalid`, password: 'Local-Fictif-Lot6A-2026!' };
    const { user } = ok(await service.auth.admin.createUser({ ...credentials, email_confirm: true }));
    ok(await service.from('users').insert({ id: user.id, email: credentials.email, role, is_active: true, first_name: 'Fictif 6A', last_name: name }));
    actors[name] = { id: user.id, db: await login(credentials), credentials };
  }
  // Planification piquet existante (source unique de vérité)
  fullWeek = ok(await actors.secretary.db.from('piquet_schedule').insert({
    technician_id: actors.tech.id, start_date: '2036-01-07', end_date: '2036-01-13', created_by: actors.secretary.id,
  }).select().single());
  twoWeeks = ok(await actors.secretary.db.from('piquet_schedule').insert({
    technician_id: actors.tech.id, start_date: '2036-02-04', end_date: '2036-02-17', created_by: actors.secretary.id,
  }).select().single());
  partialWeek = ok(await actors.secretary.db.from('piquet_schedule').insert({
    technician_id: actors.tech.id, start_date: '2036-03-03', end_date: '2036-03-07', created_by: actors.secretary.id,
  }).select().single());
  // Congés sans solde source (lot 5)
  unpaidLeave = ok(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2036-04-06', end_date: '2036-04-07',
    leave_type: 'sans_solde', status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }).select().single());
  unpaidPartial = ok(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2036-05-04', end_date: '2036-05-04',
    start_time: '08:00', end_time: '10:00',
    leave_type: 'sans_solde', status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }).select().single());
  pendingUnpaid = ok(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2036-06-01', end_date: '2036-06-02',
    leave_type: 'sans_solde', status: 'pending',
  }).select().single());
});

after(() => Object.values(actors).forEach((a) => a.db.auth.stopAutoRefresh()));

test('piquet : semaine complète = 150 CHF, deux semaines = 300, montant imposé par le serveur', async () => {
  const item = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'piquet', origin: 'piquet_schedule',
    source_id: fullWeek.id, created_by: actors.secretary.id,
  }).select().single());
  assert.equal(Number(item.amount_chf), 150);
  assert.equal(item.period_start, '2036-01-07');
  assert.equal(item.period_end, '2036-01-13');
  assert.equal(item.payroll_status, 'not_processed');

  const double = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'piquet', origin: 'piquet_schedule',
    source_id: twoWeeks.id, amount_chf: 9999, created_by: actors.secretary.id,
  }).select().single());
  assert.equal(Number(double.amount_chf), 300); // 9999 saisi ignoré, règle serveur
});

test('piquet : semaine partielle refusée (prorata non défini), mauvais technicien refusé, pas de doublon', async () => {
  fails(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'piquet', origin: 'piquet_schedule',
    source_id: partialWeek.id, created_by: actors.secretary.id,
  }), /PIQUET_SEMAINE_INCOMPLETE/);

  fails(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.other.id, item_type: 'piquet', origin: 'piquet_schedule',
    source_id: fullWeek.id, created_by: actors.secretary.id,
  }), /MAUVAIS_COLLABORATEUR/);

  fails(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'piquet', origin: 'piquet_schedule',
    source_id: fullWeek.id, created_by: actors.secretary.id,
  }), /duplicate key|idx_salary_items_unique_source/);
});

test('sans solde : durée dérivée du congé approuvé (2 j = 960 min, partiel = 120 min), aucun montant inventé', async () => {
  const item = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'sans_solde', origin: 'leave_request',
    source_id: unpaidLeave.id, created_by: actors.secretary.id,
  }).select().single());
  assert.equal(item.minutes, 960);
  assert.equal(item.amount_chf, null);
  assert.equal(item.payroll_status, 'requires_rule');
  assert.equal(item.period_start, '2036-04-06');

  const partial = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'sans_solde', origin: 'leave_request',
    source_id: unpaidPartial.id, created_by: actors.secretary.id,
  }).select().single());
  assert.equal(partial.minutes, 120);

  fails(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'sans_solde', origin: 'leave_request',
    source_id: unpaidLeave.id, created_by: actors.secretary.id,
  }), /duplicate key|idx_salary_items_unique_source/);

  fails(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'sans_solde', origin: 'leave_request',
    source_id: pendingUnpaid.id, created_by: actors.secretary.id,
  }), /SOURCE_INVALIDE/);
});

test('retard : minutes calculées serveur, heure incohérente refusée, aucun effet salarial automatique', async () => {
  const item = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'retard', item_date: '2036-07-01',
    expected_time: '08:00', actual_time: '08:25', amount_chf: 50,
    reason: 'Retard fictif', created_by: actors.secretary.id,
  }).select().single());
  assert.equal(item.minutes, 25);
  assert.equal(item.amount_chf, null); // pas d'amende forfaitaire inventée
  assert.equal(item.payroll_status, 'requires_rule');

  fails(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'retard', item_date: '2036-07-02',
    expected_time: '08:00', actual_time: '07:50', created_by: actors.secretary.id,
  }), /RETARD_INVALIDE/);
});

test('amende CHF et heures sup : saisie correcte, règles manquantes marquées à configurer', async () => {
  const fine = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'amende_parc', item_date: '2036-07-10',
    amount_chf: 120.50, justification: 'Justificatif fictif ref 123', created_by: actors.secretary.id,
  }).select().single());
  assert.equal(Number(fine.amount_chf), 120.5);
  assert.equal(fine.payroll_status, 'requires_rule'); // la saisie ne vaut pas retenue

  fails(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'amende_parc', item_date: '2036-07-11',
    created_by: actors.secretary.id,
  }), /AMENDE_INVALIDE/);

  const overtime = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'heures_sup', item_date: '2036-07-12',
    minutes: 90, reason: 'Chantier fictif prolongé', created_by: actors.secretary.id,
  }).select().single());
  assert.equal(overtime.compensation_mode, 'pending_rule');
  assert.equal(overtime.amount_chf, null);
  assert.equal(overtime.payroll_status, 'requires_rule');
});

test('droits : technicien lecture seule sur SES éléments, aucune écriture, historique protégé', async () => {
  fails(await actors.tech.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'heures_sup', item_date: '2036-07-20',
    minutes: 60, created_by: actors.tech.id,
  }));
  const mine = ok(await actors.tech.db.from('salary_items').select('id, technician_id'));
  assert.ok(mine.length >= 5);
  assert.ok(mine.every((i) => i.technician_id === actors.tech.id));
  const foreign = ok(await actors.other.db.from('salary_items').select('id'));
  assert.equal(foreign.length, 0);

  const updated = ok(await actors.tech.db.from('salary_items')
    .update({ reason: 'Tentative interdite' }).eq('technician_id', actors.tech.id).select());
  assert.equal(updated.length, 0);

  fails(await actors.tech.db.from('salary_item_history').insert({
    salary_item_id: mine[0].id, technician_id: actors.tech.id, action: 'update',
  }));
  const hist = ok(await actors.tech.db.from('salary_item_history').select('id, technician_id').limit(50));
  assert.ok(hist.every((h) => h.technician_id === actors.tech.id));
});

test('annulation sans doublon : élément annulé, la source redevient consommable, une seule ligne active', async () => {
  const items = ok(await actors.secretary.db.from('salary_items')
    .select('*').eq('source_id', fullWeek.id).neq('status', 'cancelled'));
  assert.equal(items.length, 1);
  ok(await actors.secretary.db.from('salary_items')
    .update({ status: 'cancelled', review_note: 'Annulation fictive' }).eq('id', items[0].id));

  const recreated = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'piquet', origin: 'piquet_schedule',
    source_id: fullWeek.id, created_by: actors.secretary.id,
  }).select().single());
  assert.equal(Number(recreated.amount_chf), 150);

  const active = ok(await actors.secretary.db.from('salary_items')
    .select('id').eq('source_id', fullWeek.id).not('status', 'in', '("cancelled","rejected")'));
  assert.equal(active.length, 1);

  const trace = ok(await actors.secretary.db.from('salary_item_history')
    .select('action').eq('salary_item_id', items[0].id).order('changed_at'));
  assert.deepEqual(trace.map((t) => t.action), ['create', 'update']);
});

test('paie figée : élément inclus non modifiable ni supprimable (régularisation exigée)', async () => {
  const overtime = ok(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'heures_sup', item_date: '2036-08-01',
    minutes: 45, created_by: actors.secretary.id,
  }).select().single());
  // Le futur moteur 6B posera ce statut ; simulé ici par la clé service.
  ok(await service.from('salary_items').update({ payroll_status: 'included' }).eq('id', overtime.id));

  fails(await actors.secretary.db.from('salary_items')
    .update({ minutes: 60 }).eq('id', overtime.id), /PAIE_FIGEE/);
  fails(await actors.secretary.db.from('salary_items')
    .delete().eq('id', overtime.id), /PAIE_FIGEE/);
});

test('validation : approbation tracée avec auteur, refus des types inconnus', async () => {
  const fine = ok(await actors.secretary.db.from('salary_items')
    .select('id').eq('item_type', 'amende_parc').eq('technician_id', actors.tech.id).limit(1).single());
  ok(await actors.secretary.db.from('salary_items').update({
    status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }).eq('id', fine.id));
  const trail = ok(await actors.secretary.db.from('salary_item_history')
    .select('*').eq('salary_item_id', fine.id).order('changed_at'));
  assert.equal(trail[trail.length - 1].new_values.status, 'approved');
  assert.equal(trail[trail.length - 1].changed_by, actors.secretary.id);

  fails(await actors.secretary.db.from('salary_items').insert({
    technician_id: actors.tech.id, item_type: 'prime_inventee', item_date: '2036-09-01',
    created_by: actors.secretary.id,
  }));
});
