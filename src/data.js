import{demoDatabase}from'./demo.js';

const cfg=window.MATCHMATE_CONFIG||{};
const demoMode=new URLSearchParams(location.search).get('demo')==='1'||!cfg.supabaseUrl||!cfg.supabaseAnonKey;
const demo=demoMode?demoDatabase(Number(new URLSearchParams(location.search).get('size'))||1000):null;
let session=JSON.parse(localStorage.getItem('matchmate_crm_session')||'null');
let refreshPromise=null;

export const dataMode=demoMode?'demo':'live';
export function currentSession(){return session}
export async function signIn(email,password){
  if(demoMode){session={access_token:'demo',user:{id:'demo-user',email}};return session}
  const response=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:cfg.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(!response.ok)throw new Error((await response.json()).error_description||'Sign in failed');
  session=normalizeSession(await response.json());persistSession();return session;
}
export function signOut(){session=null;localStorage.removeItem('matchmate_crm_session')}
function normalizeSession(value){if(value&&!value.expires_at)value.expires_at=Math.floor(Date.now()/1000)+Number(value.expires_in||3600);return value}
function persistSession(){localStorage.setItem('matchmate_crm_session',JSON.stringify(session))}
async function refreshSession(){
  if(demoMode||!session?.refresh_token)return session;
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{const response=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:cfg.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});if(!response.ok){signOut();throw new Error('Your session expired. Please sign in again.')}session=normalizeSession(await response.json());persistSession();return session})().finally(()=>{refreshPromise=null});
  return refreshPromise;
}
async function ensureSession(){if(!demoMode&&session?.expires_at*1000-Date.now()<60000)await refreshSession()}
function headers(extra={}){return{apikey:cfg.supabaseAnonKey,Authorization:`Bearer ${session?.access_token||''}`,'Content-Type':'application/json',...extra}}
async function request(path,options={},retried=false){
  await ensureSession();
  const response=await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`,{...options,headers:headers(options.headers)});
  if(response.status===401&&!retried&&session?.refresh_token){await refreshSession();return request(path,options,true)}
  if(response.status===401){signOut();throw new Error('Your session expired. Please sign in again.')}
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
  const q=new URLSearchParams({select:'id',limit:'1'});Object.entries(filters).forEach(([k,v])=>q.set(k,`eq.${v}`));const result=await request(`${table}?${q}`,{headers:{Prefer:'count=exact'}});return result.count||0;
}
export async function collaborationPage(options={}){
  if(demoMode){let rows=demo.collaborations.map(row=>hydrateCollaboration(row));const{page=1,pageSize=50,search='',filters={},sort='updated_at.desc'}=options;if(search){const needle=search.toLowerCase();rows=rows.filter(row=>JSON.stringify(row).toLowerCase().includes(needle))}Object.entries(filters).filter(([,v])=>v!==''&&v!=null).forEach(([key,value])=>{rows=rows.filter(row=>key==='product_id'?row.collaboration_products.some(item=>item.product_id===value):String(row[key]??'')===String(value))});const[field,direction]=sort.split('.');rows.sort((a,b)=>String(a[field]||'').localeCompare(String(b[field]||''))*(direction==='asc'?1:-1));return{data:rows.slice((page-1)*pageSize,page*pageSize),count:rows.length}}
  const query=encodeListQuery({...options,searchFields:['collaboration_code','collaboration_name','creator_name','creator_handle','campaign_name','product_names']});
  return request(`collaboration_directory?${query}`,{headers:{Prefer:'count=exact'}});
}
function hydrateCollaboration(row){return{...row,creator:demo.creators.find(c=>c.id===row.creator_id),campaign:demo.campaigns.find(c=>c.id===row.campaign_id),collaboration_products:demo.collaboration_products.filter(x=>x.collaboration_id===row.id),shipments:demo.shipments.filter(x=>x.collaboration_id===row.id),deliverables:demo.deliverables.filter(x=>x.collaboration_id===row.id)}}
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
  return save('activity_logs',{entity_type:entityType,entity_id:entityId,creator_id:creatorId,collaboration_id:collaborationId,action,before_data:before,after_data:after,note,created_by:currentSession()?.user?.id||null});
}
export async function dashboardCounts(){
  if(demoMode){const c=demo.creators,o=demo.outreach_records,k=demo.collaborations,s=demo.shipments,d=demo.deliverables;return{totalCreators:c.length,notContacted:o.filter(x=>x.status==='Not Contacted').length,followUps:o.filter(x=>x.status==='Follow-up Due').length,negotiating:o.filter(x=>x.status==='Negotiating').length,ready:s.filter(x=>x.status==='Ready').length,shipped:s.filter(x=>x.status==='Shipped').length,delivered:s.filter(x=>x.status==='Delivered').length,contentDue:d.filter(x=>x.status==='Pending').length,published:k.filter(x=>x.stage==='Published').length}}
  const queries=[['totalCreators','creators',{}],['notContacted','outreach_records',{status:'Not Contacted'}],['followUps','outreach_records',{status:'Follow-up Due'}],['negotiating','outreach_records',{status:'Negotiating'}],['ready','shipments',{status:'Ready'}],['shipped','shipments',{status:'Shipped'}],['delivered','shipments',{status:'Delivered'}],['contentDue','deliverables',{status:'Pending'}],['published','collaborations',{stage:'Published'}]];
  return Object.fromEntries(await Promise.all(queries.map(async([key,table,filter])=>[key,await count(table,filter)])));
}
export function exportRows(filename,rows){if(!rows.length)return;const keys=[...new Set(rows.flatMap(Object.keys))].filter(key=>!['creator_accounts','outreach_records','collaborations','creator','campaign','collaboration_products','shipments','deliverables'].includes(key));const csv=[keys.join(','),...rows.map(row=>keys.map(key=>`"${String(Array.isArray(row[key])?row[key].join('|'):row[key]??'').replaceAll('"','""')}"`).join(','))].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
export async function exportCreatorResults(options){return exportPaged('matchmate-creators.csv',creatorPage,options)}
export async function exportCollaborationResults(options){return exportPaged('matchmate-collaborations.csv',collaborationPage,options)}
async function exportPaged(filename,loader,options){const pageSize=500,rows=[];for(let page=1;page<=20;page++){const result=await loader({...options,page,pageSize});rows.push(...result.data);if(rows.length>=result.count||result.data.length<pageSize)break}exportRows(filename,rows);return rows.length}
