// Real persistence: explicitly local fictitious accounts only. No application env loading.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const c=JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS,'utf8'));
assert.equal(c.API_URL,'http://127.0.0.1:56321');
const original=global.fetch;global.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input.url);assert.equal(u.origin,c.API_URL);return original(input,init);};
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(c.API_URL,c.SERVICE_ROLE_KEY,options),anon=createClient(c.API_URL,c.ANON_KEY,options);
const actors={},run=crypto.randomUUID();const ok=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
const config={enabled:true,first_delay_seconds:0,interval_seconds:60,max_repetitions:null,activation_at:'2030-03-30T00:00:00+01:00'};
async function make(values={}){return ok(await actors.secretary.db.from('interventions').insert({title:'LOT3A fictif '+crypto.randomUUID(),address:'Adresse fictive',intervention_type:'depannage',status:'termine',technician_id:actors.tech.id,...values}).select().single());}
async function confirm(i,reference='2030-03-30T12:00:00+01:00',due=null){ok(await actors.secretary.db.rpc('confirm_report_expectation',{p_intervention:i.id,p_reference:reference,p_due:due}));}
async function row(i){return ok(await actors.secretary.db.rpc('get_report_followup')).find(r=>r.intervention_id===i.id);}
async function remind(i,expected=null,interval=60){return actors.secretary.db.rpc('remind_report',{p_intervention:i.id,p_interval_seconds:interval,p_expected:expected});}
async function batch(i,now='2030-03-31T14:00:00+02:00',dry=true,conf=config){const r=ok(await service.rpc('run_report_reminders',{p_config:conf,p_dry:dry,p_now:now}));return r.results.find(r=>r.intervention_id===i.id);}
async function report(i,status='draft'){return ok(await actors.tech.db.from('reports').insert({intervention_id:i.id,technician_id:actors.tech.id,status,text_content:'Texte fictif',revision_requested:false}).select().single());}
async function history(i){return ok(await service.from('report_reminder_history').select('*').eq('intervention_id',i.id).order('created_at'));}
before(async()=>{
 for(const [name,role,active] of [['secretary','secretary',true],['admin','admin',true],['tech','technician',true],['other','technician',true],['inactive','admin',false]]){
  const credentials={email:`lot3a-${name}-${run}@example.invalid`,password:'Local-Fictif-3A-2026!'};
  const {user}=ok(await service.auth.admin.createUser({...credentials,email_confirm:true}));
  ok(await service.from('users').insert({id:user.id,email:credentials.email,role,is_active:active,first_name:'Fictif',last_name:name}));
  const db=createClient(c.API_URL,c.ANON_KEY,options);ok(await db.auth.signInWithPassword(credentials));actors[name]={...credentials,id:user.id,db};
 }
 fs.writeFileSync('/private/tmp/richoz-lot3a-fixtures.json',JSON.stringify(Object.fromEntries(Object.entries(actors).map(([k,{db,...a}])=>[k,a]))));
});
after(()=>{Object.values(actors).forEach(a=>a.db.auth.stopAutoRefresh());});
test('confirmed absent -> one draft -> submitted -> correction draft -> resubmission -> new correction cycle',async()=>{
 const i=await make();await confirm(i);assert.equal((await row(i)).state,'absent');
 const absentCycle=(await row(i)).cycle;const r=await report(i);assert.equal((await row(i)).state,'draft');assert.equal((await row(i)).cycle,absentCycle);
 assert.equal(ok(await actors.secretary.db.rpc('get_report_followup')).filter(x=>x.intervention_id===i.id).length,1);
 assert.equal(ok(await remind(i)).result,'created');const h=await history(i);assert.equal(h.length,1);
 const n=ok(await actors.tech.db.from('notifications').select('*').eq('id',h[0].notification_id).single());assert.equal(n.reference_id,r.id);assert.equal(n.reference_type,'report');
 ok(await actors.tech.db.from('reports').update({status:'submitted',revision_requested:false}).eq('id',r.id));assert.equal((await row(i)).state,'submitted');assert.equal((await batch(i)).reason,'Rapport déjà envoyé');
 const feedback='Commentaire fictif exact\nPréciser la réparation.';
 ok(await actors.secretary.db.from('reports').update({status:'rejected',revision_requested:true,revision_message:feedback}).eq('id',r.id));
 const cycle=(await row(i)).cycle;assert.notEqual(cycle,absentCycle);assert.equal((await row(i)).state,'correction');
 ok(await actors.tech.db.from('reports').update({status:'draft'}).eq('id',r.id));assert.equal((await row(i)).state,'correction');assert.equal((await row(i)).cycle,cycle);
 assert.equal((await batch(i,'2030-03-31T14:00:00+02:00',false)).result,'created');
 const hn=await history(i);const correction=ok(await actors.tech.db.from('notifications').select('*').eq('id',hn.at(-1).notification_id).single());
 assert.equal(correction.type,'revision_requested');assert.equal(correction.reference_id,r.id);assert.ok(correction.message.endsWith(feedback));
 ok(await actors.tech.db.from('reports').update({status:'submitted',revision_requested:false}).eq('id',r.id));assert.equal((await batch(i)).reason,'Rapport déjà envoyé');
 ok(await actors.secretary.db.from('reports').update({status:'rejected',revision_requested:true,revision_message:feedback}).eq('id',r.id));assert.notEqual((await row(i)).cycle,cycle);
 assert.equal((await batch(i,'2030-03-31T14:01:01+02:00',false)).result,'created');
 ok(await actors.secretary.db.from('reports').update({status:'validated'}).eq('id',r.id));assert.equal((await row(i)).state,'validated');assert.equal((await batch(i)).result,'excluded');
});
test('no implicit planned-end obligation, cancelled, incomplete, reassignment and multiple reports excluded',async()=>{
 const unknown=await make({date_end:'2020-01-01T00:00:00Z'});assert.equal((await row(unknown)).state,'unconfirmed');assert.equal((await batch(unknown)).reason,'Obligation non confirmée');
 const planned=await make({status:'planifie',date_end:'2020-01-01T00:00:00Z'});assert.equal(await row(planned),undefined);assert.equal(ok(await remind(planned)).result,'excluded');
 const i=await make();await confirm(i);const r=await report(i);
 ok(await actors.secretary.db.from('interventions').update({technician_id:actors.other.id}).eq('id',i.id));assert.match((await batch(i)).reason,/Réaffectation/);assert.equal(ok(await remind(i)).result,'excluded');
 ok(await actors.secretary.db.from('interventions').update({status:'annule'}).eq('id',i.id));assert.equal((await batch(i)).reason,'Intervention annulée');
 const missing=await make({technician_id:null});await confirm(missing);assert.equal((await batch(missing)).reason,'Responsable non défini');
 const multi=await make();await report(multi);await report(multi);assert.equal((await row(multi)).report_count,2);assert.equal((await row(multi)).state,'ambiguous');assert.match((await batch(multi)).reason,/Plusieurs/);
 const incomplete=await make();const incompleteReport=await report(incomplete);ok(await service.from('reports').update({status:null}).eq('id',incompleteReport.id));assert.equal((await row(incomplete)).state,'incomplete');assert.equal((await batch(incomplete)).reason,'Statut du rapport manquant');
 const reassigned=await make();await confirm(reassigned);ok(await actors.secretary.db.from('interventions').update({technician_id:actors.other.id}).eq('id',reassigned.id));assert.equal(ok(await remind(reassigned)).result,'created');assert.equal((await history(reassigned))[0].recipient_id,actors.other.id);
});
test('manual double click, two staff sessions, stale retry, persisted minimum interval',async()=>{
 const i=await make();await confirm(i);
 const result=await Promise.all([remind(i),actors.admin.db.rpc('remind_report',{p_intervention:i.id,p_interval_seconds:60,p_expected:null}),remind(i)]);
 assert.equal(result.filter(r=>ok(r).result==='created').length,1);assert.equal((await history(i)).length,1);
 const current=await row(i);assert.equal(ok(await remind(i,current.last_reminder_id,1)).reason,'Intervalle minimal non atteint');
 assert.equal(ok(await remind(i)).reason,'Vue périmée : recharger');
});
test('two concurrent automatic runs, simulation writes nothing, next window and repetition cap',async()=>{
 const i=await make();await confirm(i);
 assert.equal((await batch(i)).result,'would_create');assert.equal((await history(i)).length,0);
 const results=await Promise.all([batch(i,'2030-04-01T12:00:00Z',false),batch(i,'2030-04-01T12:00:00Z',false)]);
 assert.equal(results.filter(r=>r.result==='created').length,1);assert.equal((await history(i)).length,1);
 assert.equal((await batch(i,'2030-04-01T12:01:00Z',false)).result,'created');assert.equal((await history(i)).length,2);
 assert.equal((await batch(i,'2030-04-01T12:02:00Z',true,{...config,max_repetitions:2})).reason,'Limite de répétition atteinte');
});
test('activation prevents historical catch-up; Zurich midnight and DST use elapsed seconds',async()=>{
 const old=await make();await confirm(old,'2020-01-01T12:00:00+01:00');assert.equal((await row(old)).state,'absent');assert.equal((await batch(old)).reason,'Historique antérieur à la mise en service');
 for(const [reference,before,at] of [
 ['2030-03-31T01:30:00+01:00','2030-03-31T03:29:59+02:00','2030-03-31T03:30:00+02:00'],
 ['2030-10-27T02:30:00+02:00','2030-10-27T02:29:59+01:00','2030-10-27T02:30:00+01:00'],
 ['2030-09-15T23:30:00+02:00','2030-09-16T00:29:59+02:00','2030-09-16T00:30:00+02:00']]){
  const i=await make();await confirm(i,reference);const conf={...config,first_delay_seconds:3600};assert.equal((await batch(i,before,true,conf)).reason,'Premier délai non atteint');assert.equal((await batch(i,at,true,conf)).result,'would_create');
 }
 const due=await make();await confirm(due,'2030-04-01T12:00:00Z','2030-04-01T13:00:00Z');assert.equal((await batch(due,'2030-04-01T13:59:59Z',true,{...config,first_delay_seconds:3600})).reason,'Premier délai non atteint');assert.equal((await batch(due,'2030-04-01T14:00:00Z',true,{...config,first_delay_seconds:3600})).result,'would_create');
 const disabled=await service.rpc('run_report_reminders',{p_config:{...config,enabled:false},p_dry:false});assert.ok(disabled.error);
});
test('direct calls: staff active only, immutable history, own notifications, cannot exempt or reassign',async()=>{
 const i=await make();await confirm(i);const r=await report(i);ok(await remind(i));
 for(const db of [anon,actors.tech.db,actors.other.db,actors.inactive.db]){
  assert.ok((await db.rpc('get_report_followup')).error);
  assert.ok((await db.rpc('confirm_report_expectation',{p_intervention:i.id,p_reference:'2030-01-01T00:00:00Z'})).error);
  assert.ok((await db.rpc('remind_report',{p_intervention:i.id,p_interval_seconds:60})).error);
  assert.ok((await db.rpc('run_report_reminders',{p_config:config})).error);
  assert.ok((await db.from('report_reminder_history').select('*')).error);
  assert.ok((await db.rpc('report_followup_rows')).error);
  assert.ok((await db.rpc('report_followup_staff')).error);
  assert.ok((await db.from('report_expectations').update({reference_at:'2090-01-01'}).eq('intervention_id',i.id)).error);
 }
 for(const values of [{status:'annule'},{technician_id:actors.other.id}]) assert.ok((await actors.tech.db.from('interventions').update(values).eq('id',i.id)).error);
 const h=(await history(i))[0];assert.deepEqual(ok(await actors.other.db.from('notifications').select('*').eq('id',h.notification_id)),[]);
 assert.deepEqual(ok(await actors.other.db.from('reports').select('*').eq('id',r.id)),[]);
 assert.ok((await actors.tech.db.from('report_reminder_history').insert({intervention_id:i.id})).error);
 assert.ok((await actors.secretary.db.from('report_reminder_history').update({source:'manual'}).eq('id',h.id)).error);
 assert.ok((await actors.tech.db.from('notifications').insert({user_id:actors.other.id,recipient_id:actors.other.id,title:'Forbidden',type:'report_reminder'})).error);
 assert.ok((await actors.tech.db.rpc('report_reminder_one',{p_intervention:i.id,p_now:'2030-01-01',p_config:config,p_dry:false,p_manual:true})).error);
});
