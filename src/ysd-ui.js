import {draft,ysdCsv,quote,parcel} from './ysd.js';
import {enrichAddress} from './ysd-address.js';
export function previewYsd(rows){
 const orders=rows.map(draft), dialog=document.createElement('dialog');
 dialog.id='ysdPreview';dialog.style.cssText='width:min(800px,94vw);max-height:88vh;overflow:auto';
 const add=(parent,tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;parent.append(n);return n};
 const input=(parent,label,value,fn)=>{const l=add(parent,'label',label),i=add(l,'input');i.value=value||'';i.oninput=()=>fn(i.value);return i};
 const grid=parent=>{const g=add(parent,'div');g.className='form-grid';return g};
 add(dialog,'h2','Export YSD CSV');
 const status=add(dialog,'p','Checking '+orders.length+' selected orders…');
 const settings=Object.freeze({weight:'0.2',price:'4'});
 const container=add(dialog,'div'),labels={name:'Recipient',country:'Country',state:'State / province',city:'City',street:'Street and apartment',zip:'Postal code',phone:'Phone'};
 function render(){
 container.replaceChildren();let ready=0;
 for(const r of orders){
   let issue='';try{parcel(r,settings);ready++}catch(e){issue=e.message}
   const details=add(container,'details');
   const missing=Object.keys(labels).filter(k=>!r[k]||r.issues?.includes(k));
   details.open=!!issue;
   add(details,'summary',r.creator+' · '+r.order+' · '+(issue?(missing.length?'Check '+missing.map(k=>labels[k]).join(', '):issue):'Ready · '+r.city+', '+r.country));
   const raw=add(details,'p',r.raw||'No recipient details saved');raw.style.whiteSpace='pre-wrap';
   const fields=grid(details);
   const more=add(details,'details');add(more,'summary','Review all details');const other=grid(more);
   for(const [k,label] of Object.entries(labels))input(missing.includes(k)?fields:other,label,r[k],v=>{r[k]=v;r.issues=r.issues.filter(key=>key!==k)});
   if(r.issues.length){const checked=add(details,'button','Confirm displayed values');checked.onclick=()=>{r.issues=[];render()};}
   if(issue){const check=add(details,'button','Recheck');check.onclick=async()=>{await enrichAddress(r);if(dialog.open)render()};}
 }
 status.textContent=orders.length+' selected · '+ready+' ready'+(orders.length-ready?' · '+(orders.length-ready)+' to check':'');
 }
 const label=add(dialog,'label'),ok=add(label,'input');ok.type='checkbox';ok.style.width='auto';
 label.append(' I checked recipient details and service coverage (no outlying islands, military or warehouse addresses).');
 const about=add(dialog,'details');add(about,'summary','Export rules');add(about,'p','Quote '+quote+' · First item only (parcel summary). Manufacturer IDs provisional. Offline locality index derived from GeoNames postal data.');
 const attribution=add(about,'a','GeoNames · CC BY 4.0');attribution.href='https://www.geonames.org/';const license=add(about,'a',' License');license.href='https://creativecommons.org/licenses/by/4.0/';
 const error=add(dialog,'p');error.setAttribute('role','alert');
 const cancel=add(dialog,'button','Cancel');cancel.onclick=()=>dialog.close();
 const save=add(dialog,'button','Download YSD CSV');save.onclick=()=>{
   try{const csv=ysdCsv(orders,settings);if(!ok.checked)throw Error('Check recipient details and service coverage before downloading.');
     const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=add(dialog,'a');a.href=url;a.download='matchmate-ysd-'+orders.length+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);dialog.close();
   }catch(e){error.textContent=e.message;}
 };
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
 save.disabled=true;Promise.all(orders.map(enrichAddress)).then(()=>{if(!dialog.open)return;render();save.disabled=false});
}
