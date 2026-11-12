import{shippingAddressText,copyShippingAddress}from'./shipping-address.js';
import{HANDOFF_QUEUES,inHandoffQueue,shippingLabel,latestHandoffUpdate,handoffTime,handoffSnapshot}from'./shipping-handoff.js?v=20261112-handoff1';
import{shippingHandoffRows,shippingHandoffContext,saveShippingHandoff,related,creatorAddressSnapshot}from'./data.js?v=20261112-handoff1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createShippingHandoffUI({owners,openProducts,openShipment,afterMutation,onError,notify,isActive,remember,initialMode='records'}){
 const $=selector=>document.querySelector(selector);
 let mode=initialMode==='shipping'?'shipping':'records',queue='Pending',rows=[],epoch=0,editing=null,busy=false;
 const ownerName=id=>owners().find(p=>p.id===id)?.name||'Unassigned';
 function applyMode(){const shipping=mode==='shipping';$('#collaborationRecords').classList.toggle('hidden',shipping);$('#shippingHandoff').classList.toggle('hidden',!shipping);for(const button of document.querySelectorAll('[data-collaboration-mode]')){const active=button.dataset.collaborationMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}}
 function bind(){
  for(const button of document.querySelectorAll('[data-collaboration-mode]'))button.onclick=()=>{mode=button.dataset.collaborationMode;applyMode();remember();if(mode==='shipping')void load();};
  $('#handoffOwner').onchange=render;$('#handoffSearch').oninput=render;
  $('#handoffQueues').onclick=event=>{const b=event.target.closest('[data-queue]');if(b){queue=b.dataset.queue;render();}};
  $('#handoffRows').onclick=event=>{const b=event.target.closest('[data-handoff-action]');if(!b)return;const row=rows.find(r=>r.shipment.id===b.dataset.id);if(!row)return;
   if(b.dataset.handoffAction==='products')return openProducts(row.collaboration.id);
   if(b.dataset.handoffAction==='copy'){copyShippingAddress(shippingAddressText(row.shipment.address_snapshot)).then(()=>notify('Address copied.')).catch(()=>notify('Expand the address and copy it manually.'));return;}
   void open(row.collaboration.id,row.shipment.id,b.dataset.handoffAction);
  };
  $('#handoffSave').onclick=saveEditor;
  $('#handoffDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  window.addEventListener('focus',()=>{if(isActive()&&!busy&&!$('#handoffDialog').open)void refreshIfVisible();});
  // Another teammate's changes appear without reloading the whole CRM.
  setInterval(()=>{if(!document.hidden&&isActive()&&!busy&&!$('#handoffDialog').open&&!document.querySelector('.drawer.open'))void refreshIfVisible();},60000);
  applyMode();
 }
 function clear(){epoch++;rows=[];editing=null;$('#handoffRows').textContent='';$('#handoffCount').textContent='';$('#handoffError').textContent='';$('#handoffFields').textContent='';$('#handoffDialog').open&&$('#handoffDialog').close();}
 async function load(){const token=++epoch;$('#handoffCount').textContent='Loading…';try{const result=await shippingHandoffRows();if(token!==epoch||!isActive())return;rows=result;render();}catch(error){if(token===epoch){rows=[];render();$('#handoffCount').textContent='Unable to load shipping handoff. Use Refresh.';onError(error);}}}
 async function refreshIfVisible(){if(mode==='shipping')await load();}
 function render(){
  const selected=$('#handoffOwner').value;$('#handoffOwner').innerHTML='<option value="">All</option>'+owners().map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'<option value="__unassigned__">Unassigned</option>';$('#handoffOwner').value=selected;
  $('#handoffQueues').innerHTML=HANDOFF_QUEUES.map(q=>'<button type="button" class="secondary compact '+(q===queue?'active':'')+'" aria-pressed="'+(q===queue)+'" data-queue="'+q+'">'+q+' '+rows.filter(r=>inHandoffQueue(r.shipment,q)).length+'</button>').join('');
  const search=$('#handoffSearch').value.trim().toLowerCase(),filtered=rows.filter(r=>inHandoffQueue(r.shipment,queue)).filter(r=>!selected||(selected==='__unassigned__'?!r.shipment.owner_id:r.shipment.owner_id===selected)).filter(r=>[r.collaboration.id,r.collaboration.collaboration_code,r.collaboration.creator_name,r.collaboration.creator_handle,r.shipment.shipment_code].join(' ').toLowerCase().includes(search));
  const submittedAt=r=>r.logs.filter(l=>l.entity_id===r.shipment.id&&l.after_data?.status==='Ready'&&l.before_data?.status!=='Ready').sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))[0]?.created_at||r.shipment.created_at;
  filtered.sort((a,b)=>String(submittedAt(a)).localeCompare(String(submittedAt(b))));
  const change=(s,action,label='Change')=>'<button type="button" class="handoff-change" data-handoff-action="'+action+'" data-id="'+s.id+'">'+label+'</button>';
  $('#handoffRows').innerHTML=filtered.map(({shipment:s,collaboration:c,products,logs})=>{const update=latestHandoffUpdate(s,logs);return'<tr><td><strong>'+esc(c.collaboration_code||c.id.slice(0,8))+'</strong><small>'+esc(s.shipment_code||'')+'</small></td><td>'+esc(c.creator_name||c.creator?.display_name||'Creator')+'<small>'+esc(c.creator_handle?'@'+c.creator_handle:c.creator_account?.handle?'@'+c.creator_account.handle:'')+'</small></td><td>'+esc(ownerName(c.owner_id))+change(s,'outreach-owner')+'</td><td><strong>'+esc(ownerName(s.owner_id))+'</strong>'+change(s,'shipping-owner')+'</td><td class="handoff-products">'+(products.map(p=>esc(p.product?.name||'Product')+' <strong>×'+esc(p.quantity)+'</strong>').join('<br>')||'No products selected')+change(s,'products')+'</td><td><details><summary>Show address</summary><pre class="shipping-address-text">'+esc(shippingAddressText(s.address_snapshot)||'No address saved')+'</pre></details>'+change(s,'copy','Copy all')+'</td><td><span class="badge '+(['Shipped','Delivered'].includes(s.status)?'green':'')+'">'+esc(shippingLabel(s.status))+'</span>'+change(s,'status')+(s.tracking_number?'<small>'+esc([s.carrier,s.tracking_number].filter(Boolean).join(' · '))+'</small>':['Shipped','Delivered'].includes(s.status)?change(s,'tracking','Add tracking'):'')+'</td><td class="handoff-latest"><small>'+esc(handoffTime(update.at))+'</small>'+esc(update.text)+'</td></tr>';}).join('')||'<tr><td colspan="8"><div class="empty-state">No submitted shipments match this queue.</div></td></tr>';
  $('#handoffCount').textContent=filtered.length+' shipments';
 }
 async function show(collaborationId){mode='shipping';queue='All';applyMode();remember();$('#handoffSearch').value=collaborationId||'';$('#handoffOwner').value='';await load();}
 async function open(collaborationId,shipmentId,action){
  if(busy)return;const token=epoch;
  try{
   const context=await shippingHandoffContext(collaborationId,shipmentId);if(token!==epoch||!isActive())return;
   const {collaboration:c,shipment:s}=context;
   if(action==='submit'&&s&&s.status!=='Draft')return show(c.collaboration_code||c.id);
   const ownerOptions=(value,blank=true)=>(blank?'<option value="">Select</option>':'')+owners().map(p=>'<option value="'+esc(p.id)+'" '+(p.id===value?'selected':'')+'>'+esc(p.name)+'</option>').join('');
   let fields='',title='',saveText='Save';
   if(action==='submit'){
    const addresses=await related('creator_addresses','creator_id',c.creator_id);if(token!==epoch||!isActive())return;
    const address=addresses.find(a=>a.is_default)||addresses[0],snapshot=shippingAddressText(s?.address_snapshot)?s.address_snapshot:creatorAddressSnapshot(address||{});
    context.addressId=s?.address_id||address?.id||null;context.addressText=shippingAddressText(snapshot);
    title='Submit for shipping';saveText='Submit';fields='<label>Shipping owner<select name="owner_id">'+ownerOptions(s?.owner_id)+'</select></label><label>Shipping address<textarea name="address" rows="6">'+esc(context.addressText)+'</textarea></label>';
   }else if(action==='outreach-owner'){title='Change outreach owner';fields='<label>Outreach owner<select name="owner_id">'+ownerOptions(c.owner_id)+'</select></label>';}
   else if(action==='shipping-owner'){title='Change shipping owner';fields='<label>Shipping owner<select name="owner_id">'+ownerOptions(s.owner_id)+'</select></label><label>Reason<textarea name="reason" rows="2"></textarea></label><label class="handoff-check"><input type="checkbox" name="confirmed">The new owner has accepted. The previous owner will not send this order.</label>';}
   else if(action==='tracking'){title='Add tracking';fields='<label>Carrier<input name="carrier" value="'+esc(s.carrier)+'"></label><label>Tracking number<input name="tracking_number" value="'+esc(s.tracking_number)+'"></label>';}
   else if(action==='status'){
    if(!['Ready','Shipped'].includes(s.status)){openShipment(c.id);return;}
    title='Change shipping status';const target=s.status==='Ready'?'Shipped':'Delivered';
    fields='<label>Status<select name="status"><option value="'+s.status+'">'+shippingLabel(s.status)+'</option><option value="'+target+'">'+target+'</option></select></label><div id="handoffStatusFields"></div>';
   }else return;
   editing={context,expected:handoffSnapshot(context),action,epoch};$('#handoffTitle').textContent=title;$('#handoffSummary').textContent=(c.collaboration_code||c.id)+' · '+(c.creator_name||c.creator_handle||'Creator');$('#handoffFields').innerHTML=fields;$('#handoffError').textContent='';$('#handoffSave').textContent=saveText;
   if(action==='status')$('#handoffFields [name="status"]').onchange=event=>{$('#handoffStatusFields').innerHTML=event.target.value===s.status?'':event.target.value==='Shipped'?'<label>Dispatch time (your local time)<input type="datetime-local" name="shipped_at"></label><label>Carrier (optional)<input name="carrier"></label><label>Tracking number (optional)<input name="tracking_number"></label><label class="handoff-check"><input type="checkbox" name="confirmed">All listed items have been handed to the carrier.</label>':'<label class="handoff-check"><input type="checkbox" name="confirmed">The parcel has been delivered to the recipient.</label>';};
   $('#handoffDialog').showModal();
  }catch(error){onError(error);}
 }
 async function saveEditor(){
  if(!editing||busy)return;const entry=editing,form=new FormData($('#handoffForm')),values=Object.fromEntries(form);values.confirmed=form.has('confirmed');values.owner_name=ownerName(values.owner_id||entry.context.shipment?.owner_id);
  if(values.owner_id&&!owners().some(p=>p.id===values.owner_id)){$('#handoffError').textContent='Choose a valid owner.';return;}
  if(entry.action==='submit'){values.address_snapshot={full_address:String(values.address||'').trim(),source:'shipment'};values.address_id=values.address===entry.context.addressText?entry.context.addressId:null;}
  busy=true;$('#handoffError').textContent='';const controls=[...$('#handoffForm').querySelectorAll('button,input,select,textarea')];controls.forEach(c=>c.disabled=true);
  try{
   const result=await saveShippingHandoff({collaborationId:entry.context.collaboration.id,shipmentId:entry.context.shipment?.id,mode:entry.action,values,expected:entry.expected});
   if(entry.epoch!==epoch||!isActive())return;$('#handoffDialog').close();
   notify(result.stageWarning?'Saved. Stage could not update; refresh and check the collaboration.':result.activityWarning?'Saved. Activity history could not be recorded.':result.unchanged?'No changes.':'Saved.');
   try{await afterMutation();await refreshIfVisible();}catch(error){onError(error);notify('Saved, but refresh failed. Use Refresh; do not repeat the action.');}
  }catch(error){if(entry.epoch===epoch&&isActive())$('#handoffError').textContent=String(error.message).includes('HANDOFF_CONFLICT')?'A teammate changed this record. Cancel, refresh and reopen before saving.':String(error.message).startsWith('{')?'Unable to save. Cancel and refresh to check whether a teammate already submitted it.':error.message;}
  finally{busy=false;controls.forEach(c=>c.disabled=false);}
 }
 return{bind,clear,load,open,show,refreshIfVisible,get mode(){return mode;}};
}
