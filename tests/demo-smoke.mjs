import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { demoDatabase } from '../src/demo.js';

const db = demoDatabase(1000);
const creatorIds = new Set(db.creators.map(row => row.id));
const collaborationIds = new Set(db.collaborations.map(row => row.id));

assert.equal(db.creators.length, 1000, 'demo must contain 1,000 creators');
assert.equal(creatorIds.size, db.creators.length, 'creator IDs must be unique');
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
  createCreatorWithPrimaryAccount,
  createCollaborationFromOutreach,
  cancelCollaboration,
  creatorPage,
  related
} = await import('../src/data.js?demo-smoke=action-feedback');

const normalized = normalizeWritePayload({ id: '', owner_id: '', campaign_id: '', display_name: 'Test' });
assert.equal('id' in normalized, false, 'blank primary ID must be omitted so database defaults can apply');
assert.equal(normalized.owner_id, null, 'blank optional owner UUID must be saved as null');
assert.equal(normalized.campaign_id, null, 'blank optional campaign UUID must be saved as null');

const handle = `creator_save_test_${Date.now()}`;
const created = await createCreatorWithPrimaryAccount({
  creator: { display_name: '', owner_id: '' },
  account: { handle, profile_url: '' }
});
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
  "renderCollaborationDrawer(editing&&tab==='overview')"
]) assert.ok(appSource.includes(token), `unsaved-change guard must include ${token}`);
assert.ok(indexSource.includes('id="drawerDraftStatus"'), 'drawer must show an unsaved-change indicator');

console.log(JSON.stringify({
  creators: db.creators.length,
  outreach: db.outreach_records.length,
  collaborations: db.collaborations.length,
  shipments: db.shipments.length,
  deliverables: db.deliverables.length,
  products: db.products.length,
  creatorCreateFlow: true,
  collaborationActionFlow: true,
  unsavedChangeGuard: true
}));
