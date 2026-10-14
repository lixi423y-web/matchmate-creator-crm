// No privileged database client: every CRM read/write uses the caller's verified JWT.
export const SHARED_CRM_USER_ID='cffc1b76-6bc9-4f0c-9df9-569eb37970c3';
const ACTOR='7RQ4RlfRihUhflQtJ';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE=/^[a-z0-9_.]{1,30}$/i;
export function runtimeEnv(read,name){
  const value=read(name);
  if(value!==undefined)return value;
  if(name==='FOLLOWERS_AUTOFETCH_ENABLED')return'true';
  if(name==='CRM_PUBLISHABLE_KEY'){
    try{return JSON.parse(read('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||''}catch{return''}
  }
  return value;
}
export function createHandler({env,fetchImpl=fetch,now=Date.now}={}){
  // Best-effort per-isolate dedupe, not a distributed lock. No automatic retries.
  const attempts=new Map();
  return async function handle(req){
    const origin=req.headers.get('origin');
    const allowedOrigin=env('CRM_ORIGIN')||'https://lixi423y-web.github.io';
    const cors={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
    if(origin&&origin!==allowedOrigin)return reply(403,{status:'denied'});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(req.method!=='POST')return reply(405,{status:'denied'});
    const authorization=req.headers.get('authorization')||'';
    if(!/^Bearer \S+$/.test(authorization))return reply(401,{status:'denied'});
    const base=env('SUPABASE_URL'),key=env('CRM_PUBLISHABLE_KEY');
    if(!base||!key)return reply(503,{status:'pending',reason:'not_configured'});
    const crmHeaders={apikey:key,Authorization:authorization,'Content-Type':'application/json'};
    const callCrm=(path,options={})=>fetchImpl(`${base}${path}`,{...options,headers:{...crmHeaders,...options.headers},signal:AbortSignal.timeout(10000),redirect:'error'});
    try{
      // getUser-equivalent server validation, never trusting decoded client JWT claims.
      const auth=await callCrm('/auth/v1/user');
      if(!auth.ok)return reply(401,{status:'denied'});
      const user=await auth.json();
      if(user.id!==SHARED_CRM_USER_ID)return reply(403,{status:'denied'});
      const body=await req.json();
      if(!UUID.test(body.creatorId||''))return reply(400,{status:'invalid'});
      if(env('FOLLOWERS_AUTOFETCH_ENABLED')!=='true'||!env('APIFY_TOKEN'))return reply(503,{status:'pending',reason:'not_configured'});
      const query=new URLSearchParams({select:'id,creator_id,handle,followers,created_at',creator_id:`eq.${body.creatorId}`,platform:'eq.Instagram',is_primary:'eq.true',archived_at:'is.null',limit:'2'});
      const accounts=await callCrm(`/rest/v1/creator_accounts?${query}`);
      if(!accounts.ok)return reply(503,{status:'pending',reason:'crm_unavailable'});
      const rows=await accounts.json();
      if(rows.length!==1)return reply(200,{status:'pending',reason:'account_not_found'});
      const account=rows[0],handle=String(account.handle||'').replace(/^@/,'').toLowerCase();
      if(account.followers!=null)return reply(200,{status:'existing'});
      // This endpoint is for newly added creators, not an arbitrary scraping/backfill API.
      const age=now()-Date.parse(account.created_at);
      if(!HANDLE.test(handle)||!Number.isFinite(age)||age< -60000||age>600000)return reply(200,{status:'pending',reason:'not_new'});
      const prior=attempts.get(account.id);
      if(prior)return reply(200,await prior);
      for(const[id,item]of attempts){if(item.startedAt<now()-600000)attempts.delete(id)}
      if(attempts.size>=100)return reply(200,{status:'pending',reason:'busy'});
      const task=(async()=>{
        try{
          const providerHeaders={Authorization:`Bearer ${env('APIFY_TOKEN')}`,'Content-Type':'application/json'};
          const provider=(url,options={})=>fetchImpl(url,{...options,headers:providerHeaders,signal:AbortSignal.timeout(45000),redirect:'error'});
          const info=await provider('https://api.apify.com/v2/users/me');
          if(!info.ok)return{status:'pending',reason:'provider_unavailable'};
          const{data:billing}=await info.json();
          // Fail closed on paid/unknown plans; never auto-upgrade or fall back to paid access.
          if(billing?.isPaying!==false||String(billing?.plan?.id||'').toLowerCase()!=='free'||billing?.plan?.monthlyBasePriceUsd!==0)return{status:'pending',reason:'free_plan_required'};
          const result=await provider(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=30&maxTotalChargeUsd=0.01`,{method:'POST',body:JSON.stringify({usernames:[handle]})});
          if(!result.ok)return{status:'pending',reason:'provider_unavailable'};
          const output=await result.json();
          const match=Array.isArray(output)?output.find(row=>String(row.userName||'').toLowerCase()===handle):null;
          const count=match?.followersCount;
          if(!Number.isSafeInteger(count)||count<0||match?.error)return{status:'pending',reason:'unverified'};
          const patchQuery=new URLSearchParams({id:`eq.${account.id}`,creator_id:`eq.${body.creatorId}`,handle:`eq.${account.handle}`,platform:'eq.Instagram',is_primary:'eq.true',archived_at:'is.null',followers:'is.null',select:'id'});
          // A concurrent manual edit or account change wins. No unrelated columns are sent.
          const patched=await callCrm(`/rest/v1/creator_accounts?${patchQuery}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({followers:count})});
          if(!patched.ok)return{status:'pending',reason:'crm_unavailable'};
          return(await patched.json()).length===1?{status:'updated',followers:count}:{status:'unchanged'};
        }catch{return{status:'pending',reason:'unavailable'}}
      })();
      task.startedAt=now();attempts.set(account.id,task);
      return reply(200,await task);
    }catch{return reply(503,{status:'pending',reason:'unavailable'})}
  };
}
