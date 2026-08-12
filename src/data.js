import{demoDatabase}from'./demo.js?v=20260812-public';

const cfg=window.MATCHMATE_CONFIG||{};
const demoMode=new URLSearchParams(location.search).get('demo')==='1'||!cfg.supabaseUrl||!cfg.supabaseAnonKey;
const demo=demoMode?demoDatabase(Number(new URLSearchParams(location.search).get('size'))||1000):null;
let session=null;

export const dataMode=demoMode?'demo':'live';
export function currentSession(){return session}
function headers(extra={}){return{apikey:cfg.supabaseAnonKey,Authorization:`Bearer ${cfg.supabaseAnonKey||''}`,'Content-Type':'application/json',...extra}}
async function request(path,options={}){
  const response=await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`,{...options,headers:headers(options.headers)});
  if(!response.ok)throw new Error(await response.text());
  const text=await response.text();return{data:text?JSON.parse(text):null,count:parseCount(response.headers.get('content-range'))};
}
function parseCount(value){const total=String(value||'').split('/')[1];return total&&total!=='*'?Number(total):null}
function cleanSearch(value=''){return value.replace(/[,%()]/g,' ').trim()}
function queryString({select='*',page=1,pageSize=50,sort='updated_at.desc',search='',filters={}}={}){
  const q=new URLSearchParams({select,order:sort,limit:String(pageSize),offset:String((page-1)*pageSize)});
  if(search){const safe=cleanSearch(search);q.set('or',`(display_name.ilike.*${safe}*,nickname.ilike.*${safe}*,contact_email.ilike.*${safe}*,creator_code.ilike.*${safe}*)`)}
  Object.entries(filters).filter(([,v])=>v!==''&&v!=null).forEach(([k,v])=>q.set(k,`eq.${v}`));
  return q.toString();
}
function encodeListQuery({select='*',page=1,pageSize=50,sort='updated_at.desc',search='',filters={},searchFields=[]}={}){
  const q=new URLSearchParams({select,order:sort,limit:String(pageSize),offset:String((page-1)*pageSize)});
  if(search){const safe=cleanSearch(search);q.set('or',`(${searchFields.map(field=>`${field}.ilike.*${safe}*`).join(',')})`)}
  Object.entries(filters).filter(([,v])=>v!==''&&v!=null).forEach(([key,value])=>{
    if(key==='product_id')q.set('product_ids',`cs.{${value}}`);
    else if(key==='start_date')q.set('start_date',`gte.${value}`);
    else if(key==='end_date')q.set('start_date',`lte.${value}`);
    else q.set(key,`eq.${value}`);
  });
  return q.toString();
}
function localRows(table,{page=1,pageSize=50,search='',filters={},sort='updated_at.desc'}={}){
  let rows=[...(demo[table]||[])];
  if(search){const needle=search.toLowerCase();rows=rows.filter(row=>JSON.stringify(row).toLowerCase().includes(needle))}
  Object.entries(filters).filter(([,v])=>v!==''&&v!=null).forEach(([k,v])=>rows=rows.filter(row=>String(row[k]??'')===String(v)));
  const[field,direction]=sort.split('.');rows.sort((a,b)=>String(a[field]||'').localeCompare(String(b[field]||''))*(direction==='asc'?1:-1));
  return{data:rows.slice((page-1)*pageSize,page*pageSize),count:rows.length};
}
export async function list(table,options={}){
  if(demoMode)return localRows(table,options);
  return request(`${table}?${queryString(options)}`,{headers:{Prefer:'count=exact'}});
}
export async function getOne(table,id){
  if(demoMode)return(demo[table]||[]).find(row=>row.id===id)||null;
  const{data}=await request(`${table}?id=eq.${encodeURIComponent(id)}&select=*`);return data?.[0]||null;
}
export async function related(table,column,id,select='*'){
  if(demoMode)return(demo[table]||[]).filter(row=>row[column]===id&&!row.archived_at);
  const{data}=await request(`${table}?${column}=eq.${encodeURIComponent(id)}&archived_at=is.null&select=${encodeURIComponent(select)}&order=created_at.desc`);return data||[];
}
export async function save(table,record){
  const payload={...record};delete payload._meta;
  if(demoMode){const rows=demo[table]||(demo[table]=[]);const index=rows.findIndex(row=>row.id===payload.id);if(index>=0)rows[index]={...rows[index],...payload,updated_at:new Date().toISOString()};else rows.unshift({...payload,id:payload.id||crypto.randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString()});return index>=0?rows[index]:rows[0]}
  if(payload.id){const id=payload.id;delete payload.id;const{data}=await request(`${table}?id=eq.${encodeURIComponent(id)}&select=*`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});return data?.[0]}
  const{data}=await request(`${table}?select=*`,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});return data?.[0];
}
export async function archive(table,id){return save(table,{id,archived_at:new Date().toISOString()})}
export async function count(table,filters={}){
  if(demoMode)return localRows(table,{pageSize:Number.MAX_SAFE_INTEGER,filters}).count;
  const q=new URLSearchParams({select:'id',limit:'1',archived_at:'is.null'});Object.entries(filters).forEach(([k,v])=>q.set(k,`eq.${v}`));const result=await request(`${table}?${q}`,{headers:{Prefer:'count=exact'}});return result.count||0;
}
export async function collaborationPage(options={}){
  if(demoMode){let rows=demo.collaborations.map(row=>hydrateCollaboration(row));const{page=1,pageSize=50,search='',filters={},sort='updated_at.desc'}=options;if(search){const needle=search.toLowerCase();rows=rows.filter(row=>JSON.stringify(row).toLowerCase().includes(needle))}Object.entries(filters).filter(([,v])=>v!==''&&v!=null).forEach(([key,value])=>{rows=rows.filter(row=>key==='product_id'?row.collaboration_products.some(item=>item.product_id===value):String(row[key]??'')===String(value))});const[field,direction]=sort.split('.');rows.sort((a,b)=>String(a[field]||'').localeCompare(String(b[field]||''))*(direction==='asc'?1:-1));return{data:rows.slice((page-1)*pageSize,page*pageSize),count:rows.length}}
  const query=encodeListQuery({...options,searchFields:['collaboration_code','collaboration_name','creator_name','creator_handle','campaign_name','product_names']});
  return request(`collaboration_directory?${query}`,{headers:{Prefer:'count=exact'}});
}
function hydrateCollaboration(row){const creator=demo.creators.find(c=>c.id===row.creator_id),creator_account=demo.creator_accounts.find(x=>x.creator_id===row.creator_id&&x.is_primary)||demo.creator_accounts.find(x=>x.creator_id===row.creator_id);return{...row,creator,creator_account,creator_name:creator?.display_name,creator_handle:creator_account?.handle,creator_profile_url:creator_account?.profile_url,campaign:demo.campaigns.find(c=>c.id===row.campaign_id),collaboration_products:demo.collaboration_products.filter(x=>x.collaboration_id===row.id),shipments:demo.shipments.filter(x=>x.collaboration_id===row.id),deliverables:demo.deliverables.filter(x=>x.collaboration_id===row.id)}}
export async function creatorPage(options={}){
  if(demoMode){const page=localRows('creators',options);page.data=page.data.map(row=>hydrateCreator(row));return page}
  return list('creator_directory',{...options,select:'*'});
}
function hydrateCreator(row){return{...row,creator_accounts:demo.creator_accounts.filter(x=>x.creator_id===row.id),outreach_records:demo.outreach_records.filter(x=>x.creator_id===row.id).slice(0,1),collaborations:demo.collaborations.filter(x=>x.creator_id===row.id)}}
export async function referenceData(){
  if(demoMode)return{owners:demo.owners,campaigns:demo.campaigns,products:demo.products};
  const[owners,campaigns,products]=await Promise.all([list('crm_users',{pageSize:100,sort:'display_name.asc'}),list('campaigns',{pageSize:100,sort:'name.asc'}),list('products',{pageSize:500,sort:'name.asc'})]);
  return{owners:owners.data.map(x=>({...x,name:x.display_name||x.email||'Team member'})),campaigns:campaigns.data,products:products.data};
}
export async function creatorChoices(search=''){
  if(demoMode)return demo.creators.filter(row=>!search||JSON.stringify(row).toLowerCase().includes(search.toLowerCase())).slice(0,100);
  return(list('creator_directory',{pageSize:100,search,sort:'display_name.asc'})).then(result=>result.data);
}
export async function createCollaborationFromOutreach(creatorId,ownerId){
  const collaboration=await save('collaborations',{creator_id:creatorId,type:'Seeding',stage:'Confirmed — Awaiting Details',owner_id:ownerId,start_date:new Date().toISOString().slice(0,10),is_repeat:false});
  const outreach=(await related('outreach_records','creator_id',creatorId))[0];if(outreach)await save('outreach_records',{id:outreach.id,status:'Converted',converted_collaboration_id:collaboration.id});return collaboration;
}
export async function bulkUpdateCreators(ids,patch){
  if(demoMode){for(const id of ids)await save('creators',{id,...patch});return}
  for(let index=0;index<ids.length;index+=100){const chunk=ids.slice(index,index+100);await request(`creators?id=in.(${chunk.join(',')})`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)})}
}
export async function logActivity({entityType,entityId,creatorId=null,collaborationId=null,action,before=null,after=null,note=''}){
  return save('activity_logs',{entity_type:entityType,entity_id:entityId,creator_id:creatorId,collaboration_id:collaborationId,action,before_data:before,after_data:after,note});
}
export async function syncCollaborationProducts(collaborationId,productIds,ownerId=null){
  const selected=[...new Set((productIds||[]).filter(Boolean))];
  let rows;
  if(demoMode)rows=(demo.collaboration_products||[]).filter(row=>row.collaboration_id===collaborationId);
  else{const result=await request(`collaboration_products?collaboration_id=eq.${encodeURIComponent(collaborationId)}&select=*`);rows=result.data||[]}
  const byProduct=new Map(rows.map(row=>[row.product_id,row]));
  for(const row of rows){
    const active=selected.includes(row.product_id);
    if(active&&row.archived_at)await save('collaboration_products',{id:row.id,archived_at:null,quantity:row.quantity||1,owner_id:row.owner_id||ownerId});
    if(!active&&!row.archived_at)await archive('collaboration_products',row.id);
  }
  for(const productId of selected){
    if(byProduct.has(productId))continue;
    const payload={collaboration_id:collaborationId,product_id:productId,quantity:1,is_primary:false,owner_id:ownerId};
    if(demoMode)payload.product=demo.products.find(product=>product.id===productId)||null;
    await save('collaboration_products',payload);
  }
  return related('collaboration_products','collaboration_id',collaborationId,'*,product:products(id,sku,name,category)');
}
export async function dashboardCounts(){
  if(demoMode)return summarizeDashboard({totalCreators:demo.creators.length,outreach:demo.outreach_records,collaborations:demo.collaborations,shipments:demo.shipments,deliverables:demo.deliverables,publications:demo.publications,collaborationProducts:demo.collaboration_products});
  const[totalCreators,outreach,collaborations,shipments,deliverables,publications,collaborationProducts]=await Promise.all([
    count('creators'),
    dashboardRows('outreach_records','creator_id,status,last_contact_at,updated_at,created_at','updated_at.desc'),
    dashboardRows('collaborations','id,creator_id,stage,updated_at,created_at','updated_at.desc'),
    dashboardRows('shipments','id,collaboration_id,status,updated_at,created_at','updated_at.desc'),
    dashboardRows('deliverables','id,collaboration_id,status,due_at,updated_at,created_at','updated_at.desc'),
    dashboardRows('publications','id,collaboration_id,status,published_at,updated_at,created_at','updated_at.desc'),
    dashboardRows('collaboration_products','collaboration_id,product_id,product:products(id,name,sku,category)','created_at.desc')
  ]);
  return summarizeDashboard({totalCreators,outreach,collaborations,shipments,deliverables,publications,collaborationProducts});
}
async function dashboardRows(table,select,order){const{data}=await request(`${table}?select=${encodeURIComponent(select)}&archived_at=is.null&order=${order}&limit=5000`);return data||[]}
function summarizeDashboard({totalCreators,outreach=[],collaborations=[],shipments=[],deliverables=[],publications=[],collaborationProducts=[]}){
  const latestOutreach=new Map();
  [...outreach].sort((a,b)=>stamp(b)-stamp(a)).forEach(row=>{if(!latestOutreach.has(row.creator_id))latestOutreach.set(row.creator_id,row)});
  const outreachRows=[...latestOutreach.values()],contacted=new Set(outreachRows.filter(row=>row.status&&row.status!=='Not Contacted').map(row=>row.creator_id));
  const repliedStatuses=new Set(['Replied','Negotiating','Converted']),replied=new Set(outreachRows.filter(row=>repliedStatuses.has(row.status)).map(row=>row.creator_id));
  const collaborationCreators=new Set(collaborations.map(row=>row.creator_id).filter(Boolean)),collaborationIds=new Set(collaborations.map(row=>row.id));
  const latestShipment=new Map();
  [...shipments].sort((a,b)=>stamp(b)-stamp(a)).forEach(row=>{if(!latestShipment.has(row.collaboration_id))latestShipment.set(row.collaboration_id,row)});
  const shipmentRows=[...latestShipment.values()],shippedIds=new Set(shipmentRows.filter(row=>['Shipped','Delivered'].includes(row.status)).map(row=>row.collaboration_id)),deliveredIds=new Set(shipmentRows.filter(row=>row.status==='Delivered').map(row=>row.collaboration_id));
  const publishedIds=new Set(publications.filter(row=>row.status==='Published').map(row=>row.collaboration_id));
  collaborations.filter(row=>['Published','Completed'].includes(row.stage)).forEach(row=>publishedIds.add(row.id));
  const productMix=new Map();
  collaborationProducts.forEach(row=>{const name=row.product?.name||row.product_id||'Unknown product';productMix.set(name,(productMix.get(name)||0)+1)});
  const pipeline=[
    ['Not Contacted',Math.max(0,totalCreators-contacted.size)],
    ['DM / Follow-up',outreachRows.filter(row=>['Contacted','Awaiting Reply','Follow-up Due','No Response'].includes(row.status)).length],
    ['Replied',outreachRows.filter(row=>row.status==='Replied').length],
    ['Negotiating',outreachRows.filter(row=>row.status==='Negotiating').length],
    ['Ready to fulfill',collaborations.filter(row=>row.stage==='Ready to Fulfill').length],
    ['Shipped',shipmentRows.filter(row=>row.status==='Shipped').length],
    ['Delivered',deliveredIds.size],
    ['Published',publishedIds.size]
  ];
  const awaitingDetails=collaborations.filter(row=>row.stage==='Confirmed — Awaiting Details').length;
  const readyIds=new Set([
    ...collaborations.filter(row=>row.stage==='Ready to Fulfill').map(row=>row.id),
    ...shipmentRows.filter(row=>row.status==='Ready').map(row=>row.collaboration_id)
  ]),ready=readyIds.size;
  const deliveredPendingPost=[...deliveredIds].filter(id=>!publishedIds.has(id)).length;
  return{
    totalCreators,notContacted:pipeline[0][1],followUps:outreachRows.filter(row=>row.status==='Follow-up Due').length,negotiating:pipeline[3][1],ready,
    shipped:shipmentRows.filter(row=>row.status==='Shipped').length,delivered:deliveredIds.size,contentDue:deliverables.filter(row=>row.status==='Pending').length,published:publishedIds.size,
    awaitingDetails,deliveredPendingPost,pipeline,productMix:[...productMix.entries()].sort((a,b)=>b[1]-a[1]),
    rates:{
      reply:rate(replied.size,contacted.size),
      collaboration:rate(collaborationCreators.size,replied.size),
      shipping:rate(shippedIds.size,collaborationIds.size),
      post:rate(publishedIds.size,collaborationIds.size)
    }
  };
}
function stamp(row){return new Date(row.updated_at||row.last_contact_at||row.created_at||0).valueOf()||0}
function rate(numerator,denominator){return{numerator,denominator,percent:denominator?Math.round(numerator/denominator*100):0}}
export function exportRows(filename,rows){if(!rows.length)return;const keys=[...new Set(rows.flatMap(Object.keys))].filter(key=>!['creator_accounts','outreach_records','collaborations','creator','campaign','collaboration_products','shipments','deliverables'].includes(key));const csv=[keys.join(','),...rows.map(row=>keys.map(key=>`"${String(Array.isArray(row[key])?row[key].join('|'):row[key]??'').replaceAll('"','""')}"`).join(','))].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
export async function exportCreatorResults(options){return exportPaged('matchmate-creators.csv',creatorPage,options)}
export async function exportCollaborationResults(options){return exportPaged('matchmate-collaborations.csv',collaborationPage,options)}
async function exportPaged(filename,loader,options){const pageSize=500,rows=[];for(let page=1;page<=20;page++){const result=await loader({...options,page,pageSize});rows.push(...result.data);if(rows.length>=result.count||result.data.length<pageSize)break}exportRows(filename,rows);return rows.length}
