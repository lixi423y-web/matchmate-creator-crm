import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseAddress,enrichAddress} from '../src/ysd-address.js';
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))});
const a=parseAddress('Test Recipient\n12 Sample Road, Montréal, QC H4C 1S9\n514-555-0123');
assert.deepEqual([a.city,a.country,a.state,a.zip],['Montréal','CA','QC','H4C 1S9']);
const b=parseAddress('Test Recipient\nOne Sample Road\nApt 2H\nNY 10065\n2125550123');await enrichAddress(b);
assert.equal(b.city,'New York');assert.match(b.street,/Apt 2H/);
const c=parseAddress('Test Recipient\n38 rue Exemple, 13006, Marseille, France\n0612345678');await enrichAddress(c);
assert.equal(c.city,'Marseille');assert.ok(c.state);
const ambiguous={country:'IT',zip:'16030'};await enrichAddress(ambiguous);assert.ok(!ambiguous.city);
assert.ok(parseAddress('Country: France',{country:'US'}).issues.includes('country'));
console.log('Address extraction, unique and ambiguous postcodes, apartment and source conflicts passed.');
const es=parseAddress('Calle Ejemplo 12 p2 46006 Valencia, España');await enrichAddress(es);
assert.deepEqual([es.city,es.zip,es.street,es.state,es.name,es.phone],['Valencia','46006','Calle Ejemplo 12 p2','Comunidad Valenciana',undefined,undefined]);
const gb=parseAddress('Sample Person\n18 Example Road London NW10 5SD - 07700900123');await enrichAddress(gb);
assert.deepEqual([gb.name,gb.street,gb.city,gb.country,gb.state,gb.zip,gb.phone],['Sample Person','18 Example Road','London','GB','England','NW10 5SD','07700900123']);
const gb2=parseAddress('Sample Person\nFlat 1 22 Example Terrace\nSW10 9JP\nLondon\nEngland\n07700900123');await enrichAddress(gb2);
assert.deepEqual([gb2.street,gb2.city,gb2.state,gb2.country],['Flat 1 22 Example Terrace','London','England','GB']);
const segments=['Calle Ejemplo 12 p2 46006 Valencia','España','Eva.Prueba','+34 612345678'];
for(const raw of [
  segments[0]+', '+segments[1]+'. '+segments[2]+'. '+segments[3],
  segments.join('\n'),[2,3,1,0].map(i=>segments[i]).join(', '),
  [3,1,2,0].map(i=>segments[i]).join(' | ')
]){
 const r=parseAddress(raw);await enrichAddress(r);
 assert.deepEqual([r.street,r.country,r.zip,r.city,r.name,r.phone,r.issues],['Calle Ejemplo 12 p2','ES','46006','Valencia','Eva.Prueba','+34 612345678',[]]);
}
assert.ok(parseAddress(segments.join('\n')+'\n+34 699999999').issues.includes('phone'));
