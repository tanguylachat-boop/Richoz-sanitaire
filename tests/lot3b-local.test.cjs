// Controlled fictitious dates and real local persistence/HTTP. Never load workspace env.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');const {createServerClient,serialize}=require('@supabase/ssr');
const config=JSON.parse(fs.readFileSync(process.env.RICHOZ_LOCAL_STATUS,'utf8'));assert.equal(config.API_URL,'http://127.0.0.1:56321');
const app='http://127.0.0.1:56600',original=global.fetch;
global.fetch=(input,init)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.ok([app,config.API_URL].includes(u.origin));return original(input,init);};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),actors={},items={},reports={},run=crypto.randomUUID();
const ok=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
async function login(a){const cookies={};const db=createServerClient(config.API_URL,config.ANON_KEY,{auth:{autoRefreshToken:false},cookies:{get:n=>cookies[n],set:(n,v)=>{cookies[n]=v;},remove:n=>{delete cookies[n];}}});ok(await db.auth.signInWithPassword(a));return {...a,db,header:()=>Object.entries(cookies).map(([k,v])=>serialize(k,v)).join('; ')};}
async function api(actor,query='',method='GET'){return fetch(app+'/api/reports/daily?'+query,{method,headers:actor?{Cookie:actor.header()}: {},redirect:'manual'});}
async function daily(date,technician='',actor=actors.secretary){const res=await api(actor,new URLSearchParams({date,technician}));assert.equal(res.status,200,await res.clone().text());assert.match(res.headers.get('cache-control'),/private.*no-store/);return res.json();}
async function make(name,values={}){const i=ok(await actors.secretary.db.from('interventions').insert({title:`3B ${name} ${run}`,address:'Adresse fictive',work_order_number:'FICTIF-3B',technician_id:actors.tech.id,intervention_type:'depannage',status:'planifie',date_planned:'2034-01-31T09:00:00+01:00',date_end:'2034-01-31T10:00:00+01:00',...values}).select().single());items[name]=i;return i;}
async function report(name,i,actor,created,status='draft'){const r=ok(await actor.db.from('reports').insert({intervention_id:i.id,technician_id:actor.id,created_at:created,status,revision_requested:false,text_content:'Contenu privé fictif non requis dans le bilan',photos:[],work_duration_minutes:99}).select().single());reports[name]=r;return r;}
async function confirm(i){ok(await actors.secretary.db.rpc('confirm_report_expectation',{p_intervention:i.id,p_reference:'2034-01-20T10:00:00+01:00'}));}
async function snapshot(){const ids=Object.values(items).map(i=>i.id),rids=Object.values(reports).map(r=>r.id);return {
 interventions:ok(await service.from('interventions').select('*').in('id',ids).order('id')),
 reports:ok(await service.from('reports').select('*').in('id',rids).order('id')),
 notifications:(await service.from('notifications').select('id',{count:'exact',head:true})).count,
 history:(await service.from('report_reminder_history').select('id',{count:'exact',head:true})).count,
 expectations:ok(await service.from('report_expectations').select('*').in('intervention_id',ids).order('intervention_id')),
 cycles:ok(await service.from('report_followup_cycles').select('*').in('report_id',rids).order('report_id')),
 audit:(await service.from('audit_log').select('id',{count:'exact',head:true}).in('record_id',[...ids,...rids])).count,
};}
before(async()=>{
 for(const [name,role,active] of [['secretary','secretary',true],['admin','admin',true],['tech','technician',true],['other','technician',true],['inactive','admin',false]]){
  const credentials={email:`3b-${name}-${run}@example.invalid`,password:'Local-Fictif-Lot3B-2026!'};const {user}=ok(await service.auth.admin.createUser({...credentials,email_confirm:true}));
  ok(await service.from('users').insert({id:user.id,email:credentials.email,role,is_active:active,first_name:'Fictif 3B',last_name:name}));actors[name]=await login({...credentials,id:user.id});
 }
 await make('planned');await confirm(items.planned);
 await make('done',{status:'termine',date_planned:'2034-01-31T11:00:00+01:00',date_end:'2034-01-31T12:00:00+01:00',date_completed:'2034-01-31T16:00:00+01:00'});
 await report('nextDay',items.done,actors.tech,'2034-02-01T08:00:00+01:00','submitted');
 await make('multiday',{intervention_type:'chantier',date_planned:'2034-01-30T10:00:00+01:00',date_end:'2034-02-02T00:00:00+01:00'});
 await report('firstAuthor',items.multiday,actors.tech,'2034-01-31T14:00:00+01:00');
 ok(await actors.secretary.db.from('interventions').update({technician_id:actors.other.id}).eq('id',items.multiday.id));
 await report('secondAuthor',items.multiday,actors.other,'2034-01-31T15:00:00+01:00');
 await make('cancelled',{status:'annule',date_completed:'2034-01-31T12:00:00+01:00'});
 await make('undefined',{status:'termine',date_completed:null});
 await make('correction');await report('returned',items.correction,actors.tech,'2034-01-29T10:00:00+01:00','submitted');
 ok(await actors.secretary.db.from('reports').update({status:'rejected',revision_requested:true,revision_message:'Retour fictif 3B à préciser.'}).eq('id',reports.returned.id));
 await make('backlog',{status:'termine',date_planned:'2034-01-25T10:00:00+01:00',date_end:'2034-01-25T11:00:00+01:00'});await confirm(items.backlog);
 await make('endAtMidnight',{date_planned:'2034-01-30T10:00:00+01:00',date_end:'2034-01-31T00:00:00+01:00'});
 await make('nextMidnight',{date_planned:'2034-02-01T00:00:00+01:00',date_end:null});
 fs.writeFileSync('/private/tmp/richoz-lot3b-fixtures.json',JSON.stringify({actors:Object.fromEntries(Object.entries(actors).map(([k,{db,header,...a}])=>[k,a])),items,reports}));
});
after(()=>Object.values(actors).forEach(a=>a.db.auth.stopAutoRefresh()));
test('real daily activity, no invented completion/submission; cancelled/undefined coverage explicit',async()=>{
 const v=await daily('2034-01-31',actors.tech.id);
 assert.equal(v.counts.planned,4);assert.equal(v.counts.completed,1);assert.equal(v.counts.cancelled,1);assert.equal(v.counts.reportsCreated,0);assert.equal(v.counts.reportsSentOnDate,null);
 assert.equal(v.counts.missingCompletionDates,1);assert.equal(v.entries.find(i=>i.id===items.planned.id).completed,false);
 assert.equal(v.entries.find(i=>i.id===items.done.id).followup.state,'submitted');assert.equal(v.dayActions.some(i=>i.intervention_id===items.done.id),false);
 assert.equal(v.entries.find(i=>i.id===items.undefined.id).followup.state,'unconfirmed');assert.equal(v.dayActions.some(i=>i.intervention_id===items.undefined.id),false);
 assert.equal(v.dayActions.length,2);assert.ok(v.backlog.some(i=>i.intervention_id===items.backlog.id));
 const json=JSON.stringify(v);for(const secret of ['Contenu privé fictif','work_duration_minutes','client_info','photos','address','salary'])assert.ok(!json.includes(secret));
});
test('completion D, report creation D+1, unavailable submission date, empty date and no updated_at inference',async()=>{
 const a=await daily('2034-01-31',actors.tech.id),b=await daily('2034-02-01',actors.tech.id);
 assert.equal(a.counts.completed,1);assert.equal(a.counts.reportsCreated,0);assert.equal(b.counts.completed,0);assert.equal(b.counts.reportsCreated,1);assert.equal(b.counts.reportsSentOnDate,null);
 const empty=await daily('2034-03-01',actors.tech.id);assert.equal(empty.entries.length,0);assert.equal(empty.counts.planned,0);assert.equal(empty.counts.reportsSentOnDate,null);assert.ok(empty.backlog.length>0);
 const old=await daily('2034-01-25',actors.tech.id);assert.equal(old.entries.find(i=>i.id===items.backlog.id).status,'termine');assert.ok(old.backlog.some(i=>i.intervention_id===items.correction.id));
});
test('one global intervention despite multiple days and report authors; respect current assignment',async()=>{
 const global=await daily('2034-01-31');assert.equal(global.entries.filter(i=>i.id===items.multiday.id).length,1);
 const other=await daily('2034-01-31',actors.other.id);assert.equal(other.entries.length,1);assert.equal(other.counts.planned,1);assert.equal(other.counts.reportsCreated,2);assert.equal(other.entries[0].reports.length,2);assert.equal(other.entries[0].followup.state,'ambiguous');
 const next=await daily('2034-02-01',actors.other.id);assert.equal(next.counts.planned,1);assert.equal(next.counts.reportsCreated,0);
 assert.equal((await daily('2034-02-02',actors.other.id)).entries.length,0);
 const a=await daily('2034-01-31',actors.tech.id);assert.equal(a.entries.some(i=>i.id===items.endAtMidnight.id||i.id===items.nextMidnight.id),false);
});
test('returned then resubmitted, including consultation of a past day, uses refreshed current 3A state',async()=>{
 assert.ok((await daily('2034-01-31',actors.tech.id)).dayActions.some(i=>i.intervention_id===items.correction.id));
 ok(await actors.tech.db.from('reports').update({status:'draft'}).eq('id',reports.returned.id));assert.equal((await daily('2034-01-31',actors.tech.id)).entries.find(i=>i.id===items.correction.id).followup.state,'correction');
 ok(await actors.tech.db.from('reports').update({status:'submitted',revision_requested:false}).eq('id',reports.returned.id));
 const v=await daily('2034-01-31',actors.tech.id);assert.equal(v.dayActions.some(i=>i.intervention_id===items.correction.id),false);assert.equal(v.entries.find(i=>i.id===items.correction.id).followup.state,'submitted');
 assert.equal(v.counts.reportsSentOnDate,null);
});
test('actual HTTP permissions, invalid input, no shared caching and mutation endpoint absent',async()=>{
 for(const [actor,status] of [[null,401],[actors.tech,403],[actors.other,403],[actors.inactive,403]])assert.equal((await api(actor,'date=2034-01-31')).status,status);
 assert.equal((await api(actors.admin,'date=2034-01-31')).status,200);
 for(const q of ['date=2034-02-30','date=2034-01-31T00:00:00Z','date=','date=2034-01-31&technician=bad'])assert.equal((await api(actors.secretary,q)).status,400);
 assert.equal((await api(actors.secretary,'date=2034-01-31','POST')).status,405);
 assert.equal((await actors.tech.db.rpc('get_report_followup')).error?.code,'42501');
});
test('actual reads and refreshes leave business records, 3A cycles, notifications and audit unchanged',async()=>{
 const before=await snapshot();for(const key of ['notifications','history','audit'])assert.ok(Number.isInteger(before[key]));for(const date of ['2034-01-31','2034-02-01','2034-03-01']){await daily(date,actors.tech.id);await daily(date,actors.tech.id);}
 const after=await snapshot();assert.deepEqual(after,before);
 fs.writeFileSync('docs/validation-lot-3b/no-side-effects.json',JSON.stringify({business_rows_compared:before.interventions.length+before.reports.length,notification_count:before.notifications,reminder_history_count:before.history,audit_count:before.audit,unchanged:true},null,2));
});
test('actual server intervals at Zurich month boundary, spring and autumn change',async()=>{
 for(const [date,start,end,hours] of [['2030-03-31','2030-03-30T23:00:00.000Z','2030-03-31T22:00:00.000Z',23],['2030-10-27','2030-10-26T22:00:00.000Z','2030-10-27T23:00:00.000Z',25],['2034-01-31','2034-01-30T23:00:00.000Z','2034-01-31T23:00:00.000Z',24]]){
  const v=await daily(date,actors.tech.id);assert.equal(v.period.start,start);assert.equal(v.period.end,end);assert.equal((Date.parse(end)-Date.parse(start))/3600000,hours);
 }
});
