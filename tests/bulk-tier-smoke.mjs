import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {TIERS} from '../src/constants.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.ok(html.includes('<label>Tier<select id="bulkTier"></select></label>'));
assert.ok(app.includes("setOptions($('#bulkTier'),TIERS,'No change')"));
const nodes=Object.fromEntries(['bulkTier','bulkStage','bulkOwner','bulkFit','bulkRelationship','bulkTags','applyBulkBtn'].map(id=>[id,{value:''}]));
let writes=[],messages=[];
const context=vm.createContext({TIERS,$:s=>nodes[s.slice(1)],state:{creatorSelection:new Set(['selected-1','selected-2'])},
toast:m=>messages.push(m),bulkUpdateCreators:async(ids,patch)=>writes.push({ids:[...ids],patch:{...patch}}),
runAction:async(button,label,work)=>{await work();return{ok:true}},refreshViews:async()=>{}});
vm.runInContext(app.split('\n').find(line=>line.startsWith('async function applyBulkUpdate(')),context);
await context.applyBulkUpdate();
assert.equal(writes.length,0,'blank fields do not write');
for(const tier of TIERS){
  nodes.bulkTier.value=tier;await context.applyBulkUpdate();
  assert.deepEqual(writes.at(-1),{ids:['selected-1','selected-2'],patch:{tier}},'only selected creators and Tier are patched');
}
nodes.bulkTier.value='Good';await context.applyBulkUpdate();assert.equal(writes.length,3,'invalid Tier rejected');
nodes.bulkTier.value='';nodes.bulkOwner.value='owner';
await context.applyBulkUpdate();
assert.deepEqual(writes.at(-1).patch,{owner_id:'owner'},'No change does not send Tier or clear it');
console.log('Bulk Tier: A/B/C, selected IDs only, isolated patches, blank no-op, other fields preserved, invalid Tier rejected.');
