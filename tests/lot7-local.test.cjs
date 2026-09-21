// LOT 7 — géolocalisation : droits et politique de conservation, sur Supabase
// local avec POSITIONS FICTIVES uniquement. Aucun suivi réel.
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

// Position fictive (place fictive à Genève, aucune donnée réelle)
const FAKE = { latitude: 46.2044, longitude: 6.1432, accuracy_m: 12 };

before(async () => {
  for (const [name, role] of [['secretary', 'secretary'], ['tech', 'technician'], ['other', 'technician']]) {
    const credentials = { email: `lot7-${name}-${run}@example.invalid`, password: 'Local-Fictif-Lot7-2026!' };
    const { user } = ok(await service.auth.admin.createUser({ ...credentials, email_confirm: true }));
    ok(await service.from('users').insert({ id: user.id, email: credentials.email, role, is_active: true, first_name: 'Fictif 7', last_name: name }));
    actors[name] = { id: user.id, db: await login(credentials), credentials };
  }
});

after(() => Object.values(actors).forEach((a) => a.db.auth.stopAutoRefresh()));

test('partage explicite : le technicien publie SA position, mise à jour = écrasement (aucun historique)', async () => {
  ok(await actors.tech.db.from('technician_locations').upsert({
    technician_id: actors.tech.id, is_sharing: true, ...FAKE, recorded_at: new Date().toISOString(),
  }));
  ok(await actors.tech.db.from('technician_locations').upsert({
    technician_id: actors.tech.id, is_sharing: true, ...FAKE, latitude: 46.21, recorded_at: new Date().toISOString(),
  }));
  const rows = ok(await service.from('technician_locations').select('*').eq('technician_id', actors.tech.id));
  assert.equal(rows.length, 1); // une seule ligne, jamais d'accumulation
  assert.equal(rows[0].latitude, 46.21);
});

test('droits : pas d\'écriture pour autrui, pas de lecture entre techniciens, lecture secrétariat OK', async () => {
  fails(await actors.other.db.from('technician_locations').upsert({
    technician_id: actors.tech.id, is_sharing: true, ...FAKE, recorded_at: new Date().toISOString(),
  }));
  const foreign = ok(await actors.other.db.from('technician_locations').select('*').eq('technician_id', actors.tech.id));
  assert.equal(foreign.length, 0); // un technicien ne voit pas ses collègues
  const staff = ok(await actors.secretary.db.from('technician_locations').select('*').eq('technician_id', actors.tech.id));
  assert.equal(staff.length, 1);
  // Le secrétariat LIT mais n'écrit pas la position d'un technicien
  const written = ok(await actors.secretary.db.from('technician_locations')
    .update({ latitude: 0 }).eq('technician_id', actors.tech.id).select());
  assert.equal(written.length, 0);
});

test('arrêt du partage : coordonnées effacées ; la base REFUSE une position hors partage', async () => {
  ok(await actors.tech.db.from('technician_locations').upsert({
    technician_id: actors.tech.id, is_sharing: false, latitude: null, longitude: null, accuracy_m: null, recorded_at: null,
  }));
  const row = ok(await actors.secretary.db.from('technician_locations')
    .select('*').eq('technician_id', actors.tech.id).single());
  assert.equal(row.is_sharing, false);
  assert.equal(row.latitude, null);
  assert.equal(row.recorded_at, null); // aucun point ancien présentable comme du direct

  fails(await actors.tech.db.from('technician_locations').upsert({
    technician_id: actors.tech.id, is_sharing: false, ...FAKE, recorded_at: new Date().toISOString(),
  }), /location_only_while_sharing/);

  fails(await actors.tech.db.from('technician_locations').upsert({
    technician_id: actors.tech.id, is_sharing: true, latitude: 200, longitude: 0, recorded_at: new Date().toISOString(),
  }), /location_complete/);
});
