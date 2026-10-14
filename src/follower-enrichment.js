// Background enrichment only; no follower sorting, filtering or layout changes.
export function startFollowerEnrichment({creatorId,enabled,fetchFollowers,isActive,onUpdated,onPending}){
  if(!enabled||!creatorId)return Promise.resolve();
  return Promise.resolve().then(()=>isActive()?fetchFollowers(creatorId):null).then(async result=>{
    if(!isActive()||!result)return;
    if(result.status==='updated')await onUpdated(result);
    else if(result.status==='pending')onPending();
  }).catch(()=>{if(isActive())onPending()});
}
