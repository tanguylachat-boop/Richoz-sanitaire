const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RICHOZ_PLAYWRIGHT_PATH);
const {createClient}=require('@supabase/supabase-js');
const config=JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS,'utf8'));assert.equal(config.API_URL,'http://127.0.0.1:56321');
const fixtures=JSON.parse(fs.readFileSync('/private/tmp/richoz-lot3b-fixtures.json','utf8'));
const app='http://127.0.0.1:56600',proof='docs/validation-lot-3b';
const original=global.fetch;global.fetch=(input,init)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.ok([app,config.API_URL].includes(u.origin));return original(input,init);};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
let browser;
async function context(actor,mobile=false){const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:960},timezoneId:'America/Los_Angeles'});await c.route('**/*',r=>[app,config.API_URL].includes(new URL(r.request().url()).origin)?r.continue():r.abort());const p=await c.newPage();await p.goto(app+'/login');await p.locator('input[type=email]').fill(actor.email);await p.locator('input[type=password]').fill(actor.password);await p.getByRole('button',{name:'Se connecter',exact:true}).click();await p.waitForURL(u=>!u.pathname.includes('/login'));return {c,p};}
async function loaded(p){await p.getByText('Dernière actualisation :',{exact:false}).waitFor();}
async function setDate(p,date){const done=p.waitForResponse(r=>r.url().includes('/api/reports/daily?')&&new URL(r.url()).searchParams.get('date')===date);await p.getByLabel('Journée',{exact:true}).fill(date);assert.equal((await done).status(),200);await loaded(p);}
async function setTech(p,id){const done=p.waitForResponse(r=>r.url().includes('/api/reports/daily?')&&new URL(r.url()).searchParams.get('technician')===id);await p.getByLabel('Technicien',{exact:true}).selectOption(id);assert.equal((await done).status(),200);await loaded(p);}
function summary(p,title){return p.getByRole('region',{name:'Synthèse de la journée'}).locator('div').filter({has:p.getByRole('heading',{name:title,exact:true})});}
async function count(table){const r=await service.from(table).select('id',{count:'exact',head:true});ok(r);assert.ok(Number.isInteger(r.count));return r.count;}
async function snapshot(){const ids=Object.values(fixtures.items).map(i=>i.id),rids=Object.values(fixtures.reports).map(r=>r.id);return {interventions:ok(await service.from('interventions').select('*').in('id',ids).order('id')),reports:ok(await service.from('reports').select('*').in('id',rids).order('id')),notifications:await count('notifications'),history:await count('report_reminder_history'),expectations:ok(await service.from('report_expectations').select('*').in('intervention_id',ids).order('intervention_id'))};}
(async()=>{
 browser=await chromium.launch({headless:true});let {c,p}=await context(fixtures.actors.secretary);
 await p.goto(app+'/reports/daily');await loaded(p);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());assert.equal(await p.getByLabel('Journée',{exact:true}).inputValue(),today);
 await setDate(p,'2034-01-31');await setTech(p,fixtures.actors.tech.id);
 assert.match(await summary(p,'Planifiées, hors annulations').innerText(),/\n4\n/);assert.match(await summary(p,'Fins datées pour ce jour').innerText(),/\n1\n/);assert.match(await summary(p,'Rapports envoyés ce jour').innerText(),/Indisponible/);
 await p.getByText('Couverture partielle :',{exact:false}).waitFor();assert.equal(await p.getByText('100 %',{exact:false}).count(),0);
 await p.screenshot({path:proof+'/desktop.png'});
 const dossier=p.locator(`a[href="/calendar?intervention=${fixtures.items.done.id}"]`).first();await dossier.click();await p.waitForURL(u=>u.pathname==='/calendar'&&u.searchParams.get('intervention')===fixtures.items.done.id);await p.getByText(fixtures.items.done.title,{exact:true}).first().waitFor();
 await p.goto(app+'/reports/daily');await loaded(p);await setDate(p,'2034-02-01');await setTech(p,fixtures.actors.tech.id);
 const reportLink=p.locator(`a[href="/reports/validate/${fixtures.reports.nextDay.id}"]`).first();await reportLink.click();await p.waitForURL(u=>u.pathname==='/reports/validate/'+fixtures.reports.nextDay.id);await p.getByText(fixtures.items.done.title,{exact:true}).first().waitFor();
 console.log('PASS browser desktop: Zurich default from another browser zone, date/technician filters, counts, coverage and exact intervention/report links');
 await p.goto(app+'/reports/daily');await loaded(p);await setDate(p,'2034-01-31');await setTech(p,fixtures.actors.tech.id);
 const before=await snapshot();
 let done=p.waitForResponse(r=>r.url().includes('/api/reports/daily?')&&new URL(r.url()).searchParams.get('date')==='2034-01-30');await p.getByRole('button',{name:'Jour précédent',exact:true}).click();await done;await loaded(p);assert.equal(await p.getByLabel('Journée',{exact:true}).inputValue(),'2034-01-30');
 await setDate(p,'2034-03-01');await p.getByText('Aucune intervention planifiée ni activité datée enregistrée',{exact:false}).waitFor();await p.getByText('Arriéré actuellement ouvert hors de cette journée',{exact:false}).click();await p.getByText('Ce n’est pas l’arriéré qui existait',{exact:false}).waitFor();
 await setDate(p,'2034-01-31');done=p.waitForResponse(r=>r.url().includes('/api/reports/daily?'));await p.getByRole('button',{name:'Actualiser',exact:true}).click();await done;await loaded(p);assert.deepEqual(await snapshot(),before);
 console.log('PASS browser previous/empty day, explicitly current backlog, refresh without business writes or reminders');
 let release,signal;const intercepted=new Promise(r=>{signal=r;});await p.route('**/api/reports/daily?**',async r=>{await new Promise(resolve=>{release=resolve;signal();});await r.continue();});
 await p.reload();await intercepted;await p.getByText('Chargement du bilan…',{exact:true}).waitFor();release();await loaded(p);await p.unroute('**/api/reports/daily?**');
 await p.route('**/api/reports/daily?**',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Erreur fictive de lecture.'})}));await p.reload();await p.getByRole('alert').getByText('Erreur fictive de lecture.').waitFor();await p.unroute('**/api/reports/daily?**');await p.getByRole('button',{name:'Réessayer',exact:true}).click();await loaded(p);
 console.log('PASS browser loading/error/retry; no stale totals displayed');await c.close();
 ({c,p}=await context(fixtures.actors.secretary,true));await p.goto(app+'/reports/daily');await loaded(p);await setDate(p,'2034-01-31');await setTech(p,fixtures.actors.other.id);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:proof+'/mobile-top.png'});
 await p.getByRole('heading',{name:/Détail des interventions/}).scrollIntoViewIfNeeded();await p.screenshot({path:proof+'/mobile-detail.png'});
 const followup=p.getByRole('link',{name:'Suivi',exact:true});await followup.scrollIntoViewIfNeeded();await followup.click();await p.waitForURL(u=>u.pathname==='/reports/followup');await p.getByRole('heading',{name:'Suivi des rapports attendus'}).waitFor();
 console.log('PASS browser mobile: navigation, filters, multiday detail and no horizontal document overflow');await c.close();
 ({c,p}=await context(fixtures.actors.tech,true));await p.goto(app+'/reports/daily');await p.getByRole('alert').getByText('Bilan réservé aux responsables et secrétaires actifs.').waitFor();assert.equal(await p.getByRole('region',{name:'Synthèse de la journée'}).count(),0);
 console.log('PASS browser technician: global daily view refused');await c.close();await browser.close();
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
