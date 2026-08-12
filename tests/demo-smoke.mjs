import assert from 'node:assert/strict';
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

console.log(JSON.stringify({
  creators: db.creators.length,
  outreach: db.outreach_records.length,
  collaborations: db.collaborations.length,
  shipments: db.shipments.length,
  deliverables: db.deliverables.length,
  products: db.products.length
}));
