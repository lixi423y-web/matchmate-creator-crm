import config from './ysd-config.js';
import {shippingAddressText} from './shipping-address.js';
import {latestShipment} from './shipping-handoff.js';
export const quote=config.version;
const zipSet=k=>new Set(config[k].split(' '));
const commercial=zipSet('commercial'),noUS=zipSet('excludedUS'),noIT=zipSet('excludedIT');
const countries={US:'US',USA:'US','UNITED STATES':'US','UNITED STATES OF AMERICA':'US',GB:'GB',UK:'GB','UNITED KINGDOM':'GB',ENGLAND:'GB',FR:'FR',FRANCE:'FR',IT:'IT',ITALY:'IT',ITALIA:'IT'};
const states='AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export function draft(row){
 const parcels=(row.shipments||[]).filter(s=>!s.archived_at);
 const addr=latestShipment(parcels)?.address_snapshot;
 const a=shippingAddressText(addr).trim()?addr:row.creator_shipping_address||{};
 const items=(row.collaboration_products||[]).filter(i=>!i.archived_at);
 const first=items[0],p=config.products.find(p=>p.product_id===first?.product_id||[p.sku,...p.legacy_skus].includes(first?.product?.sku)||p.official_name===first?.product?.name);
 return{order:row.collaboration_code||row.id,creator:row.creator_name||'',raw:shippingAddressText(a),name:a.recipient_name||'',state:a.state||a.province||'',city:a.city||'',street:[a.address_line_1,a.address_line_2].filter(Boolean).join(', '),phone:a.phone||a.contact_phone||'',zip:a.postal_code||'',country:countries[String(a.country||'').trim().toUpperCase()]||'',product:p,qty:first?.quantity,split:parcels.length>1};
}
export function phoneNumber(country,value){
 let v=String(value).trim().replace(/[\s().-]/g,'').replace(/^00/,'+');
 const code={US:'1',FR:'33',GB:'44',IT:'39'}[country];
 if(!code||!/^\+?\d+$/.test(v))throw Error('Invalid phone');
 if(v.startsWith('+')){if(!v.startsWith('+'+code))throw Error('Phone country code mismatch');v=v.slice(code.length+1);}
 else if(country==='US'&&v.length===11&&v[0]==='1')v=v.slice(1);
 if(country==='FR'||country==='GB')v=v.replace(/^0/,'');
 const valid={US:/^[2-9]\d{2}[2-9]\d{6}$/,FR:/^[1-9]\d{8}$/,GB:/^[1-9]\d{9}$/,IT:/^(0\d{5,10}|3\d{8,9})$/};
 if(!valid[country].test(v))throw Error('Invalid phone length or prefix');
 return '+'+code+v;
}
export function parcel(r,{weight,price}){
 if(r.split)throw Error('Multiple parcels on one order: verify packing separately');
 const p=r.product;
 if(!p||p.category==='Set'||!p.invoice_mpid||!p.invoice_nspid)throw Error('No confirmed parcel-summary mapping for the first product');
 if(!Number.isSafeInteger(+r.qty)||+r.qty<1)throw Error('Invalid first product quantity');
 const country=countries[String(r.country).trim().toUpperCase()];
 if(!country)throw Error('Country not enabled in this quote configuration');
 if(![weight,price].every(v=>/^\d+(\.\d+)?$/.test(String(v))&&Number.isFinite(+v)&&+v>0))throw Error('Enter positive numeric weight and unit value');
 const max={US:10,GB:20,FR:10,IT:5};
 if(+weight>max[country]||(country==='US'&&+weight<=0.05))throw Error('Weight outside quoted band');
 const txt=k=>{const v=String(r[k]||'').trim();if(!v||/^[=+@\t-]/.test(v)||/^(unknown|n\/a|tbd|-)$/i.test(v))throw Error('Check '+k);return v};
 const name=txt('name'),state=txt('state'),city=txt('city'),street=txt('street'),phone=phoneNumber(country,r.phone);
 if(!/\p{L}/u.test(name)||!/\p{L}/u.test(city)||!/\p{L}/u.test(state)||street.length<3)throw Error('Check recipient, state, city and street');
 let zip=String(r.zip||'').trim().toUpperCase(),route='2041';
 if(country==='GB'){zip=zip.replace(/\s/g,'');if(!/^(GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(zip))throw Error('Invalid UK postcode');zip=zip.slice(0,-3)+' '+zip.slice(-3);}
 else if(!/^\d{5}$/.test(zip))throw Error('Postal code must be five digits');
 if(/\b(amazon|APO|FPO|DPO)\b/i.test([street,city,state].join(' ')))throw Error('Unsupported warehouse or military address');
 if(country==='US'){
   if(!states.includes(state.toUpperCase())||noUS.has(zip)||config.excludedUSPrefixes.some(([lo,hi])=>+zip.slice(0,3)>=lo&&+zip.slice(0,3)<=hi)||/^000/.test(zip))throw Error('Unsupported US state or ZIP (use two-letter mainland state)');
   if(commercial.has(zip)&&+weight<=5)route='3061';
 }
 if((country==='IT'&&noIT.has(zip))||(country==='GB'&&/^(GY|JE|IM)/.test(zip))||(country==='FR'&&/^(97|98|20)/.test(zip)))throw Error('Unsupported destination');
 const cn={Bandana:'宠物领巾',Necklace:'珠串项链',Scrunchie:'发圈'}[p.category];
 if(!cn)throw Error('Missing Chinese product name');
 const out=Array(57).fill('');
 for(const [i,v] of [[2,route],[3,country],[9,name],[10,state],[11,city],[12,street],[13,phone],[15,zip],[18,weight],[21,p.official_name],[22,cn],[23,price],[24,r.qty],[27,p.invoice_mpid],[28,p.invoice_nspid]])out[i]=String(v);
 return out;
}
export function ysdCsv(rows,settings){
 if(!rows.length)throw Error('Select at least one order');
 const matrix=[config.headers,...rows.map(r=>{try{return parcel(r,settings)}catch(e){throw Error(r.order+': '+e.message)}})];
 return '\uFEFF'+matrix.map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');
}
