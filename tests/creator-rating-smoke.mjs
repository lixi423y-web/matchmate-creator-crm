import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {TIERS,FIT_VERDICTS,OUTREACH_STATUSES,badgeClass} from '../src/constants.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.ok(html.includes('<th>Tier</th><th>Fit</th>'));
assert.ok(app.includes('colspan="11"'));
assert.ok(app.includes("creatorRatingCell(row,'tier')"));
assert.ok(app.includes("creatorRatingCell(row,'fit_verdict')"));
assert.ok(app.includes("$$('.creator-rating-edit',tr).forEach"),'bind both buttons on each creator row');
assert.ok(app.includes("$('#creatorRatingDialog').open&&$('#creatorRatingDialog').close()"),'clear the rating dialog on logout');
const nodes=Object.fromEntries(['creatorRatingDialog','creatorRatingTitle','creatorRatingName','creatorRatingFields','creatorRatingError','saveCreatorRatingBtn'].map(id=>[id,{textContent:'',innerHTML:''}]));
let open=false,value='',writes=[],logs=[],refreshes=0,fail=false,outreach={id:'touch',status:'Contacted',notes:'keep notes',last_contact_at:'2026-11-01',next_follow_up_at:'2026-11-20'},outreachWrites=[];
nodes.creatorRatingDialog.showModal=()=>open=true;
nodes.creatorRatingDialog.close=()=>open=false;
let record={id:'test',display_name:'Test creator',tier:'A',fit_verdict:'Strong',owner_id:'owner',notes:'preserve'};
const context=vm.createContext({TIERS,FIT_VERDICTS,OUTREACH_STATUSES,badgeClass,state:{actionBusy:false},
  $:selector=>selector==='select'?{value}:nodes[selector.slice(1)],
  getOne:async()=>structuredClone(record),
  related:async()=>outreach?[structuredClone(outreach)]:[],
  save:async(table,payload)=>{if(fail)throw Error('Save failed');if(table==='outreach_records'){outreachWrites.push({...payload});outreach={...outreach,...payload,id:payload.id||'new-touch'};return outreach}writes.push({...payload});Object.assign(record,payload);return record},
  logActivitySafely:async entry=>{logs.push(entry);return false},refreshViews:async()=>{refreshes++},
  runAction:async(button,status,work,{afterSuccess}={})=>{try{const value=await work();if(afterSuccess)await afterSuccess(value);return{ok:true,value}}catch(error){return{ok:false,error}}},
  toast:()=>{},message:e=>e.message,saveErrorMessage:e=>e.message});
for(const name of ['esc','attr','selectField','creatorRatingCell'])vm.runInContext(app.split('\n').find(line=>line.startsWith(`function ${name}(`)),context);
vm.runInContext(app.slice(app.indexOf('async function openCreatorRatingEditor('),app.indexOf('\nfunction renderSelectionCount(')),context);
assert.ok(vm.runInContext("creatorRatingCell({tier:null},'tier')",context).includes('Not set'));
await context.openCreatorRatingEditor('test','tier');assert.equal(open,true);
assert.ok(nodes.creatorRatingFields.innerHTML.includes('value="A" selected'));
value='B';await nodes.saveCreatorRatingBtn.onclick();
assert.deepEqual(writes,[{id:'test',tier:'B'}]);assert.equal(record.fit_verdict,'Strong');assert.equal(record.notes,'preserve');assert.equal(open,false);assert.equal(refreshes,1);assert.equal(logs.length,1);
await context.openCreatorRatingEditor('test','fit_verdict');value='Maybe';await nodes.saveCreatorRatingBtn.onclick();
assert.deepEqual(writes[1],{id:'test',fit_verdict:'Maybe'});assert.equal(record.tier,'B');
await context.openCreatorRatingEditor('test','tier');value='B';await nodes.saveCreatorRatingBtn.onclick();assert.equal(writes.length,2,'unchanged value does not write');
await context.openCreatorRatingEditor('test','tier');value='C';fail=true;await nodes.saveCreatorRatingBtn.onclick();assert.equal(open,true);assert.equal(nodes.creatorRatingError.textContent,'Save failed');assert.equal(record.tier,'B');fail=false;
await context.openCreatorRatingEditor('test','tier');record.tier='A';value='C';await nodes.saveCreatorRatingBtn.onclick();assert.equal(writes.length,2);assert.match(nodes.creatorRatingError.textContent,/teammate/);
await context.openCreatorRatingEditor('test','fit_verdict');value='Good';await nodes.saveCreatorRatingBtn.onclick();assert.equal(writes.length,2,'invalid rating rejected');
await context.openCreatorRatingEditor('test','tier');value='';await nodes.saveCreatorRatingBtn.onclick();assert.deepEqual(writes[2],{id:'test',tier:null});
assert.equal(record.owner_id,'owner');
const creatorBefore=structuredClone(record);
await context.openCreatorRatingEditor('test','outreach_status');
assert.ok(nodes.creatorRatingFields.innerHTML.includes('value="Contacted" selected'));
assert.ok(!nodes.creatorRatingFields.innerHTML.includes('>Select</option>'),'outreach cannot be blank');
value='Replied';await nodes.saveCreatorRatingBtn.onclick();
assert.deepEqual(outreachWrites[0],{id:'touch',status:'Replied'});
assert.equal(outreach.notes,'keep notes');assert.equal(outreach.last_contact_at,'2026-11-01');assert.equal(outreach.next_follow_up_at,'2026-11-20');assert.deepEqual(record,creatorBefore);
await context.openCreatorRatingEditor('test','outreach_status');value='';await nodes.saveCreatorRatingBtn.onclick();assert.equal(outreachWrites.length,1);
await context.openCreatorRatingEditor('test','outreach_status');value='Negotiating';outreach.status='Paused';await nodes.saveCreatorRatingBtn.onclick();assert.equal(outreachWrites.length,1);assert.match(nodes.creatorRatingError.textContent,/teammate/);
outreach=null;await context.openCreatorRatingEditor('test','outreach_status');value='Contacted';await nodes.saveCreatorRatingBtn.onclick();assert.deepEqual(outreachWrites[1],{creator_id:'test',status:'Contacted',channel:'Instagram DM',owner_id:'owner'});
assert.deepEqual(record,creatorBefore);
console.log('Creator Tier/Fit/Outreach: isolated writes, preservation of notes/contact/follow-up, missing outreach, valid options, no-op, failure, conflict, refresh and history passed.');
