// LOT 9 — bons de commande fournisseur : droits réels (Supabase local).
// Le technicien crée un BC pour SES interventions ; ne voit que les siens ;
// un BC « traité » par le staff est figé côté technicien. Données fictives.
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

const actors = {};
async function login(credentials) {
  const db = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await db.auth.signInWithPassword(credentials));
  return db;
}
async function makeUser(name, role) {
  const credentials = { email: `lot9-${name}-${run}@example.invalid`, password: 'Local-Fictif-Lot9-2026!' };
  const { user } = ok(await service.auth.admin.createUser({ ...credentials, email_confirm: true }));
  ok(await service.from('users').insert({ id: user.id, email: credentials.email, role, is_active: true, first_name: 'Fictif9', last_name: name }));
  actors[name] = { id: user.id, db: await login(credentials), credentials };
  return actors[name];
}
const mkIntervention = async (techId) => ok(await actors.sec.db.from('interventions').insert({
  title: `BC fictif ${run}`, address: 'Adresse fictive', technician_id: techId, intervention_type: 'depannage', status: 'en_cours',
}).select().single());

let ownIntervention, otherIntervention, bc;

before(async () => {
  await makeUser('sec', 'secretary');
  await makeUser('tech', 'technician');
  await makeUser('other', 'technician');
  ownIntervention = await mkIntervention(actors.tech.id);
  otherIntervention = await mkIntervention(actors.other.id);
});
after(() => Object.values(actors).forEach((a) => a.db.auth.stopAutoRefresh()));

test('technicien crée un BC pour SON intervention', async () => {
  bc = ok(await actors.tech.db.from('supplier_orders').insert({
    intervention_id: ownIntervention.id, technician_id: actors.tech.id,
    supplier: 'Sanitas Troesch', note: '2× flexibles douche, 1× mitigeur', photos: [],
  }).select().single());
  assert.equal(bc.is_processed, false);
  assert.equal(bc.supplier, 'Sanitas Troesch');
});

test('technicien NE PEUT PAS créer un BC pour une intervention d’un autre', async () => {
  fails(await actors.tech.db.from('supplier_orders').insert({
    intervention_id: otherIntervention.id, technician_id: actors.tech.id, note: 'tentative',
  }));
});

test('technicien ne peut pas se déclarer « traité » lui-même à la création', async () => {
  fails(await actors.tech.db.from('supplier_orders').insert({
    intervention_id: ownIntervention.id, technician_id: actors.tech.id, note: 'auto-traité', is_processed: true,
  }));
});

test('un autre technicien ne voit pas les BC d’autrui', async () => {
  assert.equal(ok(await actors.other.db.from('supplier_orders').select('*').eq('id', bc.id)).length, 0);
});

test('la secrétaire voit tous les BC et coche « traité »', async () => {
  assert.equal(ok(await actors.sec.db.from('supplier_orders').select('*').eq('id', bc.id)).length, 1);
  ok(await actors.sec.db.from('supplier_orders').update({ is_processed: true, processed_by: actors.sec.id, processed_at: new Date().toISOString() }).eq('id', bc.id));
  const row = ok(await service.from('supplier_orders').select('is_processed').eq('id', bc.id).single());
  assert.equal(row.is_processed, true);
});

test('BC traité = figé côté technicien (update et delete sans effet)', async () => {
  // RLS filtre la ligne (is_processed=true) : 0 ligne touchée, pas d'erreur.
  assert.equal(ok(await actors.tech.db.from('supplier_orders').update({ note: 'hack' }).eq('id', bc.id).select()).length, 0);
  assert.equal(ok(await actors.tech.db.from('supplier_orders').delete().eq('id', bc.id).select()).length, 0);
  const row = ok(await service.from('supplier_orders').select('note').eq('id', bc.id).single());
  assert.equal(row.note, '2× flexibles douche, 1× mitigeur'); // inchangé
});

test('technicien modifie/supprime son BC tant qu’il n’est pas traité', async () => {
  const draft = ok(await actors.tech.db.from('supplier_orders').insert({
    intervention_id: ownIntervention.id, technician_id: actors.tech.id, note: 'brouillon',
  }).select().single());
  assert.equal(ok(await actors.tech.db.from('supplier_orders').update({ note: 'corrigé' }).eq('id', draft.id).select()).length, 1);
  assert.equal(ok(await actors.tech.db.from('supplier_orders').delete().eq('id', draft.id).select()).length, 1);
});
