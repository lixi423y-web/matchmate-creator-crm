import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = { MATCHMATE_CONFIG: {} };
globalThis.location = { search: '?demo=1&size=30' };

const { normalizeWritePayload, writableFieldsFor, save } = await import(`../src/data.js?save-contract=${Date.now()}`);

const formFields = {
  creators: ['display_name','nickname','legal_name','contact_email','contact_phone','tier','fit_verdict','account_type','appearance','dog_size','relationship_status','owner_id','location','source_group','source_detail','followers','tags','fit_notes','notes','database_notes'],
  creator_accounts: ['platform','handle','profile_url','followers','engagement_rate','is_primary','link_status'],
  creator_pets: ['name','breed','size','neck_size_cm','weight_kg','fit_notes'],
  creator_addresses: ['label','recipient_name','phone','country','is_default','full_address'],
  outreach_records: ['status','channel','last_contact_at','next_follow_up_at','notes'],
  collaborations: ['collaboration_name','creator_id','campaign_id','stage','type','owner_id','start_date','due_date','rights_status','payment_status','approved_budget','is_repeat','notes'],
  collaboration_products: ['product_id','quantity','is_primary','notes'],
  deliverables: ['type','platform','quantity','status','due_at','brief_url','notes'],
  shipments: ['owner_id','status','carrier','service_level','tracking_number','tracking_url','shipped_at','delivered_at','address_id','address_snapshot','exception_notes'],
  publications: ['platform','format','url','status','published_at','views','likes','comments','shares','saves','notes'],
  assets: ['asset_type','file_name','external_url','rights_status','usage_notes'],
  activity_logs: ['entity_type','entity_id','collaboration_id','creator_id','action','before_data','after_data','note']
};

for (const [table, fields] of Object.entries(formFields)) {
  const allowed = new Set(writableFieldsFor(table));
  assert.ok(allowed.size, `${table} must have an explicit write contract`);
  for (const field of fields) assert.ok(allowed.has(field), `${table}.${field} must be allowed by the write contract`);
}

const shipment = normalizeWritePayload({
  collaboration_id: crypto.randomUUID(), status: 'Draft', carrier: ' ', service_level: '', tracking_number: '', tracking_url: '',
  address_id: '', address_snapshot: {}, shipped_at: '', delivered_at: '', exception_notes: '', comments: 42,
  shipment_code: 'SHOULD-NOT-BE-WRITTEN', created_at: '2026-01-01', updated_at: '2026-01-02', creator_name: 'Hydrated view value'
}, 'shipments');
assert.equal(shipment.carrier, null, 'blank shipment carrier must be null');
assert.equal(shipment.tracking_number, null, 'blank shipment tracking number must be null so it cannot collide with the unique index');
assert.equal(shipment.tracking_url, null, 'blank shipment URL must be null');
assert.equal(shipment.address_id, null, 'blank shipment address UUID must be null');
assert.equal(shipment.shipped_at, null, 'blank shipped date must be null');
assert.equal(shipment.delivered_at, null, 'blank delivered date must be null');
assert.equal(shipment.exception_notes, null, 'blank exception notes must be null');
for (const key of ['comments','shipment_code','created_at','updated_at','creator_name']) assert.equal(key in shipment, false, `shipments must strip foreign/generated field ${key}`);

const publication = normalizeWritePayload({ collaboration_id: crypto.randomUUID(), platform: 'Instagram', comments: '12', unknown_field: 'no' }, 'publications');
assert.equal(publication.comments, 12, 'publication comments must remain a numeric publication metric');
assert.equal('unknown_field' in publication, false, 'publication writes must strip unknown fields');

const importedCreator = normalizeWritePayload({ handle: 'audit_creator', appearance: 'Human + Pet', source_group: 'Benchmark brand', source_detail: 'Wild One', followers: '3500' }, 'creators');
assert.equal(importedCreator.appearance, 'Human + Pet', 'CSV appearance must survive the creator write contract');
assert.equal(importedCreator.source_group, 'Benchmark brand', 'CSV source group must survive the creator write contract');
assert.equal(importedCreator.source_detail, 'Wild One', 'CSV source detail must survive the creator write contract');
assert.equal(importedCreator.followers, 3500, 'CSV followers must be normalized and preserved');

const partialUpdate = normalizeWritePayload({ id: crypto.randomUUID(), notes: 'Updated only' }, 'collaborations');
assert.deepEqual(Object.keys(partialUpdate).sort(), ['id','notes'], 'partial updates must not inject defaults that overwrite existing values');

const draftInsert = normalizeWritePayload({ collaboration_id: crypto.randomUUID() }, 'shipments');
assert.equal(draftInsert.status, 'Draft', 'new shipments must default to Draft');
assert.deepEqual(draftInsert.address_snapshot, {}, 'new shipment drafts must allow an empty address snapshot');

const deliverableInsert = normalizeWritePayload({ collaboration_id: crypto.randomUUID(), quantity: '' }, 'deliverables');
assert.equal(deliverableInsert.quantity, 1, 'blank deliverable quantity must default to 1');
assert.equal(deliverableInsert.status, 'Pending', 'new deliverables must default to Pending');

const savedShipment = await save('shipments', { ...shipment, comments: 99 });
assert.equal('comments' in savedShipment, false, 'the common save path must never leak publication comments into shipments');

const schema = await readFile(new URL('../supabase/migrations/001_crm_v2_additive_schema.sql', import.meta.url), 'utf8');
for (const table of Object.keys(formFields).filter(table => table !== 'creators')) {
  const start = schema.indexOf(`create table if not exists public.${table} (`);
  assert.ok(start >= 0, `${table} must exist in the schema migration`);
  const end = schema.indexOf('\n);', start);
  const definition = schema.slice(start, end);
  for (const field of formFields[table]) assert.match(definition, new RegExp(`\\b${field}\\b`), `${table}.${field} must exist in the database schema`);
}

const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const dataSource = await readFile(new URL('../src/data.js', import.meta.url), 'utf8');
for (const table of [...appSource.matchAll(/save\('([^']+)'/g), ...dataSource.matchAll(/save\('([^']+)'/g)].map(match => match[1])) {
  assert.ok(writableFieldsFor(table).length, `every static save path must have a write contract: ${table}`);
}
assert.ok(appSource.includes("textarea('exception_notes','Exception Notes'"), 'shipment notes input must use exception_notes');
assert.ok(!appSource.includes("textarea('comments','Exception Notes'"), 'shipment notes must never use the publication comments field');
assert.ok(appSource.includes('This section is out of sync with the database.'), 'schema mismatch errors must be explained instead of hidden');

console.log(JSON.stringify({
  auditedTables: Object.keys(formFields).length,
  shipmentForeignFieldsStripped: true,
  blankOptionalValuesNormalized: true,
  partialUpdatesPreserved: true,
  schemaFieldContractsVerified: true
}));
