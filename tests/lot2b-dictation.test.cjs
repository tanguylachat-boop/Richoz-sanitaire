const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, database, nodes, text } = require('./lot1-harness.cjs');
function setup() {
 const h=harness(database()); const lib=h.load('src/lib/report-dictation.ts');
 const instances=[];
 class Fake { start(){instances.push(this);this.onstart?.();} stop(){this.stopped=true;} abort(){this.aborted=true;} }
 const session=new lib.DictationSession(()=>{});
 const emit=(r,parts,index=0)=>r.onresult?.({resultIndex:index,results:parts.map(([transcript,isFinal=true])=>({0:{transcript},isFinal}))});
 return {h,lib,session,Fake,instances,emit};
}
test('existing report + reviewed correction; double add consumed once',()=>{
 const {lib,session:s,Fake,instances,emit}=setup();s.start(Fake);emit(instances[0],[['robinet fictif']]);s.stop();instances[0].onend();s.edit('Robinet de démonstration.');
 assert.equal(lib.appendDictation('Texte manuel',s.take()),'Texte manuel\n\nRobinet de démonstration.');assert.equal(s.take(),'');
});
test('manual corrections during listening survive cumulative repeated events, spoken repetitions remain',()=>{
 const {session:s,Fake,instances,emit}=setup();s.start(Fake);const r=instances[0];emit(r,[['oui']]);s.edit('Correction manuelle');emit(r,[['oui'],['oui']]);emit(r,[['oui'],['oui']]);assert.equal(s.state.text,'Correction manuelle oui');
 s.stop();r.onend();s.take();s.start(Fake);emit(instances[1],[['oui'],['oui']]);assert.equal(s.state.text,'oui oui');
});
test('cancel and dispose abort and ignore captured late callbacks',()=>{
 for(const operation of ['cancel','dispose']){const {session:s,Fake,instances}=setup();s.start(Fake);const r=instances[0],late=r.onresult,end=r.onend; s[operation]();const before=s.state;late({resultIndex:0,results:[{0:{transcript:'tardif'},isFinal:true}]});end();assert.equal(s.state,before);assert.ok(r.aborted);assert.equal(r.onresult,null);}
});
test('normal stop waits for final results and never promotes interim',()=>{
 const {session:s,Fake,instances,emit}=setup();s.start(Fake);const r=instances[0];emit(r,[['provisoire',false]]);s.stop();assert.equal(s.state.phase,'stopping');assert.equal(s.take(),'');emit(r,[['final confirmé']]);r.onend();assert.equal(s.take(),'final confirmé');
});
test('refused, missing microphone, network, silence, unsupported language and unexpected end do not restart',()=>{
 for(const error of ['not-allowed','audio-capture','network','no-speech','language-not-supported','service-not-allowed','aborted']) { const {session:s,Fake,instances}=setup();s.start(Fake);instances[0].onerror({error});assert.equal(s.state.phase,'review');assert.ok(s.state.message);assert.equal(instances.length,1);assert.ok(instances[0].aborted); }
 const {session:s,Fake,instances}=setup();s.start(Fake);instances[0].onend();assert.match(s.state.message,/arrêté/);assert.equal(instances.length,1);
});
test('unsupported browser, constructor/start failures and empty normal stop',()=>{
 const {session:s,lib,Fake,instances}=setup();assert.equal(lib.recognitionConstructor({}),undefined);s.start();assert.match(s.state.message,/indisponible/);s.start(class {constructor(){throw Error();}});assert.equal(s.state.phase,'review');s.cancel();s.start(Fake);s.stop();instances[0].onend();assert.match(s.state.message,/Aucune parole/);
});
test('stop timeout aborts unresponsive service and discards interim',()=>{
 let timeout;const h=harness(database(),{setTimeout(fn){timeout=fn;return 1;}});const {DictationSession}=h.load('src/lib/report-dictation.ts');let r;class Fake{start(){r=this;}stop(){}abort(){this.aborted=true;}}const s=new DictationSession(()=>{});s.start(Fake);s.stop();timeout();assert.ok(r.aborted);assert.equal(s.state.phase,'review');assert.match(s.state.message,/ne répond plus/);
});
test('unsupported UI keeps manual fallback and all dictation buttons are non-submit',async()=>{
 const h=harness(database(),{document:{addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}}});const C=h.load('src/components/reports/VoiceRecorder.tsx').VoiceRecorder;h.render(C);await h.settle();const tree=h.render(C);assert.match(text(tree),/Dictée indisponible/);assert.ok(nodes(tree).filter(n=>n.type==='button').every(n=>n.props.type==='button'));assert.ok(nodes(tree).find(n=>n.type==='button').props.disabled);
});
test('report handler appends to latest manual description, preserves photos and other saved fields',async()=>{
 const report={id:'r1',intervention_id:'iv1',technician_id:'tech1',text_content:'Initial',status:'draft',photos:[{url:'/photo-fictive',caption:'avant',category:'before'}],supplies_text:'Joint fictif',work_duration_minutes:75,is_billable:false,billable_reason:'Test'};
 const db=database({reports:[report]});const h=harness(db);const C=h.load('src/components/reports/ReportForm.tsx').ReportForm;
 const props={intervention:{id:'iv1'},existingReport:report,products:[],technicianId:'tech1'};
 const render=()=>h.render(C,props);let tree=render();const voice=nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='VoiceRecorder');
 nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Manuel pendant écoute'}});voice.props.onRecordingComplete('Dictée corrigée');tree=render();assert.equal(nodes(tree).find(n=>n.type==='textarea').props.value,'Manuel pendant écoute\n\nDictée corrigée');
 await nodes(tree).find(n=>n.type==='button'&&text(n).includes('Brouillon')).props.onClick();assert.equal(report.text_content,'Manuel pendant écoute\n\nDictée corrigée');assert.equal(report.photos[0].caption,'avant');assert.equal(report.supplies_text,'Joint fictif');assert.equal(report.work_duration_minutes,75);assert.equal(report.is_billable,false);assert.equal(report.billable_reason,'Test');
});
test('old callbacks cannot contaminate next session; intermediate replacement/removal never inserts text',()=>{
 const {session:s,Fake,instances,emit}=setup();s.start(Fake);const old=instances[0],late=old.onresult;s.cancel();s.start(Fake);const r=instances[1];late({resultIndex:0,results:[{0:{transcript:'autre rapport'},isFinal:true}]});assert.equal(s.state.text,'');emit(r,[['ancien provisoire',false]]);emit(r,[['nouveau provisoire',false]]);assert.equal(s.state.interim,'nouveau provisoire');emit(r,[]);assert.equal(s.state.interim,'');assert.equal(s.state.text,'');
});
