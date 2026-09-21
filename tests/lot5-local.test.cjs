// LOT 5 — persistance et droits réels sur Supabase local (aucune app requise).
// Utilisateurs fictifs, dates fictives 2035. Ne jamais lire l'env du dépôt.
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

before(async () => {
  for (const [name, role] of [['secretary', 'secretary'], ['tech', 'technician'], ['other', 'technician']]) {
    const credentials = { email: `lot5-${name}-${run}@example.invalid`, password: 'Local-Fictif-Lot5-2026!' };
    const { user } = ok(await service.auth.admin.createUser({ ...credentials, email_confirm: true }));
    ok(await service.from('users').insert({ id: user.id, email: credentials.email, role, is_active: true, first_name: 'Fictif 5', last_name: name }));
    actors[name] = { id: user.id, db: await login(credentials), credentials };
  }
});

after(() => Object.values(actors).forEach((a) => a.db.auth.stopAutoRefresh()));

let pendingLeave, editedLeave;

test('technicien : demande pending OK, maladie auto-validée OK, auto-approbation de vacances refusée', async () => {
  pendingLeave = ok(await actors.tech.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-03-05', end_date: '2035-03-09',
    leave_type: 'conge', status: 'pending', reason: 'Vacances fictives',
  }).select().single());

  const sick = ok(await actors.tech.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-04-02', end_date: '2035-04-03',
    leave_type: 'maladie', status: 'approved', reviewed_by: actors.tech.id, reviewed_at: new Date().toISOString(),
  }).select().single());
  assert.equal(sick.status, 'approved');

  fails(await actors.tech.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-05-01', end_date: '2035-05-01',
    leave_type: 'conge', status: 'approved', reviewed_by: actors.tech.id, reviewed_at: new Date().toISOString(),
  }));

  // Un technicien ne crée pas de congé pour un collègue
  fails(await actors.tech.db.from('leave_requests').insert({
    technician_id: actors.other.id, start_date: '2035-05-02', end_date: '2035-05-02',
    leave_type: 'conge', status: 'pending',
  }));
});

test('technicien : aucune modification directe possible (RLS)', async () => {
  const updated = ok(await actors.tech.db.from('leave_requests')
    .update({ reason: 'Tentative interdite' }).eq('id', pendingLeave.id).select());
  assert.equal(updated.length, 0); // filtré par RLS, aucune ligne modifiée
  const check = ok(await service.from('leave_requests').select('reason').eq('id', pendingLeave.id).single());
  assert.equal(check.reason, 'Vacances fictives');
});

test('secrétaire : édition dates + heures (absence partielle), persistance après reconnexion', async () => {
  editedLeave = ok(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-06-04', end_date: '2035-06-08',
    leave_type: 'conge', status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }).select().single());

  ok(await actors.secretary.db.from('leave_requests').update({
    start_date: '2035-06-05', end_date: '2035-06-05', start_time: '08:00', end_time: '12:00',
  }).eq('id', editedLeave.id));

  // Reconnexion réelle puis relecture
  const freshDb = await login(actors.secretary.credentials);
  const reloaded = ok(await freshDb.from('leave_requests').select('*').eq('id', editedLeave.id).single());
  assert.equal(reloaded.start_date, '2035-06-05');
  assert.equal(reloaded.end_date, '2035-06-05');
  assert.equal(reloaded.start_time, '08:00:00');
  assert.equal(reloaded.end_time, '12:00:00');
  assert.equal(reloaded.status, 'approved');
  freshDb.auth.stopAutoRefresh();
});

test('historique : création + modification tracées avec auteur et anciennes/nouvelles valeurs', async () => {
  const rows = ok(await actors.secretary.db.from('leave_request_history')
    .select('*').eq('leave_request_id', editedLeave.id).order('changed_at'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].action, 'create');
  assert.equal(rows[0].changed_by, actors.secretary.id);
  assert.equal(rows[0].new_values.start_date, '2035-06-04');
  assert.equal(rows[1].action, 'update');
  assert.equal(rows[1].old_values.start_date, '2035-06-04');
  assert.equal(rows[1].old_values.end_date, '2035-06-08');
  assert.equal(rows[1].new_values.start_date, '2035-06-05');
  assert.equal(rows[1].new_values.start_time, '08:00:00');
});

test('historique : écritures client refusées, lecture limitée au technicien concerné', async () => {
  fails(await actors.secretary.db.from('leave_request_history').insert({
    leave_request_id: editedLeave.id, technician_id: actors.tech.id, action: 'update',
  }));
  fails(await actors.tech.db.from('leave_request_history').insert({
    leave_request_id: editedLeave.id, technician_id: actors.tech.id, action: 'update',
  }));
  const own = ok(await actors.tech.db.from('leave_request_history').select('id').eq('leave_request_id', editedLeave.id));
  assert.ok(own.length >= 2); // le technicien concerné voit son historique
  const foreign = ok(await actors.other.db.from('leave_request_history').select('id').eq('leave_request_id', editedLeave.id));
  assert.equal(foreign.length, 0);
});

test('chevauchement même type refusé ; autre type autorisé ; suppression tracée', async () => {
  fails(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-06-05', end_date: '2035-06-06',
    leave_type: 'conge', status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }), /CHEVAUCHEMENT_CONGE/);

  const crossType = ok(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-06-05', end_date: '2035-06-05',
    leave_type: 'maladie', status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }).select().single());

  ok(await actors.secretary.db.from('leave_requests').delete().eq('id', crossType.id));
  const gone = ok(await service.from('leave_requests').select('id').eq('id', crossType.id));
  assert.equal(gone.length, 0);
  const trace = ok(await actors.secretary.db.from('leave_request_history')
    .select('*').eq('leave_request_id', crossType.id).order('changed_at'));
  assert.equal(trace.length, 2);
  assert.equal(trace[1].action, 'delete');
  assert.equal(trace[1].old_values.leave_type, 'maladie');
});

test('contraintes : heures multi-jours refusées, fin <= début refusée, approbation sans conflit tracée', async () => {
  fails(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-07-02', end_date: '2035-07-04',
    start_time: '08:00', end_time: '12:00', leave_type: 'conge', status: 'approved',
    reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }), /leave_partial_same_day/);

  fails(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-07-02', end_date: '2035-07-02',
    start_time: '14:00', end_time: '09:00', leave_type: 'conge', status: 'approved',
    reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }), /leave_partial_same_day/);

  ok(await actors.secretary.db.from('leave_requests').update({
    status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }).eq('id', pendingLeave.id));
  const trail = ok(await actors.secretary.db.from('leave_request_history')
    .select('*').eq('leave_request_id', pendingLeave.id).order('changed_at'));
  assert.equal(trail[trail.length - 1].new_values.status, 'approved');
  assert.equal(trail[trail.length - 1].old_values.status, 'pending');
});

test('sans solde approuvé : identifiable pour la paie (type + durée), sans montant', async () => {
  const unpaid = ok(await actors.secretary.db.from('leave_requests').insert({
    technician_id: actors.tech.id, start_date: '2035-08-01', end_date: '2035-08-02',
    leave_type: 'sans_solde', status: 'approved', reviewed_by: actors.secretary.id, reviewed_at: new Date().toISOString(),
  }).select().single());
  const list = ok(await actors.secretary.db.from('leave_requests')
    .select('id, start_date, end_date, start_time, end_time')
    .eq('technician_id', actors.tech.id).eq('leave_type', 'sans_solde').eq('status', 'approved'));
  assert.ok(list.some((l) => l.id === unpaid.id));
  // Aucune colonne de tarif/retenue n'existe : rien à activer côté paie ici.
  assert.equal('deduction_amount' in unpaid, false);
});
