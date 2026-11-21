import {draft,ysdCsv,quote} from './ysd.js';
export function previewYsd(rows){
 const orders=rows.map(draft), dialog=document.createElement('dialog');
 dialog.id='ysdPreview';dialog.style.cssText='width:min(800px,94vw);max-height:88vh;overflow:auto';
 const add=(parent,tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;parent.append(n);return n};
 const input=(parent,label,value,fn)=>{const l=add(parent,'label',label),i=add(l,'input');i.value=value||'';i.oninput=()=>fn(i.value);return i};
 const grid=parent=>{const g=add(parent,'div');g.className='form-grid';return g};
 add(dialog,'h2','Export YSD CSV');
 add(dialog,'p',orders.length+' selected orders · Quote '+quote+' · US, GB, FR, IT. Parcel summary only; first product and its original quantity. Manufacturer IDs are provisional.');
 const settings={weight:'0.2',price:'4'},batch=grid(dialog);
 input(batch,'Batch weight (kg)',settings.weight,v=>settings.weight=v);
 input(batch,'First product unit value (USD)',settings.price,v=>settings.price=v);
 for(const r of orders){
   const details=add(dialog,'details');details.open=true;
   add(details,'summary',r.order+' · '+r.creator+' · '+(r.product?.official_name||'Unmapped product')+' ×'+(r.qty??'?'));
   const raw=add(details,'p',r.raw||'No recipient details saved');raw.style.whiteSpace='pre-wrap';
   const fields=grid(details);
   for(const [k,label] of Object.entries({name:'Recipient',country:'Country (US / GB / FR / IT)',state:'State / province (US: two-letter code)',city:'City',street:'Street and apartment',zip:'Postal code',phone:'Phone'}))input(fields,label,r[k],v=>r[k]=v);
 }
 const label=add(dialog,'label'),ok=add(label,'input');ok.type='checkbox';ok.style.width='auto';
 label.append(' I checked this batch’s weight, value, recipient details and service coverage (no outlying islands, military or warehouse addresses).');
 const error=add(dialog,'p');error.setAttribute('role','alert');
 const cancel=add(dialog,'button','Cancel');cancel.onclick=()=>dialog.close();
 const save=add(dialog,'button','Download YSD CSV');save.onclick=()=>{
   try{const csv=ysdCsv(orders,settings);if(!ok.checked)throw Error('Confirm the batch details before downloading.');
     const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=add(dialog,'a');a.href=url;a.download='matchmate-ysd-'+orders.length+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);dialog.close();
   }catch(e){error.textContent=e.message;}
 };
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
