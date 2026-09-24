const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness,database,nodes,text}=require('./lot1-harness.cjs');
const lib=harness({}).load('src/lib/daily-activity.ts');
const dataLib=harness({}).load('src/lib/daily-activity-data.ts');
const base={id:'i1',title:'Fictif',work_order_number:'F-1',technician_id:'t1',intervention_type:'depannage',status:'planifie',date_planned:'2030-03-31T08:00:00Z',date_end:null,date_completed:null};
const profiles=[{id:'t1',first_name:'Fictif',last_name:'Un'},{id:'t2',first_name:'Fictif',last_name:'Deux'}];
function calc(values={}){return lib.calculateDailyActivity({date:'2030-03-31',technician:'',interventions:[],reports:[],followup:[],technicians:profiles,refreshedAt:'2030-04-01T10:00:00Z',...values});}
test('Zurich day is half-open and 23/25 hours at DST; month, leap date and midnight',()=>{
 for(const [d,a,b,h] of [['2030-03-31','2030-03-30T23:00:00.000Z','2030-03-31T22:00:00.000Z',23],['2030-10-27','2030-10-26T22:00:00.000Z','2030-10-27T23:00:00.000Z',25],['2030-09-30','2030-09-29T22:00:00.000Z','2030-09-30T22:00:00.000Z',24]]){
  const p=lib.dailyPeriod(d);assert.equal(p.start,a);assert.equal(p.end,b);assert.equal((Date.parse(b)-Date.parse(a))/3600000,h);assert.ok(lib.inDailyPeriod(a,p));assert.equal(lib.inDailyPeriod(b,p),false);
 }
 assert.equal(lib.shiftDailyDate('2028-02-29',1),'2028-03-01');assert.equal(lib.shiftDailyDate('2030-01-01',-1),'2029-12-31');
 assert.equal(lib.zurichToday(new Date('2030-09-30T22:00:00Z')),'2030-10-01');
 for(const d of ['2030-02-29','2030-13-01','2030-03-31T00:00Z','','x','2030-04-31'])assert.throws(()=>lib.dailyPeriod(d));
});
test('planning overlap requires explicit end; elapsed forecast never means completion',()=>{
 const p=lib.dailyPeriod('2030-03-31');
 assert.equal(lib.plannedOnDay({...base,date_planned:'2030-03-28T10:00:00Z',date_end:p.start},p),false);
 assert.equal(lib.plannedOnDay({...base,date_planned:'2030-03-28T10:00:00Z',date_end:'2030-04-01T12:00:00Z'},p),true);
 assert.equal(lib.plannedOnDay({...base,date_planned:'2030-03-28T10:00:00Z'},p),false);
 assert.equal(lib.plannedOnDay({...base,date_planned:p.end},p),false);
 const v=calc({interventions:[{...base,date_end:'2030-03-31T09:00:00Z'}]});assert.equal(v.counts.planned,1);assert.equal(v.counts.completed,0);
});
test('global IDs unique across sources and reports; current primary assignment only',()=>{
 const i={...base,status:'termine',date_completed:'2030-03-31T11:00:00Z'};
 const reports=[{id:'r1',intervention_id:'i1',technician_id:'t1',created_at:'2030-03-31T11:00:00Z',status:'submitted'}, {id:'r2',intervention_id:'i1',technician_id:'t2',created_at:'2030-03-31T11:00:00Z',status:'draft'}];
 const v=calc({interventions:[i,i,{...base,id:'i2',technician_id:'t2'}],reports:[...reports,reports[0]]});
 assert.equal(v.entries.length,2);assert.equal(v.counts.planned,2);assert.equal(v.counts.completed,1);assert.equal(v.counts.reportsCreated,2);
 assert.equal(v.technicianSummary.length,2);assert.equal(v.technicianSummary.find(x=>x.id==='t1').reportsCreated,2);
 const filtered=calc({interventions:[i,{...base,id:'i2',technician_id:'t2'}],reports,technician:'t2'});assert.equal(filtered.entries.length,1);assert.equal(filtered.counts.reportsCreated,0);
});
test('completion, report creation and current submission have different meanings and dates',()=>{
 const i={...base,status:'termine',date_completed:'2030-03-31T15:00:00Z'};
 const r={id:'r1',intervention_id:'i1',technician_id:'t1',created_at:'2030-04-01T08:00:00Z',status:'submitted',updated_at:'2030-04-03T08:00:00Z'};
 const dayA=calc({interventions:[i],reports:[r]});assert.equal(dayA.counts.completed,1);assert.equal(dayA.counts.reportsCreated,0);assert.equal(dayA.counts.reportsSentOnDate,null);
 const dayB=calc({date:'2030-04-01',interventions:[i],reports:[r]});assert.equal(dayB.counts.completed,0);assert.equal(dayB.counts.reportsCreated,1);assert.equal(dayB.counts.reportsSentOnDate,null);
 assert.equal(calc({date:'2030-04-03',interventions:[i],reports:[r]}).entries.length,0);
});
test('cancelled and undated completions never counted as dated realization',()=>{
 const v=calc({interventions:[{...base,status:'annule',date_completed:'2030-03-31T11:00:00Z'},{...base,id:'i2',status:'termine'}]});
 assert.equal(v.counts.completed,0);assert.equal(v.counts.planned,1);assert.equal(v.counts.cancelled,1);assert.equal(v.counts.missingCompletionDates,1);
 assert.equal(calc().counts.reportsSentOnDate,null);
});
test('3A eligibility reused verbatim; day actions separate from current all-date backlog',()=>{
 const rows=[{intervention_id:'i1',technician_id:'t1',state:'absent',confirmed:true,exclusion:null}, {intervention_id:'i2',technician_id:'t1',state:'correction',exclusion:null}, {intervention_id:'i3',technician_id:'t1',state:'unconfirmed',exclusion:'Obligation non confirmée'},{intervention_id:'i4',technician_id:'t1',state:'submitted',exclusion:'Rapport déjà envoyé'}];
 let v=calc({interventions:[base],followup:rows});assert.equal(v.dayActions.length,1);assert.equal(v.backlog.length,1);assert.equal(v.backlog[0].intervention_id,'i2');
 rows[0]={...rows[0],state:'submitted',exclusion:'Rapport déjà envoyé'};v=calc({interventions:[base],followup:rows});assert.equal(v.dayActions.length,0);assert.equal(v.entries[0].followup.state,'submitted');
});
test('pagination handles more than 1000 rows and fails instead of returning a partial count',async()=>{
 const rows=Array.from({length:1201},(_,id)=>({id}));let calls=0;
 const all=await dataLib.readDailyPages(async(a,b)=>{calls++;return{data:rows.slice(a,b+1),error:null};});assert.equal(all.length,1201);assert.equal(calls,3);
 await assert.rejects(()=>dataLib.readDailyPages(async(a,b)=>a?{data:null,error:{message:'offline'}}:{data:rows.slice(a,b+1),error:null}));
});
test('API authorizes before domain access and rejects invalid dates and technician input',async()=>{
 for(const [user,role,active,status] of [[null,'admin',true,401],['u','technician',true,403],['u','secretary',false,403],['u','admin',false,403]]){
  const db=database({users:[{id:'u',role,is_active:active}]},user);const h=harness(db,{Response,Request});const res=await h.load('src/app/api/reports/daily/route.ts').GET(new Request('http://local/api/reports/daily?date=2030-03-31'));assert.equal(res.status,status);assert.equal(db.calls.some(c=>c.table!=='users'),false);
 }
 for(const query of ['date=2030-02-29','date=2030-03-31&technician=invalid']){
  const db=database({users:[{id:'u',role:'secretary',is_active:true}]},'u');const h=harness(db,{Response,Request});assert.equal((await h.load('src/app/api/reports/daily/route.ts').GET(new Request('http://local/api/reports/daily?'+query))).status,400);
 }
});
test('date change aborts an old response and cannot replace the newer daily data',async()=>{
 const pending=[];const h=harness({}, {AbortController, fetch:(_url,options)=>new Promise(resolve=>pending.push({resolve,options}))});
 const Page=h.load('src/app/(dashboard)/reports/daily/page.tsx').default;
 h.render(Page);await h.settle();assert.equal(pending.length,1);
 let tree=h.render(Page);const dateInput=nodes(tree).find(n=>n.type==='input'&&n.props.type==='date');dateInput.props.onChange({target:{value:'2030-03-31'}});h.render(Page);await h.settle();assert.equal(pending[0].options.signal.aborted,true);
 pending[1].resolve({ok:true,json:async()=>calc({interventions:[{...base,title:'Newest result'}]})});await h.settle();
 pending[0].resolve({ok:true,json:async()=>calc({interventions:[{...base,title:'Stale result'}]})});await h.settle();tree=h.render(Page);assert.match(text(tree),/Newest result/);assert.doesNotMatch(text(tree),/Stale result/);
});
