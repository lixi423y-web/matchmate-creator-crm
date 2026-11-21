import {shippingAddressText} from './shipping-address.js';
import {latestShipment,directShippingLabel} from './shipping-handoff.js';

export const COLLABORATION_EXPORT_HEADERS=['达人','平台链接','完整收件信息','产品及数量','建联负责人','寄送负责人','物流状态','运单号'];
export function collaborationExportMatrix(rows,owners=[]){
 const owner=id=>owners.find(o=>o.id===id)?.name||'未分配';
 return [COLLABORATION_EXPORT_HEADERS,...rows.map(row=>{
  const shipment=latestShipment(row.shipments),snapshot=shipment&&shippingAddressText(shipment.address_snapshot).trim()?shipment.address_snapshot:row.creator_shipping_address;
  const handle=row.creator_handle||row.creator_account?.handle||row.creator?.nickname||'';
  const url=row.creator_profile_url||row.creator_account?.profile_url||row.creator?.primary_profile_url|| (handle?'https://www.instagram.com/'+encodeURIComponent(handle.replace(/^@/,''))+'/':'');
  const products=(row.collaboration_products||[]).filter(p=>!p.archived_at&&Number(p.quantity)>0).map(p=>(p.product?.name||p.product_name||'Product')+' ×'+p.quantity).join('\n')||row.product_names||'';
  const active=(row.shipments||[]).filter(s=>!s.archived_at),tracking=[...new Set(active.map(s=>String(s.tracking_number||'').trim()).filter(Boolean))].join('\n');
  return [row.creator_name||row.creator?.display_name||handle,url,shippingAddressText(snapshot),products,owner(row.owner_id),owner(shipment?.owner_id),({Pending:'待寄送',Shipped:'已寄出',Delivered:'已送达'}[directShippingLabel(shipment?.status)]),tracking];
 })];
}
export function csvFromMatrix(matrix){return '\uFEFF'+matrix.map(row=>row.map(value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}).join(',')).join('\r\n')}
export function downloadCollaborationCsv(rows,owners=[],filename='matchmate-collaborations.csv'){
 const url=URL.createObjectURL(new Blob([csvFromMatrix(collaborationExportMatrix(rows,owners))],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
