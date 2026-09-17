export function shippingAddressText(value){
  if(!value)return '';
  if(typeof value==='string')return value;
  const full=value.full_address||value.formatted_address||value.line;
  if(full){const extra=[value.recipient_name,value.phone||value.contact_phone].filter(v=>v&&!full.toLowerCase().includes(String(v).toLowerCase()));return [...extra,full].join('\n')}
  return [
    value.recipient_name,value.phone||value.contact_phone,value.address_line_1,value.address_line_2,
    [value.city,value.state,value.postal_code].filter(Boolean).join(', '),value.country
  ].filter(Boolean).join('\n');
}
export async function copyShippingAddress(text,clipboard=globalThis.navigator?.clipboard){
  if(!text.trim())throw new Error('No shipping address to copy.');
  if(!clipboard?.writeText)throw new Error('Clipboard unavailable.');
  await clipboard.writeText(text);
}
