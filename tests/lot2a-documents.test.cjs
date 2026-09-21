const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, database } = require('./lot1-harness.cjs');
const { File } = require('node:buffer');
const crypto = require('node:crypto');
const id = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const context = { params: { id } };
const url = `http://localhost/api/interventions/${id}/documents`;
function setup(role = 'secretary', assigned = true) {
  const db = database({ users: [{ id: 'u1', role, is_active: true }], interventions: [{ id, intervention_type: 'chantier', technician_id: assigned ? 'u1' : 'u2' }] }, 'u1');
  const files = new Map(); const calls = []; let fail = false;
  db.storage = { from(bucket) { assert.equal(bucket, 'chantier-documents'); return {
    async upload(path, file) { calls.push(path); if (fail || files.has(path)) return { error: new Error('upload') }; files.set(path, file); return { data: { path }, error: null }; },
    async download(path) { return files.has(path) ? { data: files.get(path) } : { error: new Error('missing') }; },
    async list(prefix) { return { data: [...files.keys()].filter(p => p.startsWith(prefix + '/')).map(p => ({ name: p.slice(prefix.length + 1) })) }; },
    async remove(paths) { paths.forEach(p => files.delete(p)); return { error: null }; },
  }; } };
  const h = harness(db, { Request, Response, FormData, File, Buffer, crypto });
  const route = h.load('src/app/api/interventions/[id]/documents/route.ts');
  return { route, files, calls, db, setFail(v) { fail = v; } };
}
function request(file = new File(['%PDF-1.7 test'], 'Plan test.pdf', { type: 'application/pdf' })) {
  const body = new FormData(); body.set('file', file); body.set('token', token);
  return new Request(url, { method: 'POST', body });
}
test('PDF: upload, relist, authenticated download, idempotent retry and delete (mock storage)', async () => {
  const s = setup();
  const res = await s.route.POST(request(), context); assert.equal(res.status, 200);
  const { document } = await res.json();
  assert.equal(document.name, 'Plan test.pdf');
  assert.equal((await s.route.POST(request(), context)).status, 200); assert.equal(s.files.size, 1);
  const list = await (await s.route.GET(new Request(url), context)).json(); assert.equal(list.documents.length, 1);
  const download = await s.route.GET(new Request(`${url}?key=${encodeURIComponent(document.key)}`), context);
  assert.equal(download.status, 200); assert.match(await download.text(), /^%PDF/);
  assert.equal(download.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await s.route.DELETE(new Request(`${url}?key=${encodeURIComponent(document.key)}`, { method: 'DELETE' }), context)).status, 200);
  assert.equal(s.files.size, 0);
});
test('PDF: assigned technician reads, cannot upload/delete; other technician denied even with key', async () => {
  const key = `${token}--plan.pdf`;
  const s = setup('technician'); s.files.set(`${id}/${key}`, new File(['%PDF-1.7'], 'plan.pdf'));
  assert.equal((await s.route.GET(new Request(`${url}?key=${key}`), context)).status, 200);
  assert.equal((await s.route.POST(request(), context)).status, 403);
  assert.equal((await s.route.DELETE(new Request(`${url}?key=${key}`), context)).status, 403);
  s.db.tables.interventions[0].technician_id = 'someone-else';
  assert.equal((await s.route.GET(new Request(`${url}?key=${key}`), context)).status, 403);
  assert.equal((await s.route.GET(new Request(url), context)).status, 403);
});
test('PDF: invalid content, oversized input, traversal, inactive/no session, and storage failure', async () => {
  const s = setup();
  for (const file of [new File(['not PDF'], 'fake.pdf', { type: 'application/pdf' }), new File(['%PDF'], 'test.exe', { type: 'application/pdf' }), new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'huge.pdf', { type: 'application/pdf' })]) {
    assert.equal((await s.route.POST(request(file), context)).status, 400);
  }
  assert.equal(s.calls.length, 0);
  assert.equal((await s.route.GET(new Request(`${url}?key=../../secret.pdf`), context)).status, 400);
  s.setFail(true); assert.equal((await s.route.POST(request(), context)).status, 503); assert.equal(s.files.size, 0);
  assert.equal(s.db.tables.interventions[0].intervention_type, 'chantier');
  s.db.tables.users[0].is_active = false; assert.equal((await s.route.POST(request(), context)).status, 403);
  s.db.auth.getUser = async () => ({ data: { user: null } }); assert.equal((await s.route.GET(new Request(url), context)).status, 401);
});
test('PDF component: multi-file partial failure, named retry and reload without touching intervention data', async () => {
  const { nodes, text } = require('./lot1-harness.cjs');
  const saved = []; let fail = true;
  const fakeFetch = async (_url, options = {}) => {
    if (!options.method) return Response.json({ documents: saved, canManage: true });
    const name = options.body.get('file').name;
    if (fail && name === 'second.pdf') return Response.json({ error: 'Envoi impossible.' }, { status: 503 });
    const document = { key: options.body.get('token') + '--' + name, name };
    if (!saved.some(d => d.key === document.key)) saved.push(document);
    return Response.json({ document });
  };
  const h = harness(database(), { fetch: fakeFetch, FormData, crypto });
  const Component = h.load('src/components/documents/ChantierDocuments.tsx').ChantierDocuments;
  const props = { interventionId: id };
  h.render(Component, props); await h.settle();
  const files = ['first.pdf', 'second.pdf'].map(name => new File(['%PDF-1.7'], name, { type: 'application/pdf' }));
  nodes(h.render(Component, props)).find(n => n.type === 'input').props.onChange({ target: { files, value: '' } });
  // The input starts an asynchronous handler; wait without any network or real timer.
  for (let i = 0; i < 100; i++) await Promise.resolve();
  assert.match(text(h.render(Component, props)), /1 PDF enregistré/);
  assert.match(text(h.render(Component, props)), /1 envoi\(s\) à reprendre/);
  fail = false;
  await nodes(h.render(Component, props)).find(n => n.type === 'button' && /Réessayer les envois/.test(text(n))).props.onClick();
  assert.equal(saved.length, 2);
  const reopened = harness(database(), { fetch: fakeFetch, FormData, crypto });
  const Reopened = reopened.load('src/components/documents/ChantierDocuments.tsx').ChantierDocuments;
  reopened.render(Reopened, props); await reopened.settle();
  const tree = reopened.render(Reopened, props);
  assert.equal(nodes(tree).filter(n => n.type === 'a').length, 2);
  assert.match(text(tree), /first.pdf/); assert.match(text(tree), /second.pdf/);
});
