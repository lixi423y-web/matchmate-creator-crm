import assert from 'node:assert/strict';
const c='00000000-0000-4000-8000-000000000001',creator='00000000-0000-4000-8000-000000000002',calls=[];
globalThis.location={search:''};
globalThis.window={MATCHMATE_CONFIG:{supabaseUrl:'https://test.invalid',supabasePublishableKey:'test-publishable'},supabase:{createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})}})}};
globalThis.fetch=async(url,options)=>{
 calls.push({url,method:options.method||'GET'});
 const table=new URL(url).pathname.split('/').at(-1),rows={
  collaboration_directory:[{id:c,creator_id:creator,owner_id:'outreach-person',stage:'Confirmed — Awaiting Details'}],
  collaboration_products:[{id:'item',collaboration_id:c,product_id:'sku',quantity:2,product:{name:'Sample product'}}],
  shipments:[{id:'parcel',collaboration_id:c,status:'Draft',owner_id:'shipping-person',address_snapshot:{},created_at:'2026-11-13'}],
  creator_addresses:[{id:'address',creator_id:creator,is_default:true,recipient_name:'Sample recipient',full_address:'Synthetic address'}],
  publications:[{id:'post',collaboration_id:c,url:'https://example.test/post',status:'Published'}]
 }[table]||[];
 return new Response(JSON.stringify(rows),{status:200,headers:{'content-range':'0-0/1'}});
};
const api=await import('../src/data.js');
await assert.rejects(api.collaborationPage(),/session expired/);assert.equal(calls.length,0);
await api.restoreSession();const result=await api.collaborationPage({page:1,pageSize:50});
const row=result.data[0];
assert.equal(row.owner_id,'outreach-person');assert.equal(row.shipments[0].owner_id,'shipping-person');
assert.equal(row.shipments[0].status,'Draft');assert.equal(row.creator_shipping_address.recipient_name,'Sample recipient');
assert.equal(row.collaboration_products[0].quantity,2);assert.equal(row.publications[0].url,'https://example.test/post');
assert.ok(calls.every(c=>c.method==='GET'));assert.equal(calls.length,5);
console.log('Collaboration handoff list: authenticated batch reads, independent owners, saved address, products and publication; zero mutations passed.');
