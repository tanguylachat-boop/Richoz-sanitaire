const test = require('node:test');
const assert = require('node:assert/strict');
const { File } = require('node:buffer');
const crypto = require('node:crypto');
const { harness, database, nodes, text } = require('./lot1-harness.cjs');
const owner = '11111111-1111-4111-8111-111111111111';
const interventionId = '22222222-2222-4222-8222-222222222222';
const file = (name) => new File(['synthetic-image-' + name], name + '.jpg', { type: 'image/jpeg' });
const runtime = { File, crypto, Uint8Array, URL, URLSearchParams, Set };
function store() {
  const files = new Map(); const calls = []; let failure = '', lost = false;
  return { files, calls, fail(name) { failure = name; }, loseResponse(v) { lost = v; },
    async upload(path, f) {
      calls.push(f.name);
      if (f.name === failure) return { error: new Error('offline') };
      if (files.has(path)) return { error: new Error('exists') };
      files.set(path, f);
      return lost ? { error: new Error('lost response') } : { data: { path } };
    },
    async download(path) { return files.has(path) ? { data: files.get(path) } : { error: new Error('missing') }; },
  };
}
test('Photos: five selected, remove one, append second selection, reject individual invalid images', async () => {
  const h = harness(database(), runtime);
  h.mocks['@/lib/normalize-image'] = { normalizeImage: async f => { if (f.name === 'broken.jpg') throw new Error('Image illisible'); return f; } };
  const Uploader = h.load('src/components/reports/PhotoUploader.tsx').PhotoUploader;
  const props = { interventionId, photos: [], maxPhotos: 5, onPhotosChange(p) { props.photos = p; } };
  const input = () => nodes(h.render(Uploader, props)).find(n => n.type === 'input');
  assert.equal(input().props.multiple, true);
  await input().props.onChange({ target: { files: [1,2,3,4,5].map(n => file(String(n))), value: 'x' } });
  assert.equal(props.photos.length, 5);
  assert.equal(nodes(h.render(Uploader, props)).filter(n => n.type === 'img').length, 5);
  nodes(h.render(Uploader, props)).find(n => n.props?.['aria-label'] === 'Retirer la photo 2').props.onClick();
  assert.equal(props.photos.length, 4);
  await input().props.onChange({ target: { files: [file('broken'), new File(['x'], 'bad.txt', { type: 'text/plain' }), file('second')], value: '' } });
  assert.equal(props.photos.length, 5);
  assert.equal(props.photos.at(-1).file.name, 'second.jpg');
  assert.equal(props.photos[0].file.name, '1.jpg');
  assert.equal(h.notices.filter(n => n.type === 'error').length, 2);
  assert.ok(h.notices.some(n => /Enregistrez le rapport/.test(n.message)));
});
test('Photos: concurrent selection cannot overwrite the pending batch; size/type validated', async () => {
  const h = harness(database(), runtime); let release;
  h.mocks['@/lib/normalize-image'] = { normalizeImage: f => new Promise(resolve => { release = () => resolve(f); }) };
  const Uploader = h.load('src/components/reports/PhotoUploader.tsx').PhotoUploader;
  const props = { photos: [], onPhotosChange(p) { props.photos = p; } };
  const handler = nodes(h.render(Uploader, props)).find(n => n.type === 'input').props.onChange;
  const first = handler({ target: { files: [file('first')], value: '' } });
  await handler({ target: { files: [file('second')], value: '' } });
  release(); await first; assert.equal(props.photos.length, 1); assert.equal(props.photos[0].file.name, 'first.jpg');
  const { validatePhoto } = h.load('src/lib/report-photos.ts');
  assert.throws(() => validatePhoto({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }), /10 Mio/);
  assert.throws(() => validatePhoto({ type: 'image/svg+xml', size: 20 }), /Format/);
});
test('Photos: partial upload, retained successes, stable paths, retry without duplicates (mock storage)', async () => {
  const h = harness(database(), runtime); const { uploadReportPhotos } = h.load('src/lib/report-photos.ts');
  const storage = store(); storage.fail('2.jpg');
  let photos = [1,2,3].map(n => ({ url: 'blob:' + n, file: file(String(n)), isLocal: true }));
  const update = p => { photos = p; };
  let result = await uploadReportPhotos(photos, 'before', owner, interventionId, storage, update);
  assert.equal(result.failed, 1); assert.equal(storage.files.size, 2);
  assert.equal(photos[0].uploaded, true); assert.match(photos[1].error, /échoué/); assert.equal(photos[2].uploaded, true);
  const path = photos[1].uploadPath;
  storage.fail(''); result = await uploadReportPhotos(photos, 'before', owner, interventionId, storage, update);
  assert.equal(result.failed, 0); assert.equal(storage.files.size, 3); assert.equal(photos[1].uploadPath, path);
  assert.deepEqual(storage.calls, ['1.jpg', '2.jpg', '3.jpg', '2.jpg']);
  assert.match(result.photos[0].url, /^\/api\/report-photos\?/);
});
test('Photos: lost storage response recovered by comparing bytes', async () => {
  const h = harness(database(), runtime); const { uploadReportPhotos } = h.load('src/lib/report-photos.ts');
  const storage = store(); storage.loseResponse(true); let state;
  const result = await uploadReportPhotos([{ url: 'blob:1', file: file('1'), isLocal: true }], 'after', owner, interventionId, storage, p => state = p);
  assert.equal(result.failed, 0); assert.equal(storage.files.size, 1); assert.equal(state[0].uploaded, true);
});
test('Report handlers: partial failure + database failure + retry + reopen preserve existing photos, captions and text', async () => {
  const report = { id: 'r1', intervention_id: interventionId, technician_id: owner, status: 'draft', photos: [{ url: 'https://example.invalid/legacy.jpg', caption: 'Légende test', category: 'before' }], text_content: 'Texte fictif intact' };
  const errors = {}; const db = database({ reports: [report] }, owner, errors); const storage = store();
  db.storage = { from: () => storage };
  const h = harness(db, runtime); const Form = h.load('src/components/reports/ReportForm.tsx').ReportForm;
  const props = { intervention: { id: interventionId }, existingReport: report, technicianId: owner, products: [] };
  const tree = () => h.render(Form, props);
  const uploader = () => nodes(tree()).find(n => n.type === 'PhotoUploader');
  const save = () => nodes(tree()).find(n => n.type === 'button' && /brouillon/i.test(text(n))).props.onClick();
  uploader().props.onPhotosChange([...uploader().props.photos, ...[1,2,3].map(n => ({ url: 'blob:' + n, file: file(String(n)), isLocal: true }))]);
  storage.fail('2.jpg'); await save();
  assert.equal(report.photos.length, 1); assert.equal(report.text_content, 'Texte fictif intact');
  assert.equal(uploader().props.photos.length, 4); assert.match(h.notices.at(-1).message, /restent à envoyer/);
  storage.fail(''); errors.reports = { message: 'denied' }; await save();
  assert.equal(storage.files.size, 3); assert.equal(report.photos.length, 1);
  delete errors.reports; await save();
  assert.equal(report.photos.length, 4); assert.equal(report.photos[0].caption, 'Légende test');
  assert.equal(report.text_content, 'Texte fictif intact'); assert.equal(storage.calls.length, 4);
  const reopened = harness(db, runtime); const ReopenedForm = reopened.load('src/components/reports/ReportForm.tsx').ReportForm;
  const reopenedPhotos = nodes(reopened.render(ReopenedForm, props)).find(n => n.type === 'PhotoUploader').props.photos;
  assert.equal(reopenedPhotos.length, 4); assert.equal(reopenedPhotos[1].isLocal, undefined);
  assert.match(reopenedPhotos[1].url, /^\/api\/report-photos\?/);
});
test('Private photo route: owner/staff allowed, other technician, anonymous and traversal denied (mock storage)', async () => {
  const path = `${owner}/reports/${interventionId}/before/${crypto.randomUUID()}.jpg`;
  const db = database({ users: [{ id: owner, role: 'technician', is_active: true }] }, owner);
  db.tables.reports = [{ technician_id: owner, intervention_id: interventionId, photos: [{ url: `/api/report-photos?path=${encodeURIComponent(path)}` }] }];
  db.storage = { from: () => ({ download: async () => ({ data: file('1') }) }) };
  const h = harness(db, { ...runtime, Response, Request }); const route = h.load('src/app/api/report-photos/route.ts');
  const req = () => new Request(`http://localhost/api/report-photos?path=${encodeURIComponent(path)}`);
  assert.equal((await route.GET(req())).status, 200);
  db.auth.getUser = async () => ({ data: { user: { id: 'other' } } }); db.tables.users = [{ id: 'other', role: 'technician', is_active: true }];
  assert.equal((await route.GET(req())).status, 403);
  db.tables.users[0].role = 'secretary'; assert.equal((await route.GET(req())).status, 200);
  db.auth.getUser = async () => ({ data: { user: null } }); assert.equal((await route.GET(req())).status, 401);
  assert.equal((await route.GET(new Request('http://localhost/api/report-photos?path=../../secret'))).status, 400);
});
test('DOCX neighbor: private photos resolved to bytes and foreign attachment rejected (mock storage, no conversion)', async () => {
  const path = `${owner}/reports/${interventionId}/before/${crypto.randomUUID()}.jpg`;
  const url = `/api/report-photos?path=${encodeURIComponent(path)}`;
  const report = { id: 'r1', technician_id: owner, intervention_id: interventionId, photos: [{ url, category: 'before', caption: 'Test' }] };
  const db = database({ reports: [report] }); let reads = 0;
  db.storage = { from: () => ({ download: async () => { reads++; return { data: file('1') }; } }) };
  const h = harness(db, { ...runtime, Buffer });
  h.mocks['next/server'] = {};
  h.mocks['@/lib/supabase/admin'] = { createClient: () => db };
  h.mocks['@/lib/generate-report-docx'] = {};
  h.mocks['@/lib/docx/chantier'] = {};
  h.mocks['@/lib/docx/convert'] = {};
  const { fetchReport } = h.load('src/app/api/reports/[id]/docx/route.ts');
  const resolved = await fetchReport('r1');
  assert.match(resolved.photos[0].url, /^data:image\/jpeg;base64,/);
  assert.equal(resolved.photos[0].caption, 'Test'); assert.equal(reads, 1);
  report.photos = [{ url }]; report.technician_id = 'other';
  await assert.rejects(fetchReport('r1'), /non rattachée/); assert.equal(reads, 1);
});
