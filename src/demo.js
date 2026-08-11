import{OUTREACH_STATUSES,COLLABORATION_STAGES,FIT_VERDICTS,ACCOUNT_TYPES,DOG_SIZES}from'./constants.js';
const products=[
  {id:'prod-rose-set',sku:'RB-SET',name:'Rose Bloom Set'},
  {id:'prod-mocha-set',sku:'MS-SET',name:'Mocha Sky Set'},
  {id:'prod-lavender-set',sku:'LM-SET',name:'Lavender Mist Set'},
  {id:'prod-wildflower-set',sku:'WC-SET',name:'Wildflower Charm Necklace Set'},
  {id:'prod-ocean-set',sku:'OP-SET',name:'Ocean Pearl Necklace Set'},
  {id:'prod-emerald-set',sku:'ED-SET',name:'Emerald Dew Necklace Set'}
];
export function demoDatabase(size=1000){
  const creators=Array.from({length:size},(_,i)=>({
    id:`creator-${i+1}`,creator_code:`CR-${String(i+1).padStart(5,'0')}`,display_name:`Creator ${i+1}`,nickname:`creator_${i+1}`,
    location:i%7?'United States':'New York, United States',timezone:'America/New_York',languages:['English'],preferred_contact_method:'Instagram DM',contact_email:`creator${i+1}@example.com`,relationship_status:i%11===0?'Repeat Partner':'New',fit_verdict:FIT_VERDICTS[i%4],fit_notes:i%4===0?'Polished owner + pet content.':'Review recent feed.',tier:['A','B','C'][i%3],account_type:ACCOUNT_TYPES[i%4],appearance:i%3===0?'Human + Pet':'Human Only',dog_size:DOG_SIZES[i%4],source_group:i%2?'Benchmark brand':'Organic search',followers:400+(i*137)%9600,owner_id:i%2?'owner-ivy':'owner-team',tags:i%5===0?['fashion','repeat']:['seeding'],do_not_contact:false,created_at:new Date(2026,0,1+i%180).toISOString(),updated_at:new Date(2026,6,1+i%28).toISOString()
  }));
  const creator_accounts=creators.map((c,i)=>({id:`account-${i+1}`,creator_id:c.id,platform:'Instagram',handle:c.nickname,profile_url:`https://instagram.com/${c.nickname}`,followers:c.followers,is_primary:true}));
  const creator_pets=creators.slice(0,760).map((c,i)=>({id:`pet-${i+1}`,creator_id:c.id,name:`Pet ${i+1}`,breed:i%2?'Dachshund':'Goldendoodle',size:DOG_SIZES[i%4],neck_size_cm:24+i%24,weight_kg:4+i%26,fit_notes:''}));
  const outreach_records=creators.map((c,i)=>({id:`outreach-${i+1}`,creator_id:c.id,status:OUTREACH_STATUSES[i%9],channel:'Instagram DM',last_contact_at:i%5?new Date(2026,6,20+i%8).toISOString():null,next_follow_up_at:i%8===0?new Date(2026,7,15).toISOString():null,owner_id:c.owner_id,notes:'',created_at:c.created_at,updated_at:c.updated_at}));
  const collaborationCreators=creators.filter((_,i)=>i%7===0);
  const collaborations=collaborationCreators.map((c,i)=>({id:`collab-${i+1}`,collaboration_code:`CO-${String(i+1).padStart(5,'0')}`,creator_id:c.id,campaign_id:i%2?'campaign-founding':'campaign-repeat',collaboration_name:i%3===0?'Repeat seeding':'Founding Matchmates',type:'Seeding',stage:COLLABORATION_STAGES[i%COLLABORATION_STAGES.length],owner_id:c.owner_id,start_date:'2026-07-01',due_date:'2026-08-15',rights_status:'Organic Repost Approved',payment_status:'Gifted',is_repeat:i%3===0,created_at:c.created_at,updated_at:c.updated_at}));
  const collaboration_products=collaborations.map((c,i)=>({id:`cp-${i+1}`,collaboration_id:c.id,product_id:products[i%products.length].id,quantity:1,is_primary:true,product:products[i%products.length]}));
  const shipments=collaborations.filter((_,i)=>i%2===0).map((c,i)=>({id:`shipment-${i+1}`,shipment_code:`SH-${String(i+1).padStart(5,'0')}`,collaboration_id:c.id,status:SHIPMENT_STATUSES_FOR_DEMO[i%4],carrier:'USPS',tracking_number:`9500${String(i+1).padStart(18,'0')}`,shipped_at:'2026-07-20',delivered_at:i%3?'2026-07-24':null,address_snapshot:{line:'Demo address'},created_at:c.created_at}));
  const deliverables=collaborations.map((c,i)=>({id:`deliverable-${i+1}`,collaboration_id:c.id,type:i%2?'Instagram Reel':'Instagram Post',status:i%4===0?'Published':'Pending',due_at:'2026-08-15'}));
  return{creators,creator_accounts,creator_pets,creator_addresses:[],outreach_records,collaborations,collaboration_products,shipments,shipment_items:[],inventory_movements:[],deliverables,publications:[],assets:[],activity_logs:[],products,campaigns:[{id:'campaign-founding',name:'Founding Matchmates'},{id:'campaign-repeat',name:'Repeat Seeding'}],owners:[{id:'owner-ivy',name:'Ivy'},{id:'owner-team',name:'Team'}]};
}
const SHIPMENT_STATUSES_FOR_DEMO=['Draft','Ready','Shipped','Delivered'];
