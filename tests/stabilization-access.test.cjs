// Offline handler tests only: these do not prove PostgreSQL or Storage RLS.
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, database } = require('./lot1-harness.cjs');
const owner = '11111111-1111-4111-8111-111111111111';
const intervention = '22222222-2222-4222-8222-222222222222';
const path = `${owner}/reports/${intervention}/before/33333333-3333-4333-8333-333333333333.jpg`;
const url = `/api/report-photos?path=${encodeURIComponent(path)}`;

for (const scenario of ['anonymous', 'inactive', 'other technician', 'missing report', 'auth failure', 'database failure']) {
  test(`DOCX GET/POST deny ${scenario} before privileged client (mock)`, async () => {
    const id = scenario === 'other technician' ? 'other' : owner;
    const db = database({ users: [{ id, role: 'technician', is_active: scenario !== 'inactive' }],
      reports: scenario === 'missing report' ? [] : [{ id: 'r1', technician_id: owner }] }, scenario === 'anonymous' ? null : id,
      scenario === 'database failure' ? { reports: { message: 'denied' } } : {});
    if (scenario === 'auth failure') db.auth.getUser = async () => { throw new Error('offline'); };
    const h = harness(db, { Request, Response, Buffer }); let privileged = 0;
    h.mocks['next/server'] = { NextResponse: Response };
    h.mocks['@/lib/supabase/admin'] = { createClient: () => { privileged++; throw new Error('Must not run'); } };
    h.mocks['@/lib/generate-report-docx'] = {};
    h.mocks['@/lib/docx/chantier'] = {};
    h.mocks['@/lib/docx/convert'] = {};
    const route = h.load('src/app/api/reports/[id]/docx/route.ts');
    for (const method of ['GET', 'POST']) {
      const result = await route[method](new Request('http://127.0.0.1/api/reports/r1/docx', { method }), { params: { id: 'r1' } });
      assert.ok([401, 403, 503].includes(result.status));
      assert.equal(privileged, 0);
    }
  });
}

test('DOCX access matrix: active staff read/write, owner read only (mock)', async () => {
  for (const role of ['admin', 'secretary', 'technician']) {
    const db = database({ users: [{ id: owner, role, is_active: true }], reports: [{ id: 'r1', technician_id: owner }] }, owner);
    const { reportAccessFailure } = harness(db, { Response }).load('src/lib/report-access.ts');
    assert.equal(await reportAccessFailure('r1', false), null);
    const write = await reportAccessFailure('r1', true);
    assert.equal(role === 'technician' ? write.status : write, role === 'technician' ? 403 : null);
    assert.ok(await reportAccessFailure('substituted-report', false));
  }
});

test('Photo read requires exact persisted reference and report scope before Storage (mock)', async () => {
  const db = database({ users: [{ id: owner, role: 'technician', is_active: true }], reports: [] }, owner);
  let reads = 0;
  db.storage = { from: () => ({ download: async () => { reads++; return { data: new Blob(['fiction'], { type: 'image/jpeg' }) }; } }) };
  const route = harness(db, { Response, Request }).load('src/app/api/report-photos/route.ts');
  const read = () => route.GET(new Request(`http://127.0.0.1${url}`));
  assert.equal((await read()).status, 404); assert.equal(reads, 0);
  db.tables.reports.push({ intervention_id: 'another-site', technician_id: owner, photos: [{ url }] });
  assert.equal((await read()).status, 404); assert.equal(reads, 0);
  db.tables.reports[0].intervention_id = intervention;
  assert.equal((await read()).status, 200); assert.equal(reads, 1);
  db.tables.reports[0].photos = [{ url: url.replace('before', 'after') }];
  assert.equal((await read()).status, 404); assert.equal(reads, 1);
});

test('Stats guard refuses inactive admin (mock)', async () => {
  const db = database({ users: [{ id: owner, role: 'admin', is_active: false }] }, owner);
  const { requireAdmin } = harness(db).load('src/lib/auth-guard.ts');
  assert.equal((await requireAdmin()).authorized, false);
});
