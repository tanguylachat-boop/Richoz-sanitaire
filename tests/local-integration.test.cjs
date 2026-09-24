// Real local Supabase + Next HTTP tests. Never load application .env files.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { File } = require('node:buffer');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient, serialize } = require('@supabase/ssr');
const ts = require('typescript');
const config = JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS, 'utf8'));
assert.equal(config.API_URL, 'http://127.0.0.1:56321');
const app = 'http://127.0.0.1:56300';
const originalFetch = global.fetch;
global.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.ok([config.API_URL, app].includes(url.origin), `Non-local request rejected: ${url.origin}`);
  return originalFetch(input, init);
};
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const provision = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const actors = {}, ids = {}, run = crypto.randomUUID();
let site, foreignSite, png;
const unwrap = result => { assert.equal(result.error, null, result.error?.message); return result.data; };
async function login(actor) {
  const cookies = {};
  const db = createServerClient(config.API_URL, config.ANON_KEY, {
    auth: { autoRefreshToken: false },
    cookies: { get: name => cookies[name], set: (name, value) => { cookies[name] = value; }, remove: name => { delete cookies[name]; } },
  });
  unwrap(await db.auth.signInWithPassword({ email: actor.email, password: actor.password }));
  return { ...actor, db, cookies, header: () => Object.entries(cookies).map(([k,v]) => serialize(k,v)).join('; ') };
}
async function api(actor, path, init = {}) {
  return fetch(app+path, { redirect: 'manual', ...init, headers: { ...(actor ? { Cookie: actor.header() } : {}), ...init.headers } });
}
async function makeReport() {
  return unwrap(await actors.tech.db.from('reports').insert({ intervention_id: site.id, technician_id: ids.tech, text_content: 'Texte fictif conservé', status: 'draft' }).select().single());
}
async function assertDenied(db, id, values) {
  const before = unwrap(await actors.secretary.db.from('reports').select('*').eq('id',id).single());
  const result = await db.from('reports').update(values).eq('id',id).select();
  assert.ok(result.error || result.data.length === 0, 'Unauthorized update unexpectedly succeeded');
  const after = unwrap(await actors.secretary.db.from('reports').select('*').eq('id',id).single());
  assert.deepEqual(after,before);
}
function loadPure(file) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { module, exports: module.exports, crypto, URLSearchParams, Uint8Array, Error, Intl, Date });
  return module.exports;
}
before(async () => {
  png = await require('sharp')({ create: { width: 24, height: 24, channels: 3, background: '#2876ad' } }).png().toBuffer();
  for (const [name,role,active] of [['admin','admin',true],['secretary','secretary',true],['tech','technician',true],['other','technician',true],['inactive','admin',false]]) {
    const actor = { email: `${name}-${run}@example.invalid`, password: 'Local-fictitious-2026!' };
    const { user } = unwrap(await provision.auth.admin.createUser({ ...actor, email_confirm: true }));
    ids[name] = user.id;
    unwrap(await provision.from('users').insert({ id: user.id, email: actor.email, first_name: `Test ${name}`, last_name: 'Fictif', role, is_active: active }));
    actors[name] = await login(actor);
  }
  site = unwrap(await actors.secretary.db.from('interventions').insert({ title: `Chantier fictif ${run}`, address: 'Adresse de test', technician_id: ids.tech, intervention_type: 'chantier', status:'planifie' }).select().single());
  foreignSite = unwrap(await actors.secretary.db.from('interventions').insert({ title: `Autre chantier fictif ${run}`, address: 'Adresse de test', technician_id: ids.other, intervention_type:'chantier' }).select().single());
  // Persist only fictitious fixture/session data outside the repository for browser acceptance.
  fs.writeFileSync('/private/tmp/richoz-browser-fixtures.json', JSON.stringify({ actors: Object.fromEntries(Object.entries(actors).map(([k,a])=>[k,{email:a.email,password:a.password,id:ids[k]}])), site, foreignSite }));
});
after(() => { for (const actor of Object.values(actors)) actor.db.auth.stopAutoRefresh(); });

test('real reports: return, reconnect, correct draft, resubmit, secretary rereads historical feedback', async () => {
  const report = await makeReport();
  unwrap(await actors.tech.db.from('reports').update({ status:'submitted', revision_requested:false }).eq('id',report.id).select().single());
  const feedback = 'Retour fictif du secrétariat\nCorriger le texte et conserver les photos.';
  unwrap(await actors.secretary.db.from('reports').update({ status:'rejected', revision_requested:true, revision_message:feedback }).eq('id',report.id).select().single());
  const session = await login(actors.tech);
  const read = unwrap(await session.db.from('reports').select('*').eq('id',report.id).single());
  assert.equal(read.revision_message,feedback);
  unwrap(await session.db.from('reports').update({ status:'draft', text_content:'Texte fictif corrigé' }).eq('id',report.id).select().single());
  await assertDenied(session.db, report.id, { revision_requested:false });
  unwrap(await session.db.from('reports').update({ status:'submitted', revision_requested:false }).eq('id',report.id).select().single());
  const staff = unwrap(await actors.secretary.db.from('reports').select('*').eq('id',report.id).single());
  assert.equal(staff.status,'submitted'); assert.equal(staff.revision_requested,false); assert.equal(staff.revision_message,feedback); assert.equal(staff.text_content,'Texte fictif corrigé');
  await assertDenied(session.db,report.id,{text_content:'Edit after submission'});
});

test('real reports: direct API rejects ownership, reassignment, feedback and validator forgery, invalid states', async () => {
  const r=await makeReport();
  unwrap(await actors.secretary.db.from('reports').update({status:'rejected',revision_requested:true,revision_message:'Retour fictif'}).eq('id',r.id).select().single());
  for (const values of [{ technician_id:ids.other }, { intervention_id:foreignSite.id }, { revision_message:'Faux commentaire' },
    { validated_by:ids.tech },{ validated_at:new Date().toISOString() }, { status:'validated' },{status:null}, {docx_url:'fake'},{pdf_url:'fake'}]) {
    await assertDenied(actors.tech.db,r.id,values);
  }
  await assertDenied(actors.other.db,r.id,{ text_content:'Intrusion' });
  await assertDenied(actors.inactive.db,r.id,{ text_content:'Inactive' });
  const empty=unwrap(await actors.other.db.from('reports').select('*').eq('id',r.id));assert.equal(empty.length,0);
  const invalid=await actors.tech.db.from('reports').insert({intervention_id:foreignSite.id,technician_id:ids.tech,status:'draft'});assert.ok(invalid.error);
  const forged=await actors.tech.db.from('reports').insert({intervention_id:site.id,technician_id:ids.tech,status:'validated',validated_by:ids.tech});assert.ok(forged.error);
  unwrap(await actors.tech.db.from('reports').update({status:'submitted',revision_requested:false}).eq('id',r.id).select().single());
  const validated=unwrap(await actors.secretary.db.from('reports').update({status:'validated'}).eq('id',r.id).select().single());
  assert.equal(validated.validated_by,ids.secretary);assert.ok(validated.validated_at);
  await assertDenied(actors.tech.db,r.id,{text_content:'Edit validated'});
  unwrap(await actors.admin.db.from('reports').update({text_content:'Correction administrative fictive'}).eq('id',r.id).select().single());
});

test('real notifications: correct recipient after reconnect; forged recipient/body updates refused',async()=>{
 unwrap(await actors.secretary.db.from('notifications').insert({recipient_id:ids.tech,title:'Retour fictif',message:'Commentaire ciblé',type:'revision_requested',reference_id:site.id,reference_type:'intervention'}));
 // Staff cannot read another recipient's notification; validate with the recipient session.
 const session=await login(actors.tech);const rows=unwrap(await session.db.from('notifications').select('*').eq('title','Retour fictif'));assert.equal(rows.length,1);
 assert.equal(rows[0].user_id,ids.tech);assert.equal(rows[0].sender_id,ids.secretary);
 assert.equal(unwrap(await actors.other.db.from('notifications').select('*').eq('id',rows[0].id)).length,0);
 assert.ok((await session.db.from('notifications').update({message:'Forged'}).eq('id',rows[0].id)).error);
 unwrap(await session.db.from('notifications').update({is_read:true}).eq('id',rows[0].id).select().single());
});

test('real PDF HTTP + Storage: multiple, reconnect, owner access, direct denial, retry and deletion', async () => {
 const route=`/api/interventions/${site.id}/documents`;const stored=[];
 for (const name of ['premier.pdf','second.pdf']) {
   const token=crypto.randomUUID();const bytes=require('./local-fixtures.cjs').pdfFixture();
   const post=()=>{const body=new FormData();body.set('token',token);body.set('file',new File([bytes],name,{type:'application/pdf'}));return api(actors.secretary,route,{method:'POST',body});};
   let response=await post();assert.equal(response.status,200,await response.clone().text());const {document}=await response.json();stored.push(document);
   response=await post();assert.equal(response.status,200); // Lost-success response simulated by repeating the same immutable token.
 }
 const session=await login(actors.secretary);const list=await api(session,route);assert.equal((await list.json()).documents.length,2);
 assert.equal(unwrap(await session.db.storage.from('chantier-documents').list(site.id)).length,2);
 const key=stored[0].key;
 assert.equal((await api(actors.tech,route+'?key='+encodeURIComponent(key))).status,200);
 assert.ok((await actors.tech.db.storage.from('chantier-documents').download(`${site.id}/${key}`)).data);
 for (const actor of [null,actors.other,actors.inactive]) {
  assert.ok([401,403].includes((await api(actor,route)).status));
  assert.ok([401,403].includes((await api(actor,route+'?key='+encodeURIComponent(key))).status));
 }
 assert.ok((await actors.other.db.storage.from('chantier-documents').download(`${site.id}/${key}`)).error);
 assert.equal(unwrap(await actors.other.db.storage.from('chantier-documents').list(site.id)).length,0);
 const anon=createClient(config.API_URL,config.ANON_KEY,options);
 assert.ok((await anon.storage.from('chantier-documents').download(`${site.id}/${key}`)).error);
 assert.ok((await actors.tech.db.storage.from('chantier-documents').upload(`${site.id}/${crypto.randomUUID()}--intrusion.pdf`,Buffer.from('%PDF'),{contentType:'application/pdf'})).error);
 assert.equal((await api(actors.tech,`/api/interventions/${foreignSite.id}/documents?key=${key}`)).status,403);
 assert.equal((await api(actors.tech,route+'?key='+key,{method:'DELETE'})).status,403);
 const bad=new FormData();bad.set('token',crypto.randomUUID());bad.set('file',new File(['bad'],'invalid.pdf',{type:'application/pdf'}));assert.equal((await api(session,route,{method:'POST',body:bad})).status,400);
 assert.equal((await api(session,route+'?key='+key,{method:'DELETE'})).status,200);
 assert.ok((await session.db.storage.from('chantier-documents').download(`${site.id}/${key}`)).error);
 assert.equal(unwrap(await session.db.storage.from('chantier-documents').list(site.id)).length,1);
});

test('real photos: partial upload failure, retry, persisted report, reconnect and direct Storage rights', async () => {
 const r=await makeReport();const helper=loadPure('src/lib/report-photos.ts');const storage=actors.tech.db.storage.from('photos');
 let photos=[1,2,3].map(i=>({url:`blob:test${i}`,file:new File([png],`${i}.png`,{type:'image/png'}),isLocal:true}));
 let fail=true;const bucket={upload:(path,file,opts)=>fail&&file.name==='2.png'?Promise.resolve({error:new Error('Injected local failure')}):storage.upload(path,file,opts),download:path=>storage.download(path)};
 let result=await helper.uploadReportPhotos(photos,'before',ids.tech,site.id,bucket,p=>{photos=p;});assert.equal(result.failed,1);
 const successful=photos.filter(p=>p.uploaded).map(p=>p.uploadPath);assert.equal(successful.length,2);
 fail=false;result=await helper.uploadReportPhotos(photos,'before',ids.tech,site.id,bucket,p=>{photos=p;});assert.equal(result.failed,0);
 assert.deepEqual(photos.filter(p=>successful.includes(p.uploadPath)).map(p=>p.uploadPath),successful);
 unwrap(await actors.tech.db.from('reports').update({photos:result.photos}).eq('id',r.id).select().single());
 const session=await login(actors.tech);const read=unwrap(await session.db.from('reports').select('*').eq('id',r.id).single());assert.equal(read.photos.length,3);assert.equal(read.text_content,'Texte fictif conservé');
 for(const photo of read.photos){assert.equal((await api(session,photo.url)).status,200);assert.equal((await api(actors.secretary,photo.url)).status,200);assert.equal((await api(actors.other,photo.url)).status,403);}
 const path=photos[0].uploadPath;assert.ok((await actors.other.db.storage.from('photos').download(path)).error);
 assert.ok((await actors.other.db.storage.from('photos').upload(`${ids.tech}/reports/${site.id}/before/${crypto.randomUUID()}.jpg`,png,{contentType:'image/png'})).error);
 assert.ok((await actors.inactive.db.storage.from('photos').download(path)).error);
 const objects=unwrap(await storage.list(`${ids.tech}/reports/${site.id}/before`));assert.equal(objects.length,3);
});

test('real date persistence: Zurich winter/summer near midnight survives reconnect', async()=>{
 const helper=loadPure('src/lib/intervention-dates.ts');
 // UTC values correspond to 00:15 in Zurich in winter (UTC+1) and summer (UTC+2).
 for(const iso of ['2026-01-14T23:15:00.000Z','2026-07-14T22:15:00.000Z']){
  unwrap(await actors.secretary.db.from('interventions').update({date_planned:iso,date_end:new Date(Date.parse(iso)+3600000).toISOString()}).eq('id',site.id).select().single());
  const session=await login(actors.secretary);const row=unwrap(await session.db.from('interventions').select('date_planned,date_end').eq('id',site.id).single());
  assert.equal(Date.parse(row.date_planned),Date.parse(iso));assert.equal(Date.parse(row.date_end)-Date.parse(row.date_planned),3600000);
  assert.match(new Intl.DateTimeFormat('fr-CH',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(row.date_planned)),/00:15/);
 }
});

test('real HTTP stats: active admin allowed, secretary/technician/inactive/anonymous denied',async()=>{
 for(const [name,actor] of [['admin',actors.admin],['secretary',actors.secretary],['tech',actors.tech],['inactive',actors.inactive],['anonymous',null]]){
  const response=await api(actor,'/admin/stats');const body=await response.text();
  if(name==='admin'){assert.equal(response.status,200);assert.ok(body.includes('Statistiques'));}
  else {assert.ok(response.status>=300 || body.includes('NEXT_REDIRECT') || body.includes('NEXT_NOT_FOUND') || body.includes('Accès réservé aux administrateurs.'),`${name}: ${response.status}`); if (response.status===200) assert.match(body, /role="alert"[^>]*>Accès réservé aux administrateurs\./);}
 }
});
