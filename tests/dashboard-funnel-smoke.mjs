import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/data.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function summarizeDashboard('),source.indexOf('export function exportRows('));
const ctx=vm.createContext({});vm.runInContext(code,ctx);
function summary(input){ctx.input=input;return JSON.parse(JSON.stringify(vm.runInContext('summarizeDashboard(input)',ctx)));}
const input={totalCreators:10,outreach:[
  {creator_id:'a',status:'Awaiting Reply'},
  {creator_id:'b',status:'Replied',updated_at:'2026-10-01'},
  {creator_id:'b',status:'Follow-up Due',updated_at:'2026-10-16'},
  {creator_id:'c',status:'Negotiating'},
  {creator_id:'d',status:'Not Contacted'},
  {creator_id:'e',status:'Contacted'}
],collaborations:[
  {id:'1',creator_id:'a',stage:'Confirmed — Awaiting Details'},
  {id:'2',creator_id:'a',stage:'Delivered'},
  {id:'3',creator_id:'f',stage:'Ready to Fulfill'},
  {id:'4',creator_id:'g',stage:'Closed'},
  {id:'5',creator_id:'h',stage:'Cancelled'}
]};
const original=JSON.stringify(input),result=summary(input);
assert.deepEqual(result.rates.reply,{numerator:4,denominator:5,percent:80});
assert.deepEqual(result.rates.collaboration,{numerator:2,denominator:4,percent:50});
assert.equal(result.notContacted,5);
assert.equal(JSON.stringify(input),original,'Statistics must not rewrite outreach or collaborations');
const onlyCollab=summary({totalCreators:1,collaborations:[{id:'1',creator_id:'a',stage:'Published'},{id:'2',creator_id:'a',stage:'Completed'}]});
assert.deepEqual(onlyCollab.rates.reply,{numerator:1,denominator:1,percent:100});
assert.deepEqual(onlyCollab.rates.collaboration,{numerator:1,denominator:1,percent:100});
assert.equal(onlyCollab.rates.post.numerator,2,'Fulfillment rates still use collaboration rounds');
const empty=summary({totalCreators:0});
assert.deepEqual(empty.rates.reply,{numerator:0,denominator:0,percent:0});
assert.deepEqual(empty.rates.collaboration,{numerator:0,denominator:0,percent:0});
const many=summary({totalCreators:30,outreach:Array.from({length:26},(_,i)=>({creator_id:String(i),status:'Replied'})),collaborations:Array.from({length:40},(_,i)=>({id:String(i),creator_id:String(i%30),stage:'Delivered'}))});
assert.deepEqual(many.rates.reply,{numerator:30,denominator:30,percent:100});
assert.deepEqual(many.rates.collaboration,{numerator:30,denominator:30,percent:100});
const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');assert.ok(app.includes('Creators with confirmed collaborations / replied creators'));
console.log('Dashboard funnel: collaboration implies reply/contact, historical replies retained, repeat creators deduped, inactive rounds excluded, empty case safe, no data mutation.');
