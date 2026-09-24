// Real Chromium acceptance against the compiled local application only.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {chromium}=require(process.env.RICHOZ_PLAYWRIGHT_PATH);
const settings=JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS,'utf8'));
assert.equal(settings.API_URL,'http://127.0.0.1:56321');
const fixtures=JSON.parse(fs.readFileSync('/private/tmp/richoz-browser-fixtures.json','utf8'));
const app='http://127.0.0.1:56300';const logs=[];let browser,page;
const unwrap=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
async function dbFor(actor){const db=createClient(settings.API_URL,settings.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});unwrap(await db.auth.signInWithPassword(actor));return db;}
async function context(){const c=await browser.newContext({viewport:{width:1280,height:900}});await c.route('**/*',route=>{const url=new URL(route.request().url());return [app,settings.API_URL].includes(url.origin)||url.protocol==='data:'?route.continue():route.abort('blockedbyclient');});return c;}
async function login(c,actor){const p=await c.newPage();await p.goto(app+'/login');await p.locator('input[type=email]').fill(actor.email);await p.locator('input[type=password]').fill(actor.password);await p.getByRole('button',{name:'Se connecter',exact:true}).click();await p.waitForURL(url=>!url.pathname.includes('/login'));return p;}
async function waitReport(db,id,predicate){for(let i=0;i<100;i++){const r=unwrap(await db.from('reports').select('*').eq('id',id).single());if(predicate(r))return r;await new Promise(r=>setTimeout(r,100));}throw new Error('Persisted report condition not reached');}
async function step(name,fn){await fn();logs.push(name);console.log('PASS '+name);}
(async()=>{
 browser=await chromium.launch({headless:true});
 const secretary=await dbFor(fixtures.actors.secretary),tech=await dbFor(fixtures.actors.tech);
 const site=unwrap(await secretary.from('interventions').insert({title:'Navigateur fictif '+crypto.randomUUID(),address:'Adresse fictive navigateur',technician_id:fixtures.actors.tech.id,intervention_type:'chantier',status:'planifie'}).select().single());
 const png=await require('sharp')({create:{width:40,height:30,channels:3,background:'#42a56a'}}).png().toBuffer();
 const oldPath=`${fixtures.actors.tech.id}/reports/${site.id}/before/${crypto.randomUUID()}.jpg`;
 unwrap(await tech.storage.from('photos').upload(oldPath,png,{contentType:'image/png'}));
 const oldUrl='/api/report-photos?path='+encodeURIComponent(oldPath);
 const report=unwrap(await tech.from('reports').insert({intervention_id:site.id,technician_id:fixtures.actors.tech.id,status:'draft',text_content:'Texte initial fictif à préserver',photos:[{url:oldUrl,category:'before',caption:'Photo existante'}]}).select().single());
 const reportUrl=`/technician/report/${site.id}?reportId=${report.id}`;
 let techContext=await context();page=await login(techContext,fixtures.actors.tech);
 await step('photos: real multiple selection, remove and second selection retain text/old photo',async()=>{
  await page.goto(app+reportUrl);await page.getByRole('button',{name:'Brouillon',exact:true}).waitFor();
  const input=page.locator('input[type=file]').first();
  await input.setInputFiles([1,2,3].map(i=>({name:`photo-${i}.png`,mimeType:'image/png',buffer:png})));
  await page.getByRole('button',{name:'Retirer la photo 4',exact:true}).waitFor();
  await page.getByRole('button',{name:'Retirer la photo 2',exact:true}).click();
  await input.setInputFiles([{name:'seconde-selection.png',mimeType:'image/png',buffer:png}]);
  await page.getByRole('button',{name:'Retirer la photo 4',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Retirer la photo/}).count(),4);
  await page.locator('textarea').first().fill('Texte fictif conservé après deux sélections');
 });
 await step('photos: actual browser transport failure then retry, no duplicate Storage objects',async()=>{
  let uploads=0;const pattern='**/storage/v1/object/photos/**';
  await techContext.route(pattern,route=>{if(route.request().method()==='POST'&&++uploads===2)return route.abort('failed');return route.continue();});
  await page.getByRole('button',{name:'Brouillon',exact:true}).click();
  await page.getByText(/photo\(s\) restent à envoyer/).first().waitFor();
  assert.equal(unwrap(await tech.from('reports').select('text_content').eq('id',report.id).single()).text_content,'Texte initial fictif à préserver');
  await techContext.unroute(pattern);
  await page.getByRole('button',{name:'Brouillon',exact:true}).click();
  const persisted=await waitReport(tech,report.id,r=>r.photos.length===4&&r.text_content==='Texte fictif conservé après deux sélections');
  assert.ok(persisted.photos.some(p=>p.url===oldUrl&&p.caption==='Photo existante'));
  assert.equal(unwrap(await tech.storage.from('photos').list(`${fixtures.actors.tech.id}/reports/${site.id}/before`)).length,4);
 });
 await step('photos: new browser session reopens saved text and four decoded images',async()=>{
  await techContext.close();techContext=await context();page=await login(techContext,fixtures.actors.tech);
  await page.goto(app+reportUrl);await page.getByRole('button',{name:'Retirer la photo 4',exact:true}).waitFor();
  assert.equal(await page.locator('textarea').first().inputValue(),'Texte fictif conservé après deux sélections');
  await page.waitForFunction(()=>[...document.querySelectorAll('img[alt^="Photo "]')].length===4&&[...document.querySelectorAll('img[alt^="Photo "]')].every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:'docs/validation-lots-1-2a/correction/browser-photos.png',fullPage:true});
 });
 await page.getByRole('button',{name:'Soumettre',exact:true}).click();await waitReport(tech,report.id,r=>r.status==='submitted');
 const staffContext=await context();const staffPage=await login(staffContext,fixtures.actors.secretary);
 await step('reports: secretary returns via UI; technician reconnects, corrects and resubmits',async()=>{
  page=staffPage;await page.goto(app+`/reports/validate/${report.id}`);
  await page.getByRole('button',{name:/Demander/}).click();
  await page.getByPlaceholder("Ex: Merci d'ajouter des photos avant/après...").fill('Retour fictif navigateur\nPréciser le travail effectué.');
  await page.getByRole('button',{name:'Envoyer',exact:true}).click();await waitReport(tech,report.id,r=>r.status==='rejected');
  await techContext.close();techContext=await context();page=await login(techContext,fixtures.actors.tech);await page.goto(app+reportUrl);
  await page.getByRole('region',{name:'Retour du secrétariat'}).getByText('Retour fictif navigateur',{exact:false}).waitFor();
  await page.locator('textarea').first().fill('Texte fictif corrigé après retour navigateur');
  await page.getByRole('button',{name:'Soumettre',exact:true}).click();await waitReport(tech,report.id,r=>r.status==='submitted'&&r.revision_requested===false);
  await page.goto(app+reportUrl);await page.getByText('Dernier commentaire du secrétariat (historique)',{exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('img[alt^="Photo "]')].length===4&&[...document.querySelectorAll('img[alt^="Photo "]')].every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:'docs/validation-lots-1-2a/correction/browser-history.png',fullPage:true});
  await staffPage.goto(app+`/reports/validate/${report.id}`);await staffPage.getByPlaceholder('Aucune description fournie').waitFor();
  assert.equal(await staffPage.getByPlaceholder('Aucune description fournie').inputValue(),'Texte fictif corrigé après retour navigateur');
 });
 await step('PDF: browser multi-file failure/retry, reconnect, technician download and staff delete',async()=>{
  page=staffPage;await page.goto(app+`/chantiers/${site.id}`);
  const documents=page.getByRole('region',{name:'Documents du chantier'});const input=documents.locator('input[type=file]');await input.waitFor();
  let count=0;const pattern=`**/api/interventions/${site.id}/documents`;
  await staffContext.route(pattern,route=>route.request().method()==='POST'&&++count===2?route.abort('failed'):route.continue());
  const pdf=require('./local-fixtures.cjs').pdfFixture();
  await input.setInputFiles(['navigateur-un.pdf','navigateur-deux.pdf'].map(name=>({name,mimeType:'application/pdf',buffer:pdf})));
  await documents.getByRole('button',{name:'Réessayer les envois restants'}).waitFor();await staffContext.unroute(pattern);
  await documents.getByRole('button',{name:'Réessayer les envois restants'}).click();await documents.getByRole('link',{name:'navigateur-deux.pdf',exact:true}).waitFor();
  assert.equal(unwrap(await secretary.storage.from('chantier-documents').list(site.id)).length,2);
  await page.reload();await documents.getByRole('link',{name:'navigateur-un.pdf',exact:true}).waitFor();
  const newStaffContext=await context();const reconnected=await login(newStaffContext,fixtures.actors.secretary);await reconnected.goto(app+`/chantiers/${site.id}`);await reconnected.getByRole('link',{name:'navigateur-un.pdf',exact:true}).waitFor();
  page=await techContext.newPage();await page.goto(app+`/technician/chantier/${site.id}`);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'navigateur-un.pdf',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'navigateur-un.pdf');
  await download.saveAs('docs/validation-lots-1-2a/correction/downloaded-fixture.pdf');
  await reconnected.getByRole('button',{name:'Supprimer navigateur-un.pdf',exact:true}).click();
  await reconnected.getByRole('link',{name:'navigateur-un.pdf',exact:true}).waitFor({state:'detached'});
  assert.equal(unwrap(await secretary.storage.from('chantier-documents').list(site.id)).length,1);
  await newStaffContext.close();
 });
 await step('stats: real browser allows active admin and refuses secretary/technician',async()=>{
  for(const role of ['admin','secretary','tech']){const c=await context();page=await login(c,fixtures.actors[role]);await page.goto(app+'/admin/stats');
   if(role==='admin'){await page.getByRole('heading',{name:'Statistiques RH',exact:true}).waitFor();await page.getByText('Chargement des statistiques RH…',{exact:true}).waitFor({state:'detached'});assert.equal(await page.getByRole('alert').filter({hasText:/Impossible de charger|Accès réservé/}).count(),0);}
   else await page.getByRole('alert').getByText('Accès réservé aux administrateurs.',{exact:true}).waitFor();
   await c.close();
  }
 });
 await browser.close();console.log(JSON.stringify({passed:logs.length,steps:logs}));
})().catch(async error=>{console.error(error);if(page&&!page.isClosed()){await page.screenshot({path:'docs/validation-lots-1-2a/correction/browser-failure.png',fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-5000));}if(browser)await browser.close();process.exitCode=1;});
