import assert from 'node:assert/strict';
import config from '../src/ysd-config.js';
import {draft,parcel,phoneNumber,ysdCsv} from '../src/ysd.js';
const settings={weight:'0.2',price:'4'},product=config.products.find(p=>p.category==='Scrunchie');
const record={id:'order-X',creator_shipping_address:{full_address:'Example',recipient_name:'Example',country:'US',state:'NY',city:'New York',address_line_1:'10 Example, "A"',phone:'2125550123',postal_code:'10028'},collaboration_products:[{product_id:product.product_id,quantity:2},{product_id:'other',quantity:3}]};
const r=draft(record),input=JSON.stringify(record),out=parcel(r,settings);
assert.equal(out.length,57);assert.equal(out[0],'');assert.equal(out[2],'3061');assert.equal(out[24],'2');assert(out.slice(30).every(v=>v===''));
assert.equal(parcel({...r,state:'CO',zip:'81004'},settings)[2],'2041');
assert.equal(phoneNumber('IT','02 12345678'),'+390212345678');assert.equal(phoneNumber('FR','06 12 34 56 78'),'+33612345678');
assert.equal(parcel({...r,country:'FR',state:'Region',city:'Town',zip:'01234',phone:'0612345678'},settings)[15],'01234');
for(const overrides of [{city:''},{country:'XX'},{state:'AK'},{zip:'96701'},{street:'APO Box 1'},{zip:'1234'},{product:null},{split:true}]){
 assert.throws(()=>ysdCsv([{...r,...overrides}],settings),/order-X:/);
}
assert.throws(()=>ysdCsv([r],{weight:0,price:4}),/weight/);
assert(ysdCsv([r],settings).includes('"10 Example, ""A"""'));assert.equal(JSON.stringify(record),input);
console.log('YSD format, source ordering, postal routes, invalid orders, telephone and CSV escaping passed.');
