import {createHandler,runtimeEnv} from './handler.mjs';
const env=(name:string)=>runtimeEnv((key:string)=>Deno.env.get(key),name);
// Startup health check: no scraping, CRM reads, user identifiers or secret values logged.
async function checkProviderConfiguration(){
  if(!env('APIFY_TOKEN'))return{configured:false};
  try{
    const response=await fetch('https://api.apify.com/v2/users/me',{headers:{Authorization:`Bearer ${env('APIFY_TOKEN')}`},signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)return{configured:true,httpStatus:response.status};
    const{data}=await response.json();
    return{configured:true,httpStatus:response.status,freePlanId:String(data?.plan?.id||'').toLowerCase()==='free',notPaying:data?.isPaying===false,zeroBasePrice:data?.plan?.monthlyBasePriceUsd===0,planPresent:Boolean(data?.plan)};
  }catch{return{configured:true,reachable:false}}
}
console.info('crm_followers_provider_config '+JSON.stringify(await checkProviderConfiguration()));
Deno.serve(createHandler({env}));
