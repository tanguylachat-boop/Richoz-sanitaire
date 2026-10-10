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
    async createSignedUrl(path, ttl) { assert.equal(ttl, 60); return files.has(path) ? { data: { signedUrl: `https://storage.test/sign/${path}?token=t` }, error: null } : { data: null, error: new Error('missing') }; },
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
  assert.equal(download.status, 302); assert.equal(download.headers.get('Location'), `https://storage.test/sign/${id}/${document.key}?token=t`);
  assert.equal(download.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await s.route.DELETE(new Request(`${url}?key=${encodeURIComponent(document.key)}`, { method: 'DELETE' }), context)).status, 200);
  assert.equal(s.files.size, 0);
});
test('PDF: assigned technician reads, cannot upload/delete; other technician denied even with key', async () => {
  const key = `${token}--plan.pdf`;
  const s = setup('technician'); s.files.set(`${id}/${key}`, new File(['%PDF-1.7'], 'plan.pdf'));
  assert.equal((await s.route.GET(new Request(`${url}?key=${key}`), context)).status, 302);
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
function memoryStorage(files = new Map(), state = { fail: () => false }) {
  return { from(bucket) { assert.equal(bucket, 'chantier-documents'); return {
    async upload(path, file) { if (state.fail(path) || files.has(path)) return { data: null, error: new Error('upload') }; files.set(path, file); return { data: { path }, error: null }; },
    async download(path) { return files.has(path) ? { data: files.get(path), error: null } : { data: null, error: new Error('missing') }; },
  }; } };
}
test('PDF component: direct Storage upload, partial failure, named retry, one technician notification per batch', async () => {
  const { nodes, text } = require('./lot1-harness.cjs');
  const files = new Map(); let fail = true; const patches = [];
  const storage = memoryStorage(files, { fail: path => fail && path.endsWith('second.pdf') });
  const listed = () => [...files.keys()].map(p => p.split('/')[1]).map(key => ({ key, name: key.slice(38) }));
  const fakeFetch = async (_url, options = {}) => {
    if (!options.method) return Response.json({ documents: listed(), canManage: true });
    if (options.method === 'PATCH') { patches.push(JSON.parse(options.body)); return Response.json({ notified: true, recipient_id: 'tech', title: 'Nouveau PDF', message: 'm', url: '/technician/report/x' }); }
    throw new Error('unexpected ' + options.method);
  };
  const db = database(); db.storage = storage;
  const h = harness(db, { fetch: fakeFetch, FormData, crypto, Uint8Array });
  const Component = h.load('src/components/documents/ChantierDocuments.tsx').ChantierDocuments;
  const props = { interventionId: id };
  h.render(Component, props); await h.settle();
  const picked = ['first.pdf', 'second.pdf'].map(name => new File(['%PDF-1.7'], name, { type: 'application/pdf' }));
  nodes(h.render(Component, props)).find(n => n.type === 'input').props.onChange({ target: { files: picked, value: '' } });
  for (let i = 0; i < 200; i++) await Promise.resolve();
  assert.match(text(h.render(Component, props)), /1 PDF enregistré/);
  assert.match(text(h.render(Component, props)), /1 envoi\(s\) à reprendre/);
  assert.match(text(h.render(Component, props)), /Technicien notifié/);
  assert.deepEqual(patches, [{ count: 1 }]); assert.equal(h.pushes.length, 1);
  fail = false;
  await nodes(h.render(Component, props)).find(n => n.type === 'button' && /Réessayer les envois/.test(text(n))).props.onClick();
  assert.equal(files.size, 2); assert.deepEqual(patches, [{ count: 1 }, { count: 1 }]);
  for (const path of files.keys()) assert.match(path, new RegExp(`^${id}/[0-9a-f-]{36}--(first|second)\\.pdf$`));
  const reopened = harness(db, { fetch: fakeFetch, FormData, crypto, Uint8Array });
  const Reopened = reopened.load('src/components/documents/ChantierDocuments.tsx').ChantierDocuments;
  reopened.render(Reopened, props); await reopened.settle();
  const tree = reopened.render(Reopened, props);
  assert.equal(nodes(tree).filter(n => n.type === 'a').length, 2);
});
test('PDF route: dépannage interventions accepted like chantiers (assigned technician reads)', async () => {
  const s = setup('technician'); s.db.tables.interventions[0].intervention_type = 'depannage';
  const key = `${token}--bon.pdf`; s.files.set(`${id}/${key}`, new File(['%PDF-1.7'], 'bon.pdf'));
  assert.equal((await s.route.GET(new Request(`${url}?key=${key}`), context)).status, 302);
  assert.equal((await s.route.POST(request(), context)).status, 403);
  const staff = setup('secretary'); staff.db.tables.interventions[0].intervention_type = 'depannage';
  assert.equal((await staff.route.POST(request(), context)).status, 200);
});
test('PDF notify (PATCH): staff only, notifies the assigned technician once, nothing without technician', async () => {
  const s = setup('secretary');
  Object.assign(s.db.tables.interventions[0], { title: 'Fuite WC', address: 'Rue 1', technician_id: 'tech9' });
  const patch = count => s.route.PATCH(new Request(url, { method: 'PATCH', body: JSON.stringify({ count }) }), context);
  assert.equal((await patch(0)).status, 400);
  const res = await patch(2); assert.equal(res.status, 200);
  const body = await res.json(); assert.equal(body.notified, true); assert.equal(body.url, `/technician/chantier/${id}`);
  const notif = s.db.tables.notifications.at(-1);
  assert.equal(notif.recipient_id, 'tech9'); assert.equal(notif.type, 'documents_added'); assert.equal(notif.reference_id, id); assert.equal(notif.title, '2 nouveaux PDF');
  s.db.tables.interventions[0].technician_id = null;
  assert.equal((await (await patch(1)).json()).notified, false);
  const tech = setup('technician');
  assert.equal((await tech.route.PATCH(new Request(url, { method: 'PATCH', body: '{"count":1}' }), context)).status, 403);
});
test('PDF from email: copies only PDFs of that email from the documents bucket', async () => {
  const SUPA = 'https://proj.supabase.co';
  const emailId = '33333333-3333-4333-8333-333333333333';
  const pdfUrl = `${SUPA}/storage/v1/object/public/documents/email-attachments/1791_0_Bon%20travail.pdf`;
  const fakeUrl = `${SUPA}/storage/v1/object/public/documents/email-attachments/1791_1_fake.pdf`;
  const db = database({ users: [{ id: 'u1', role: 'secretary', is_active: true }], interventions: [{ id, intervention_type: 'depannage', technician_id: 't' }],
    email_inbox: [{ id: emailId, attachment_urls: [pdfUrl, fakeUrl] }] }, 'u1');
  const target = new Map();
  const sources = new Map([['email-attachments/1791_0_Bon travail.pdf', new Blob(['%PDF-1.4 bon'])], ['email-attachments/1791_1_fake.pdf', new Blob(['<html>'])]]);
  db.storage = { from(bucket) {
    if (bucket === 'documents') return { async download(p) { return sources.has(p) ? { data: sources.get(p), error: null } : { data: null, error: new Error('missing') }; } };
    return memoryStorage(target).from(bucket);
  } };
  const h = harness(db, { Request, Response, Blob, Uint8Array, process: { env: { NEXT_PUBLIC_SUPABASE_URL: SUPA } } });
  const route = h.load('src/app/api/interventions/[id]/documents/from-email/route.ts');
  const call = body => route.POST(new Request(url + '/from-email', { method: 'POST', body: JSON.stringify(body) }), context);
  const ok = await call({ emailId, url: pdfUrl, token }); assert.equal(ok.status, 200);
  assert.equal((await ok.json()).document.name, 'Bon travail.pdf');
  assert.ok(target.has(`${id}/${token}--Bon travail.pdf`));
  assert.equal((await call({ emailId, url: pdfUrl, token })).status, 200); assert.equal(target.size, 1); // idempotent retry
  assert.equal((await call({ emailId, url: fakeUrl, token: crypto.randomUUID() })).status, 400); // not a real PDF
  assert.equal((await call({ emailId, url: `${SUPA}/storage/v1/object/public/documents/email-attachments/other.pdf`, token })).status, 400); // not in this email
  assert.equal((await call({ emailId, url: 'https://evil.example/x.pdf', token })).status, 400);
  assert.equal(target.size, 1);
});
test('Calendar label: name first, then work order number', () => {
  const h = harness(database());
  const { interventionLabel } = h.load('src/lib/intervention-label.ts');
  assert.equal(interventionLabel({ title: 'Fuite WC', work_order_number: '24-1187' }), 'Fuite WC · 24-1187');
  assert.equal(interventionLabel({ title: 'Fuite WC', work_order_number: null }), 'Fuite WC');
  assert.equal(interventionLabel({ title: '', work_order_number: '24-1187' }), '24-1187');
  const lib = h.load('src/lib/chantier-documents.ts');
  assert.deepEqual([...lib.emailPdfUrls(['a/x.PDF', 'a/y.png', 'a/z.pdf?t=1'])], ['a/x.PDF', 'a/z.pdf?t=1']);
  assert.equal(lib.emailAttachmentName('https://p/documents/email-attachments/1791621152000_0_Facture_12252.pdf'), 'Facture_12252.pdf');
});
