const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./lot1-harness.cjs');
const lib=harness({}).load('src/lib/report-followup.ts');
const feedback=harness({}).load('src/lib/report-feedback.ts');
test('same filtered rows drive count and order; undefined dates last',()=>{
 const rows=[{intervention_id:'a',technician_id:'t',state:'draft',reference_at:'2030-03-31T03:00:00+02:00'},
 {intervention_id:'b',technician_id:'t',state:'draft',reference_at:'2030-03-31T01:30:00+01:00'},
 {intervention_id:'c',technician_id:null,state:'unconfirmed',reference_at:null}];
 assert.deepEqual(Array.from(lib.filterFollowup(rows,'t','draft',false),r=>r.intervention_id),['b','a']);
 assert.equal(lib.filterFollowup(rows,'other','',false).length,0);
 assert.equal(lib.filterFollowup(rows,'','',true).at(-1).intervention_id,'c');
});
test('Zurich rendering at midnight and DST; exact notification routes',()=>{
 assert.match(lib.followupDate('2030-09-15T22:30:00Z'),/16.09.30.*00:30/);
 assert.match(lib.followupDate('2030-03-31T01:30:00Z'),/03:30/);
 for(const type of ['revision_requested','report_reminder'])assert.equal(feedback.reportNotificationLink({type,reference_type:'report',reference_id:'r1',report_intervention_id:'i1'}),'/technician/report/i1?report_id=r1');
 assert.equal(feedback.reportNotificationLink({type:'report_reminder',reference_type:'intervention',reference_id:'i1'}),'/technician/report/i1');
 assert.equal(feedback.reportNotificationLink({type:'report_reminder',reference_type:'report',reference_id:'hidden'}),'#');
});
test('form dates are Zurich independently of browser zone, invalid/ambiguous DST rejected',()=>{
 assert.equal(lib.followupInputInstant('2030-09-15T23:30'),'2030-09-15T21:30:00.000Z');
 assert.throws(()=>lib.followupInputInstant('2030-03-31T02:30'),/n’existe pas/);
 assert.throws(()=>lib.followupInputInstant('2030-10-27T02:30'),/deux fois/);
});
