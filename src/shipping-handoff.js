// Shared presentation and validation for collaboration-backed shipping handoffs.
import {shippingAddressText} from './shipping-address.js';
export const HANDOFF_QUEUES=['Pending','Shipped','Tracking needed','All'];
export const shippingLabel=status=>({Draft:'Not submitted',Ready:'To ship'}[status]||status);
export const productSignature=rows=>JSON.stringify(rows.filter(r=>!r.archived_at).map(r=>[r.product_id,Number(r.quantity)]).sort((a,b)=>a[0].localeCompare(b[0])));
export function handoffSnapshot(context){return JSON.stringify([context.collaboration.updated_at,context.collaboration.owner_id,context.collaboration.stage,context.shipment?.id,context.shipment?.updated_at,context.shipment?.status,context.shipment?.owner_id,context.shipment?.address_snapshot,productSignature(context.products)]);}
export function inHandoffQueue(shipment,queue){if(shipment.status==='Draft')return false;return queue==='All'||(queue==='Pending'?['Ready','Exception'].includes(shipment.status):queue==='Tracking needed'?['Shipped','Delivered'].includes(shipment.status)&&!shipment.tracking_number:['Shipped','Delivered'].includes(shipment.status));}
export function requirePackingDetails(products,address,owner){if(!owner)throw Error('Choose a shipping owner.');if(!shippingAddressText(address).trim())throw Error('Complete the shipping address.');if(!products.length||products.some(p=>!Number.isSafeInteger(Number(p.quantity))||Number(p.quantity)<1))throw Error('Confirm the products and whole-number quantities first.');}
export function shippingStatusPatch(before,status,{confirmed=false,shipped_at='',carrier='',tracking_number=''}={}){
 if(status===before.status)return null;
 if(status==='Shipped'&&before.status==='Ready'){
  if(!confirmed)throw Error('Confirm all listed items have been handed to the carrier.');
  if(!shipped_at||!Number.isFinite(new Date(shipped_at).getTime())||new Date(shipped_at)>new Date())throw Error('Enter a valid dispatch time, not in the future.');
  return{status,shipped_at:new Date(shipped_at).toISOString(),carrier:carrier.trim()||null,tracking_number:tracking_number.trim()||null};
 }
 if(status==='Delivered'&&before.status==='Shipped'){if(!confirmed)throw Error('Confirm the parcel has been delivered.');return{status,delivered_at:new Date().toISOString()};}
 throw Error('Use the next shipping status. Sent parcels cannot be reset to an unsent order. Open the shipment for an exception.');
}
export function activitySummary(log){
 if(String(log.action||'').startsWith('Handoff: '))return log.action.slice(9);
 const before=log.before_data||{},after=log.after_data||{};
 if(/Product selection/i.test(log.action)||log.entity_type==='collaboration_products')return'Products updated';
 if(before.stage!==after.stage&&after.stage)return'Stage: '+after.stage;
 if(before.status!==after.status&&after.status)return'Status: '+shippingLabel(after.status);
 if(log.entity_type==='publications')return'Publication updated';
 if(log.entity_type==='shipments')return'Shipment updated';
 return log.action||'Record updated';
}
export function latestHandoffUpdate(shipment,logs=[]){
 const sorted=[...logs].filter(l=>!l.archived_at).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),log=sorted[0];
 // An older log must not hide a newer legacy edit without an activity entry.
 if(log&&(!shipment.updated_at||log.created_at>=shipment.updated_at))return{at:log.created_at,text:activitySummary(log)};
 return{at:shipment.updated_at||shipment.created_at,text:'Shipment: '+shippingLabel(shipment.status)};
}
export function handoffTime(value){if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toISOString().slice(0,16).replace('T',' ')+' UTC';}

// One product per line, with an unbroken quantity at the right.
export function renderProductLines(rows=[],fallback=''){
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const items=rows.filter(row=>row.product?.name).map(row=>'<span class="product-line"><span class="product-line-name">'+escape(row.product.name)+'</span><strong class="product-line-quantity">×'+escape(row.quantity??1)+'</strong></span>');
 return items.length?'<span class="product-lines">'+items.join('')+'</span>':escape(fallback||'No products selected');
}

export const latestShipment=rows=>[...(rows||[])].filter(s=>!s.archived_at).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id).localeCompare(String(a.id)))[0]||null;

export function renderRecipientDetails(snapshot){
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const full=shippingAddressText(snapshot);
 if(!full.trim())return'<span class="muted">Recipient details needed</span>';
 const preview=full.split('\n').filter(Boolean).slice(-2).join(' · ');
 return'<div class="recipient-preview"><strong>'+escape(snapshot?.recipient_name||'Saved address')+'</strong><small>'+escape(preview)+'</small></div><details><summary>Show details</summary><pre class="shipping-address-text">'+escape(full)+'</pre></details>';
}
