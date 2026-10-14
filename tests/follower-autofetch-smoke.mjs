import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHandler,runtimeEnv,SHARED_CRM_USER_ID} from '../supabase/functions/creator-followers/handler.mjs';
import {startFollowerEnrichment} from '../src/follower-enrichment.js';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',accountId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const envReads=[];
const readEnv=name=>{envReads.push(name);return name==='SUPABASE_PUBLISHABLE_KEYS'?'{"default":"synthetic-public"}':undefined;};
assert.equal(runtimeEnv(readEnv,'CRM_PUBLISHABLE_KEY'),'synthetic-public');
assert.equal(runtimeEnv(readEnv,'FOLLOWERS_AUTOFETCH_ENABLED'),'true');
assert.equal(runtimeEnv(()=> 'false','FOLLOWERS_AUTOFETCH_ENABLED'),'false');
assert.equal(runtimeEnv(()=>undefined,'CRM_PUBLISHABLE_KEY'),'');
assert.ok(!envReads.some(name=>name.includes('SECRET')||name.includes('SERVICE_ROLE')));
function fixture(overrides={}){
  const calls=[],settings={SUPABASE_URL:'https://mock.example',CRM_PUBLISHABLE_KEY:'synthetic-public',APIFY_TOKEN:'synthetic-provider',FOLLOWERS_AUTOFETCH_ENABLED:'true',...overrides.env};
  const handler=createHandler({env:name=>settings[name],fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.includes('api.apify.com')){assert.equal(options.headers.Authorization,'Bearer synthetic-provider');assert.ok(!url.includes('token='));}
    else{assert.equal(options.headers.Authorization,'Bearer synthetic-session');assert.equal(options.headers.apikey,'synthetic-public');}
    if(url.endsWith('/auth/v1/user'))return Response.json({id:overrides.userId||SHARED_CRM_USER_ID},{status:overrides.authStatus||200});
    if(url.includes('/users/me'))return Response.json({data:{isPaying:false,plan:{id:'FREE',monthlyBasePriceUsd:0},...overrides.billing}});
    if(url.includes('/acts/')){assert.deepEqual(JSON.parse(options.body),{usernames:['test_creator']});assert.equal(new URL(url).searchParams.get('maxTotalChargeUsd'),'0.01');assert.equal(new URL(url).searchParams.get('timeout'),'30');if(overrides.fail)throw Error('provider failure must not leak');return Response.json(overrides.output??[{userName:'test_creator',followersCount:12345}]);}
    if(options.method==='PATCH'){const q=new URL(url).searchParams;assert.equal(q.get('followers'),'is.null');assert.equal(q.get('handle'),'eq.test_creator');assert.deepEqual(JSON.parse(options.body),{followers:overrides.count??12345});return Response.json(overrides.concurrentEdit?[]:[{id:accountId}]);}
    return Response.json([{id:accountId,creator_id:id,handle:'test_creator',followers:null,created_at:new Date().toISOString(),...overrides.account}]);
  }});
  const req=(headers={Authorization:'Bearer synthetic-session'})=>new Request('https://mock.example/functions/v1/creator-followers',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({creatorId:id})});
  return{calls,handler,req};
}
let f=fixture();assert.equal((await f.handler(f.req({}))).status,401);assert.equal(f.calls.length,0);
f=fixture({userId:id});assert.equal((await f.handler(f.req())).status,403);assert.equal(f.calls.length,1);
f=fixture({authStatus:401});assert.equal((await f.handler(f.req())).status,401);assert.equal(f.calls.length,1);
f=fixture();assert.equal((await f.handler(f.req({Authorization:'Bearer synthetic-session',Origin:'https://evil.example'}))).status,403);assert.equal(f.calls.length,0);
for(const overrides of [{env:{APIFY_TOKEN:''}},{account:{followers:0}},{account:{created_at:'2020-01-01'}},{billing:{isPaying:true}},{billing:{plan:{id:'STARTER',monthlyBasePriceUsd:29}}},{billing:{plan:undefined}}]){
  f=fixture(overrides);await f.handler(f.req());assert.ok(!f.calls.some(x=>x.url.includes('/acts/')||x.options.method==='PATCH'));
}
for(const output of [[],[{userName:'wrong',followersCount:12345}],[{userName:'test_creator',followersCount:null}],[{userName:'test_creator',followersCount:-1}],[{userName:'test_creator',followersCount:'12345'}]]){
  f=fixture({output});assert.equal((await(await f.handler(f.req())).json()).status,'pending');assert.ok(!f.calls.some(x=>x.options.method==='PATCH'));
}
f=fixture();assert.deepEqual(await(await f.handler(f.req())).json(),{status:'updated',followers:12345});await f.handler(f.req());assert.equal(f.calls.filter(x=>x.url.includes('/acts/')).length,1);
f=fixture({count:0,output:[{userName:'test_creator',followersCount:0}]});assert.equal((await(await f.handler(f.req())).json()).followers,0);
f=fixture({concurrentEdit:true});assert.equal((await(await f.handler(f.req())).json()).status,'unchanged');
f=fixture({fail:true});assert.equal((await(await f.handler(f.req())).json()).status,'pending');assert.ok(!f.calls.some(x=>x.options.method==='PATCH'));
let active=true,updates=0,pending=0,queries=0;
const args={creatorId:id,enabled:true,isActive:()=>active,fetchFollowers:async()=>{queries++;return{status:'updated'}},onUpdated:()=>updates++,onPending:()=>pending++};
await startFollowerEnrichment({...args,enabled:false});assert.equal(queries,0);
await startFollowerEnrichment(args);assert.equal(updates,1);
await startFollowerEnrichment({...args,fetchFollowers:()=>{throw Error('not configured')}});assert.equal(pending,1);
await startFollowerEnrichment({...args,fetchFollowers:async()=>{active=false;return{status:'updated'}}});assert.equal(updates,1);
const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8'),dataSource=await readFile(new URL('../src/data.js',import.meta.url),'utf8');
assert.ok(app.indexOf('void startFollowerEnrichment')>app.indexOf('if(!result.ok)'));
assert.ok(app.includes("if(type==='creator'&&!before){\n    const loginEpoch=authGeneration"));
assert.ok(app.includes("if(state.view==='creators')await loadCreators()"));
assert.ok(!dataSource.slice(dataSource.indexOf('export async function createCreatorWithPrimaryAccount'),dataSource.indexOf('export async function saveCreatorAccount')).includes('fetchCreatorFollowers'));
globalThis.window={MATCHMATE_CONFIG:{supabaseUrl:'https://mock.example',supabasePublishableKey:'synthetic-public',creatorFollowersAutoFetch:true},supabase:{createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic-session'}}}),signOut:async()=>({})}})}};
globalThis.location={search:''};let apiCalls=0;
globalThis.fetch=async(url,options)=>{apiCalls++;assert.ok(url.endsWith('/functions/v1/creator-followers'));assert.equal(options.headers.Authorization,'Bearer synthetic-session');assert.deepEqual(JSON.parse(options.body),{creatorId:id});return Response.json({status:'updated',followers:12345});};
const data=await import('../src/data.js');await assert.rejects(data.fetchCreatorFollowers(id),/session expired/);assert.equal(apiCalls,0);await data.restoreSession();await data.fetchCreatorFollowers(id);assert.equal(apiCalls,1);await data.signOut();await assert.rejects(data.fetchCreatorFollowers(id),/session expired/);assert.equal(apiCalls,1);
console.log('Follower autofetch: auth, shared-user restriction, Free-only guard, valid counts, conditional writes, dedupe, isolated failures, logout and opt-in passed.');
