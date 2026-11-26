import {draft,quote,parcel} from './ysd.js';
import {enrichAddress} from './ysd-address.js';
export function previewYsd(rows){
 const orders=rows.map(draft), dialog=document.createElement('dialog');
 dialog.id='ysdPreview';dialog.style.cssText='width:min(540px,94vw);max-height:85vh;overflow:auto;padding:1.4rem;border:0;border-radius:12px;color:inherit';
 const add=(parent,tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;parent.append(n);return n};
 const input=(parent,label,value,fn)=>{const l=add(parent,'label',label),i=add(l,'input');i.value=value||'';i.oninput=()=>fn(i.value);return i};
 const grid=parent=>{const g=add(parent,'div');g.className='form-grid';return g};
 add(dialog,'h2','Export YSD Excel');
 const status=add(dialog,'p','Checking '+orders.length+' selected orders…');
 const settings=Object.freeze({weight:'0.2',price:'4'});
 const container=add(dialog,'div'),labels={name:'Recipient',country:'Country',state:'State / province',city:'City',street:'Street and apartment',zip:'Postal code',phone:'Phone'};
 function render(){
 container.replaceChildren();let ready=0;
 for(const r of orders){
   let issue='';try{parcel(r,settings);ready++}catch(e){issue=e.message}
   if(!issue)continue;
   const details=add(container,'section');
   const missing=Object.keys(labels).filter(k=>!r[k]||r.issues?.includes(k));
   add(details,'h3',r.creator+' · '+r.order);
   if(!missing.length)add(details,'p',issue);
   const raw=add(details,'p',r.raw||'No recipient details saved');raw.style.whiteSpace='pre-wrap';
   const fields=grid(details);
   const invalid=/phone/i.test(issue)?['phone']:/postal|zip/i.test(issue)?['zip']:/destination/i.test(issue)?['country']:Object.keys(labels);
   for(const k of missing.length?missing:invalid)input(fields,labels[k],r[k],v=>{r[k]=v;r.issues=r.issues.filter(key=>key!==k)});
   if(r.issues.length){const checked=add(details,'button','Use displayed values');checked.onclick=()=>{r.issues=[];render()};}
 }
 status.textContent=orders.length+' selected · '+ready+' ready'+(orders.length-ready?' · '+(orders.length-ready)+' to check':'');
 }
 const about=add(dialog,'details');add(about,'summary','Export rules');add(about,'p','Quote '+quote+' · First item only (parcel summary). Manufacturer IDs provisional. Offline locality index derived from GeoNames postal data.');
 const attribution=add(about,'a','GeoNames · CC BY 4.0');attribution.href='https://www.geonames.org/';const license=add(about,'a',' License');license.href='https://creativecommons.org/licenses/by/4.0/';
 const error=add(dialog,'p');error.setAttribute('role','alert');
 const cancel=add(dialog,'button','Cancel');cancel.onclick=()=>dialog.close();
 const save=add(dialog,'button','Download YSD Excel');save.onclick=async()=>{
   save.disabled=true;
   try{await Promise.all(orders.map(enrichAddress));if(!dialog.open)return;const {ysdExcel}=await import('./ysd-excel.js');const file=ysdExcel(orders,settings);
     const url=URL.createObjectURL(file),a=add(dialog,'a');a.href=url;a.download='matchmate-ysd-'+orders.length+'.xls';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);dialog.close();
   }catch(e){render();error.textContent=e.message;}finally{save.disabled=false}
 };
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
 save.disabled=true;Promise.all(orders.map(enrichAddress)).then(()=>{if(!dialog.open)return;render();save.disabled=false;if(!container.childElementCount)save.click()});
}
