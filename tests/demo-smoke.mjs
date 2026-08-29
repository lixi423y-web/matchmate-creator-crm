import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { demoDatabase } from '../src/demo.js';

const db = demoDatabase(1000);
const creatorIds = new Set(db.creators.map(row => row.id));
const collaborationIds = new Set(db.collaborations.map(row => row.id));

assert.equal(db.creators.length, 1000, 'demo must contain 1,000 creators');
assert.equal(creatorIds.size, db.creators.length, 'creator IDs must be unique');
assert.ok(db.creators.every(row => typeof row.handle === 'string' && row.handle.trim()), 'demo creators must enforce the legacy non-null handle contract');
assert.ok(db.collaborations.length >= 100, 'demo must exercise collaboration pagination');
assert.ok(db.shipments.length >= 50, 'demo must exercise fulfillment queues');
assert.ok(db.deliverables.length >= 100, 'demo must exercise deliverables');
assert.equal(db.products.length, 15, 'demo must include every set and individual product');
assert.deepEqual(new Set(db.products.map(row => row.category)), new Set(['Set', 'Scrunchie', 'Bandana', 'Necklace']), 'demo products must cover all product groups');

for (const row of db.collaborations) {
  assert.ok(creatorIds.has(row.creator_id), `orphan collaboration ${row.id}`);
}
for (const row of db.shipments) {
  assert.ok(collaborationIds.has(row.collaboration_id), `orphan shipment ${row.id}`);
}
for (const row of db.deliverables) {
  assert.ok(collaborationIds.has(row.collaboration_id), `orphan deliverable ${row.id}`);
}

globalThis.window = { MATCHMATE_CONFIG: {} };
globalThis.location = { search: '?demo=1&size=1000' };
const {
  normalizeWritePayload,
  creatorAddressSnapshot,
  normalizeCreatorHandle,
  createCreatorWithPrimaryAccount,
  saveCreatorAccount,
  importCreators,
  createOrderForCreator,
  createCollaborationFromOutreach,
  cancelCollaboration,
  syncCollaborationStageForRecord,
  save,
  creatorPage,
  getOne,
  related
} = await import('../src/data.js?demo-smoke=handle-contract1');

const normalized = normalizeWritePayload({ id: '', owner_id: '', campaign_id: '', tags: '', languages: '', due_date: '', next_follow_up_at: '', approved_budget: '', followers: '', quantity: '', display_name: 'Test' });
assert.equal('id' in normalized, false, 'blank primary ID must be omitted so database defaults can apply');
assert.equal(normalized.owner_id, null, 'blank optional owner UUID must be saved as null');
assert.equal(normalized.campaign_id, null, 'blank optional campaign UUID must be saved as null');
assert.deepEqual(normalized.tags, [], 'blank tags must be saved as an empty array');
assert.deepEqual(normalized.languages, [], 'blank languages must be saved as an empty array');
assert.equal(normalized.due_date, null, 'blank optional date must be saved as null');
assert.equal(normalized.next_follow_up_at, null, 'blank optional timestamp must be saved as null');
assert.equal(normalized.approved_budget, null, 'blank optional numeric value must be saved as null');
assert.equal(normalized.followers, null, 'blank optional integer must be saved as null');
assert.equal(normalized.quantity, 1, 'blank required quantity must use the safe default');

const handle = `Creator_Save_Test_${Date.now()}`;
const created = await createCreatorWithPrimaryAccount({
  creator: { display_name: '', owner_id: '' },
  account: { handle: `  @${handle}  `, profile_url: '' }
});
assert.equal(normalizeCreatorHandle(`  @${handle}  `), handle, 'handle normalization must trim whitespace and one leading @');
assert.equal(created.handle, handle, 'legacy creators.handle must satisfy the production NOT NULL contract');
assert.equal(created.display_name, handle, 'handle must be used when display name is omitted');
assert.equal(created.owner_id, null, 'new creator may be saved without an owner');
const newest = await creatorPage({ page: 1, pageSize: 1, sort: 'created_at.desc' });
assert.equal(newest.data[0].id, created.id, 'new creator must appear first when sorted by added time');
const accounts = await related('creator_accounts', 'creator_id', created.id);
assert.equal(accounts.length, 1, 'new creator must receive one primary account');
assert.equal(accounts[0].handle, handle, 'primary account must keep the normalized handle');
assert.equal(accounts[0].is_primary, true, 'new account must be primary');
const outreach = await related('outreach_records', 'creator_id', created.id);
assert.equal(outreach.length, 1, 'new creator must receive one initial outreach record');
assert.equal(outreach[0].status, 'Not Contacted', 'initial outreach status must be Not Contacted');
await assert.rejects(
  createCreatorWithPrimaryAccount({ creator: {}, account: { handle: `@${handle.toUpperCase()}` } }),
  /already in Creator database/,
  'duplicate Instagram handles must be blocked case-insensitively'
);

const renamedHandle = `${handle}_Renamed`;
const updatedAccount = await saveCreatorAccount({ ...accounts[0], handle: ` @${renamedHandle} `, is_primary: true });
assert.equal(updatedAccount.handle, renamedHandle, 'primary account edit must normalize its handle');
assert.equal((await getOne('creators', created.id)).handle, renamedHandle, 'primary account edit must synchronize legacy creators.handle');

const csvHandle = `csv_creator_${Date.now()}`;
const csvImport = await importCreators([{
  row: 2,
  error: '',
  creator: { display_name: 'CSV Creator' },
  account: { platform: 'Instagram', handle: ` @${csvHandle} `, profile_url: '' }
}], 'skip');
assert.equal(csvImport.created, 1, 'CSV import must create a valid creator');
assert.equal(csvImport.errors.length, 0, 'CSV import must not fail the legacy handle contract');
const csvResult = await creatorPage({ page: 1, pageSize: 10, search: csvHandle, sort: 'created_at.desc' });
const csvCreator = csvResult.data.find(row => row.handle === csvHandle);
assert.ok(csvCreator, 'CSV creator must include legacy creators.handle');
const csvAccounts = await related('creator_accounts', 'creator_id', csvCreator.id);
assert.equal(csvAccounts[0].handle, csvHandle, 'CSV primary account and legacy creator handle must match');

const quickOrder = await createOrderForCreator(created.id, null);
assert.equal(quickOrder.creator_id, created.id, 'quick order must belong to the creator');
assert.equal(quickOrder.type, 'Seeding', 'quick order must use the default collaboration type');
assert.equal(quickOrder.stage, 'Confirmed — Awaiting Details', 'quick order must start in the details-pending stage');
assert.equal(quickOrder.rights_status, 'Not Discussed', 'quick order must use a safe rights default');
assert.equal(quickOrder.payment_status, 'Gifted', 'quick order must use the default gifted payment status');
assert.match(quickOrder.start_date, /^\d{4}-\d{2}-\d{2}$/, 'quick order must receive today as its start date');
assert.equal((await related('outreach_records', 'creator_id', created.id))[0].converted_collaboration_id, undefined, 'ordinary repeat orders must not rewrite outreach conversion history');

const savedAddress = await save('creator_addresses', {
  creator_id: created.id,
  label: 'Shipping address',
  recipient_name: 'Demo recipient',
  full_address: '123 Demo Street, New York, NY 10001',
  phone: '000-000-0000',
  country: 'United States',
  is_default: true
});
const addressSnapshot = creatorAddressSnapshot(savedAddress);
assert.deepEqual(addressSnapshot, {
  label: 'Shipping address',
  recipient_name: 'Demo recipient',
  phone: '000-000-0000',
  country: 'United States',
  full_address: '123 Demo Street, New York, NY 10001',
  source: 'creator_addresses'
}, 'shipment draft must copy the creator address without retyping it');
assert.deepEqual(creatorAddressSnapshot({}), {}, 'a shipment draft may be saved before an address is known');
const shipmentDraft = await save('shipments', {
  collaboration_id: quickOrder.id,
  status: 'Draft',
  owner_id: '',
  address_id: savedAddress.id,
  address_snapshot: addressSnapshot,
  tracking_url: '',
  shipped_at: '',
  delivered_at: ''
});
assert.equal(shipmentDraft.status, 'Draft', 'shipment may be saved immediately as a draft');
assert.equal(shipmentDraft.address_id, savedAddress.id, 'shipment must retain the source creator address');
assert.equal(shipmentDraft.shipped_at, null, 'blank shipment dates must save as null');
assert.equal(shipmentDraft.delivered_at, null, 'blank delivery dates must save as null');

const workflowOrder = await createOrderForCreator(created.id, null);
const readyShipment = await save('shipments', { collaboration_id: workflowOrder.id, status: 'Ready' });
const readySync = await syncCollaborationStageForRecord('shipments', readyShipment);
assert.equal(readySync.changed, true, 'a Ready shipment must advance its collaboration stage');
assert.equal((await getOne('collaborations', workflowOrder.id)).stage, 'Ready to Fulfill', 'Ready shipment must appear as Ready to Fulfill everywhere');
const shippedShipment = await save('shipments', { ...readyShipment, status: 'Shipped' });
await syncCollaborationStageForRecord('shipments', shippedShipment);
assert.equal((await getOne('collaborations', workflowOrder.id)).stage, 'In Fulfillment', 'Shipped shipment must advance the collaboration to In Fulfillment');
const publication = await save('publications', { collaboration_id: workflowOrder.id, platform: 'Instagram', url: 'https://www.instagram.com/p/demo/', status: 'Published' });
const publishedSync = await syncCollaborationStageForRecord('publications', publication);
assert.equal(publishedSync.changed, true, 'a saved published link must advance the collaboration stage');
assert.equal((await getOne('collaborations', workflowOrder.id)).stage, 'Published', 'published link must appear as Published everywhere');
const noDowngrade = await syncCollaborationStageForRecord('shipments', shippedShipment);
assert.equal(noDowngrade.changed, false, 'an older workflow event must never downgrade a Published collaboration');
assert.equal((await getOne('collaborations', workflowOrder.id)).stage, 'Published', 'Published stage must remain stable after older shipment edits');

const collaboration = await createCollaborationFromOutreach(created.id, null);
assert.equal(collaboration.creator_id, created.id, 'confirmed collaboration must belong to the creator');
const convertedOutreach = await related('outreach_records', 'creator_id', created.id);
assert.equal(convertedOutreach[0].converted_collaboration_id, collaboration.id, 'outreach must point to the created collaboration');
const cancellation = await cancelCollaboration(collaboration, 'Demo smoke test');
assert.equal(cancellation.record.stage, 'Closed', 'cancelled collaboration must be retained as closed');
assert.equal(cancellation.activityWarning, false, 'demo cancellation must record its activity history');

const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
for (const token of [
  "beginDraftGuard('creator profile'",
  "beginDraftGuard('collaboration'",
  "beginDraftGuard('product selection'",
  "beginDraftGuard('outreach touch'",
  "beginDraftGuard(title.toLowerCase(),$('#creatorRelatedForm'))",
  "beginDraftGuard(title.toLowerCase(),$('#relatedForm'))",
  "window.addEventListener('beforeunload',warnBeforeUnload)",
  'function closeDrawer(force=false)',
  'discardChangesThen(()=>onClick(tab))',
  'async function createQuickOrder(creator,button)',
  "Everything else can be added later.",
  "Products, address, due date and all other details can be added later.",
  "tabs=c.id?",
  "editing=editing||!c.id"
]) assert.ok(appSource.includes(token), `unsaved-change guard must include ${token}`);
assert.ok(!appSource.includes("renderCollaborationDrawer(editing&&tab==='overview')"), 'new order tab changes must not discard editing state');
assert.ok(!appSource.includes("field('display_name','Display Name (optional)'"), 'new creator form must require only the Instagram Handle');
assert.ok(appSource.includes("type==='creator'?'Add creator':'Create order'"), 'the primary order action must use plain order language');
assert.ok(indexSource.includes('id="newCollaborationBtn" type="button">Create order</button>'), 'the global order action must use plain order language');
assert.ok(indexSource.includes('id="drawerDraftStatus"'), 'drawer must show an unsaved-change indicator');
assert.ok(appSource.includes("related('creator_addresses','creator_id',c.creator_id)"), 'shipment tab must load the creator address automatically');
assert.ok(appSource.includes("body.innerHTML=context+relatedEditorForm('shipments',record,false)"), 'an empty shipment tab must open the draft form without an Add click');
assert.ok(appSource.includes("relatedEditorForm('deliverables',record,false)"), 'an empty deliverables tab must open the form without an Add click');
assert.ok(appSource.includes("payload.type=payload.type.trim()||'TBD'"), 'a deliverable placeholder must remain savable before details are known');
assert.ok(appSource.includes("payload.address_snapshot=fullAddress?"), 'shipment save must accept an empty draft address');
assert.ok(appSource.includes('Shipping Address (optional for Draft)'), 'shipment address must be visibly optional while the record is a draft');
assert.ok(!appSource.includes("textarea('address_snapshot','Full Shipping Address'"), 'shipment must not require retyping the full address');
assert.ok(!appSource.includes("invalid.reportValidity()"), 'invalid fields must use the visible drawer error instead of a silent native tooltip');
assert.ok(appSource.includes('class="cell-action stage-quick-edit"'), 'collaboration rows must expose a direct stage edit action');
assert.ok(appSource.includes("openCollaboration(tr.dataset.id,'overview',true)"), 'stage action must open the editable overview directly');
assert.ok(appSource.includes('class="cell-action products-quick-edit'), 'collaboration rows must expose a direct product selection action');
assert.ok(appSource.includes("openCollaboration(tr.dataset.id,'products')"), 'product action must open product selection directly');
assert.ok(appSource.includes('Edit stage & details'), 'collaboration footer must explain where stage is changed');
assert.ok(appSource.includes('No products selected'), 'empty product state must explain that no product was saved');
assert.ok(appSource.includes('refreshCollaborationAfterMutation(c.id,tab)'), 'related saves must refresh the drawer, collaboration list and dashboard together');
assert.ok(appSource.includes('refreshCreatorAfterMutation(creatorId)'), 'outreach saves must refresh the creator list and dashboard together');
assert.ok(appSource.includes("payload.status='Published'"), 'a filled publication URL must automatically use Published status');
assert.ok(appSource.includes('syncCollaborationStageForRecord(table,saved)'), 'related records must synchronize the parent workflow stage');

console.log(JSON.stringify({
  creators: db.creators.length,
  outreach: db.outreach_records.length,
  collaborations: db.collaborations.length,
  shipments: db.shipments.length,
  deliverables: db.deliverables.length,
  products: db.products.length,
  creatorCreateFlow: true,
  collaborationActionFlow: true,
  automaticWorkflowSync: true,
  unsavedChangeGuard: true
}));
