// Chromium UI uses simulated recognition; authentication, saving and reopening use local Supabase.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {chromium}=require(process.env.RICHOZ_PLAYWRIGHT_PATH);
const settings=JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS,'utf8'));
assert.equal(settings.API_URL,'http://127.0.0.1:56321');
const fixtures=JSON.parse(fs.readFileSync('/private/tmp/richoz-browser-fixtures.json','utf8'));
const app='http://127.0.0.1:56400';let browser;
const unwrap=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
async function dbFor(actor){const db=createClient(settings.API_URL,settings.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});unwrap(await db.auth.signInWithPassword(actor));return db;}
async function context(supported=true){const c=await browser.newContext();await c.route('**/*',route=>[app,settings.API_URL].includes(new URL(route.request().url()).origin)?route.continue():route.abort());await c.addInitScript(supported=>{
 window.fakeInstances=[];
 class Recognition {start(){window.fakeInstances.push(this);this.onstart?.();}stop(){this.stopped=true;}abort(){this.aborted=true;}}
 window.SpeechRecognition=supported?Recognition:undefined;window.webkitSpeechRecognition=undefined;
 },supported);return c;}
async function login(c){const p=await c.newPage();await p.goto(app+'/login');await p.locator('input[type=email]').fill(fixtures.actors.tech.email);await p.locator('input[type=password]').fill(fixtures.actors.tech.password);await p.getByRole('button',{name:'Se connecter',exact:true}).click();await p.waitForURL(url=>!url.pathname.includes('/login'));return p;}
async function emit(p,parts){await p.evaluate(parts=>{const r=window.fakeInstances.at(-1);r.onresult?.({resultIndex:0,results:parts.map(([transcript,isFinal=true])=>({0:{transcript},isFinal}))});},parts);}
async function end(p){await p.evaluate(()=>window.fakeInstances.at(-1).onend?.());}
(async()=>{
 browser=await chromium.launch({headless:true});
 const secretary=await dbFor(fixtures.actors.secretary),tech=await dbFor(fixtures.actors.tech);
 const site=unwrap(await secretary.from('interventions').insert({title:'Dictée fictive '+crypto.randomUUID(),address:'Adresse de démonstration',technician_id:fixtures.actors.tech.id,intervention_type:'depannage',status:'planifie'}).select().single());
 const photoPath=`${fixtures.actors.tech.id}/reports/${site.id}/before/${crypto.randomUUID()}.jpg`;
 const png=await require('sharp')({create:{width:20,height:20,channels:3,background:'#458955'}}).png().toBuffer();
 unwrap(await tech.storage.from('photos').upload(photoPath,png,{contentType:'image/png'}));
 const photos=[{url:'/api/report-photos?path='+encodeURIComponent(photoPath),category:'before',caption:'Photo fictive conservée'}];
 const report=unwrap(await tech.from('reports').insert({intervention_id:site.id,technician_id:fixtures.actors.tech.id,status:'draft',text_content:'Texte initial fictif',photos,supplies_text:'Joint de démonstration',work_duration_minutes:75,is_billable:false,billable_reason:'Exercice'}).select().single());
 const url=app+`/technician/report/${site.id}?reportId=${report.id}`;
 let c=await context(),p=await login(c);await p.goto(url);
 const button=name=>p.getByRole('button',{name,exact:true});const description=()=>p.locator('textarea').first();
 await button('Dicter').click();await emit(p,[['Premier passage']]);
 await description().fill('Texte manuel pendant dictée');await p.getByRole('textbox',{name:'Transcription à relire'}).fill('Premier passage corrigé');
 await emit(p,[['Premier passage'],['oui'],['oui']]);await emit(p,[['Premier passage'],['oui'],['oui']]);
 assert.equal(await p.getByRole('textbox',{name:'Transcription à relire'}).inputValue(),'Premier passage corrigé oui oui');
 await button('Arrêter').click();await emit(p,[['Premier passage'],['oui'],['oui'],['fin']]);await end(p);
 await p.getByRole('textbox',{name:'Transcription à relire'}).fill('Passage relu et corrigé.');
 await button('Ajouter au rapport').evaluate(b=>{b.click();b.click();});
 assert.equal(await description().inputValue(),'Texte manuel pendant dictée\n\nPassage relu et corrigé.');
 console.log('PASS simulated: manual edit, review, repeated deliveries, spoken repetitions, final after stop, double add');
 await button('Dicter').click();await emit(p,[['Deuxième dictée.']]);await button('Arrêter').click();await end(p);await button('Ajouter au rapport').click();
 const expected='Texte manuel pendant dictée\n\nPassage relu et corrigé.\n\nDeuxième dictée.';
 assert.equal(await description().inputValue(),expected);
 await button('Dicter').click();await emit(p,[['Annuler ce passage']]);await p.evaluate(()=>window.late=window.fakeInstances.at(-1).onresult);await button('Annuler').click();
 await p.evaluate(()=>window.late({resultIndex:1,results:[{0:{transcript:'ancien'},isFinal:true},{0:{transcript:'tardif'},isFinal:true}]}));assert.equal(await description().inputValue(),expected);
 console.log('PASS simulated: second dictation, cancel and stale callback');
 await button('Dicter').click();await p.evaluate(()=>window.fakeInstances.at(-1).onerror({error:'not-allowed'}));await p.getByRole('alert').filter({hasText:'Accès au microphone refusé'}).waitFor();await button('Annuler').click();
 await button('Dicter').click();await button('Arrêter').click();await end(p);await p.getByRole('alert').filter({hasText:'Aucune parole reconnue'}).waitFor();await button('Annuler').click();
 console.log('PASS simulated: microphone refusal and silence');
 await button('Brouillon').click();await p.getByText('Brouillon sauvegardé',{exact:true}).waitFor();
 const saved=unwrap(await tech.from('reports').select('*').eq('id',report.id).single());assert.equal(saved.text_content,expected);assert.deepEqual(saved.photos,photos);for(const key of ['supplies_text','work_duration_minutes','is_billable','billable_reason','status'])assert.equal(saved[key],report[key]);
 await c.close();c=await context();p=await login(c);await p.goto(url);await button('Dicter').waitFor();assert.equal(await description().inputValue(),expected);
 await p.waitForFunction(()=>[...document.querySelectorAll('img[alt^="Photo "]')].some(i=>i.complete&&i.naturalWidth>0));
 console.log('PASS real persistence: existing save flow, new authenticated browser session, text/photo/other fields');
 await button('Dicter').click();await p.evaluate(()=>{window.oldRecognition=window.fakeInstances.at(-1);window.late=window.oldRecognition.onresult;});
 // Existing Retour button navigates through Next without replacing the JS window.
 await button('Retour').click();await p.waitForURL('**/technician/today');await p.waitForFunction(()=>window.oldRecognition.aborted===true);assert.equal(await p.evaluate(()=>window.oldRecognition.aborted),true);
 await p.evaluate(()=>window.late({resultIndex:0,results:[{0:{transcript:'Tardif fictif'},isFinal:true}]}));
 await p.goto(url);await button('Dicter').waitFor();assert.equal(await description().inputValue(),expected);
 console.log('PASS simulated: navigation aborts recognition, ignores late callback');
 await c.close();c=await context(false);p=await login(c);await p.goto(url);await p.getByText(/Dictée indisponible dans ce navigateur/).waitFor();assert.equal(await button('Dicter').isDisabled(),true);await description().fill('Manuel disponible');assert.equal(await description().inputValue(),'Manuel disponible');
 console.log('PASS simulated: unsupported browser retains manual editing');
 console.log('Chromium '+browser.version()+': no real microphone, no real recognition, local persistence verified');
 await c.close();await browser.close();
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
