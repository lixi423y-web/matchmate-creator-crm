// Standard general-goods 2041 sheet, quotation 2026-11-17-01.
// ISO, calling code, maximum kg, minimum kg, national trunk rule, postal format.
const bands={
 US:[1,10,.05,'','5'],GB:[44,20,0,'0','GB'],DE:[49,10,0,'0','5'],FR:[33,10,0,'0','5'],IT:[39,5,0,'','5'],ES:[34,10,0,'','5'],PT:[351,10,0,'','PT'],NL:[31,10,0,'0','NL'],PL:[48,5,.05,'','PL'],SE:[46,5,.05,'0','SE'],CZ:[420,5,.05,'','SE'],SK:[421,5,.05,'0','SE'],AT:[43,5,.05,'0','4'],GR:[30,2,.05,'','SE'],BE:[32,5,.05,'0','4'],FI:[358,2,.05,'0','5'],DK:[45,2,.05,'','4'],IE:[353,2,.05,'0','IE'],LU:[352,2,.05,'','4'],HU:[36,5,.05,'06','4'],RO:[40,5,.05,'0','6'],SI:[386,5,.05,'0','4'],HR:[385,5,.05,'0','5'],EE:[372,5,.05,'','5'],LT:[370,5,.05,'0','5'],LV:[371,5,.05,'','LV'],MT:[356,2,.05,'','MT'],BG:[359,5,.05,'0','4'],NO:[47,5,.05,'','4'],CH:[41,5,.05,'0','4'],NZ:[64,5,.05,'0','4'],CA:[1,20,0,'','CA'],AU:[61,10,0,'0','4']
};
export const routes=bands;
const patterns={GB:/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/,CA:/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ]\d[ABCEGHJ-NPRSTVWXYZ]\d$/,NL:/^\d{4}[A-Z]{2}$/,PT:/^\d{4}-\d{3}$/,PL:/^\d{2}-\d{3}$/,SE:/^\d{5}$/,IE:/^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)[0-9AC-FHKNPRTV-Y]{4}$/,MT:/^[A-Z]{3}\d{4}$/,LV:/^(?:LV-)?\d{4}$/};
const folded=v=>String(v??'').normalize('NFD').replace(/\p{M}/gu,'').trim().toUpperCase();
const aliases=new Map(Object.entries({UK:'GB',ENGLAND:'GB',SCOTLAND:'GB',WALES:'GB',USA:'US','UNITED STATES OF AMERICA':'US',ITALIA:'IT',DEUTSCHLAND:'DE',ESPAÑA:'ES',ÖSTERREICH:'AT',SUISSE:'CH',SCHWEIZ:'CH',NEDERLAND:'NL'}).map(([n,c])=>[folded(n),c]));
for(const locale of ['en','zh','fr']){const display=new Intl.DisplayNames([locale],{type:'region'});for(const c of Object.keys(bands)){aliases.set(folded(display.of(c)),c);aliases.set(c,c)}}
export const iso=v=>aliases.get(folded(v).replace(/\p{Regional_Indicator}/gu,'').trim())||'';
export function postal(c,value){
 const kind=bands[c]?.[4],z=String(value??'').trim().toUpperCase().replace(/\s/g,'');
 if(!kind||!(patterns[kind]||new RegExp('^\\d{'+kind+'}$')).test(z))throw Error('Check postal code');
 if(kind==='CA'||kind==='MT'||kind==='IE')return z.slice(0,3)+' '+z.slice(3);
 if(kind==='GB')return z.slice(0,-3)+' '+z.slice(-3);
 if(kind==='NL')return z.slice(0,4)+' '+z.slice(4);
 if(kind==='SE')return z.slice(0,3)+' '+z.slice(3);
 return z;
}
const us='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const ca='AB BC MB NB NL NT NS NU ON PE QC SK YT'.split(' ');
const fieldLabels={name:'(?:recipient(?: name)?|full name|name)',street:'(?:street(?: address)?|address(?: line 1)?)',city:'(?:city|town|ville)',state:'(?:state|province|region|county)',zip:'(?:zip(?: code)?|postal code|postcode|code postal|cap)',country:'country',phone:'(?:phone(?: number)?|mobile|tel(?:ephone)?)'};
export function parseAddress(raw,provided={}){
 const out={...provided},issues=new Set(),inferred={};
 const put=(k,v)=>{v=String(v||'').trim();if(!v)return;if(k==='country')v=iso(v)||v;
 const norm=x=>{const c=iso(out.country||inferred.country);
 if(k==='zip'&&c){try{return postal(c,x)}catch{}}
 if(k==='phone'&&c){const [code,,,trunk]=bands[c];let n=String(x).replace(/[\s().-]/g,'').replace(/^00/,'+');if(n.startsWith('+'))return n;if(code===1&&/^1\d{10}$/.test(n))n=n.slice(1);else if(trunk&&n.startsWith(trunk))n=n.slice(trunk.length);return '+'+code+n}
 return folded(x)};
 if((out[k]&&norm(out[k])!==norm(v))||(inferred[k]&&norm(inferred[k])!==norm(v))){issues.add(k);return}
 inferred[k]=v;};
 // Split contact clauses without splitting initials, dotted names or street abbreviations.
 const normalized=String(raw||'').replace(/([\p{L}]{3,})\.\s+/gu,(all,w)=>iso(w)?w+';':all)
   .replace(/\.\s+(?=\+\d)/g,';').replace(/[,，]\s*(?=\+\d)/g,';');
 const lines=normalized.split(/[\n;；|]/).map(x=>x.trim()).filter(Boolean),rest=[];
 for(let l of lines){
   const tail=l.match(/\s+[-–—]\s+(\+?[\d ()-]{9,20})$/);
   if(tail&&tail[1].replace(/\D/g,'').length>=9){put('phone',tail[1]);l=l.slice(0,tail.index).trim()}
   let handled=false;for(const [k,lab] of Object.entries(fieldLabels)){const m=l.match(new RegExp('^'+lab+'\\s*:\\s*(.+)$','i'));if(m){if(k==='street')rest.push(m[1]);else put(k,m[1]);handled=true;break}}
   if(handled)continue;
   if(/^\+?[\d (][\d().\s-]{6,22}\d$/.test(l)&&l.replace(/\D/g,'').length>=9){put('phone',l);continue}
   rest.push(l);
 }
 const pieces=rest.flatMap(l=>l.split(/[,，]/)).map(x=>x.trim()).filter(Boolean);
 for(let i=pieces.length-1;i>=0;i--){const t=pieces[i];
   if(t.length>2&&iso(t)){put('country',t);if(/^(England|Scotland|Wales|Northern Ireland)$/i.test(t))put('state',t);pieces.splice(i,1)}
   else if(/^\+?[\d (][\d(). -]{6,22}\d$/.test(t)&&t.replace(/\D/g,'').length>=9){put('phone',t);pieces.splice(i,1)}
 }
 if(pieces.length&&iso(pieces.at(-1))){const last=pieces.pop();put('country',last);if(/^(England|Scotland|Wales|Northern Ireland)$/i.test(last))put('state',last)}
 else if(pieces.length){const last=pieces.at(-1),suffix=last.match(/^(.*\S)\s+([\p{L}][\p{L} ]*)$/u);if(suffix&&iso(suffix[2])&&suffix[2].length>2){put('country',suffix[2]);pieces[pieces.length-1]=suffix[1];}}
 const residual=[];
 for(let i=0;i<pieces.length;i++){
   const part=pieces[i],na=part.match(/^(?:(.+?)\s+)?([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{5})$/i);
   if(na&&((ca.includes(na[2].toUpperCase())&&/[a-z]/i.test(na[3]))||(us.includes(na[2].toUpperCase())&&/^\d{5}$/.test(na[3])))){
      put('country',/\d$/.test(na[3])&&/[a-z]/i.test(na[3])?'CA':'US');put('zip',na[3]);put('state',na[2].toUpperCase());
      if(na[1])put('city',na[1]);else if(residual.length>=2&&!/\d/.test(residual.at(-1)))put('city',residual.pop());continue;
   }
   const uk=part.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2})$/i);
   if(uk&&(!iso(out.country||inferred.country)||iso(out.country||inferred.country)==='GB')){
     put('country','GB');put('zip',uk[1]);const left=part.slice(0,uk.index).trim();
     const joined=left.match(/^(.+\b(?:road|street|lane|close|drive|terrace|avenue|way|place|crescent|gardens|square|court))\s+([\p{L}][\p{L} .’'-]*)$/iu);
     if(joined){residual.push(joined[1]);put('city',joined[2])}
     else if(!left&&i+1<pieces.length&&/^[\p{L}][\p{L} .’'-]*$/u.test(pieces[i+1]))put('city',pieces[++i]);
     else if(left&&!/\d/.test(left))put('city',left);
     else if(left)residual.push(left);
     continue;
   }
   const c=iso(out.country||inferred.country);
   if(c==='ES'){const joined=part.match(/^(.+\d\S*)\s+(\d{5})\s+([\p{L}][\p{L} .’'-]*)$/u);if(joined){residual.push(joined[1]);put('zip',joined[2]);put('city',joined[3]);continue}}
   if(c&&!['US','CA'].includes(c)){
     let found=false;
     for(const m of part.matchAll(/(?<![\p{L}\d])(?:[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{4}\s?[A-Z]{2}|\d{4}-\d{3}|\d{2}-\d{3}|\d{3} \d{2}|\d{4,6})(?![\p{L}\d])/giu)){
       try{postal(c,m[0])}catch{continue}
       const left=part.slice(0,m.index).trim(),right=part.slice(m.index+m[0].length).trim();
       if((left&&right)||/\d/.test(left+right))continue;
       put('zip',m[0]);if(left||right){if(/^[\p{L}][\p{L} .’'-]*$/u.test(left||right)&&!iso(left||right))put('city',left||right)}else if(i+1<pieces.length&&/^[\p{L}][\p{L} .'-]+$/u.test(pieces[i+1]))put('city',pieces[++i]);found=true;break;
     }if(found)continue;
   }
   residual.push(part);
 }
 const person=t=>/^[\p{L}][\p{L} .'’-]+$/u.test(t)&&!/@|\b(?:calle|rue|via|road|street|lane|terrace|avenue|building|floor|apartment|flat|unit|suite|postal|phone)\b/i.test(t);
 const candidates=residual.filter(person);
 if(!out.name&&!inferred.name&&candidates.length===1&&residual.some(s=>/\d/.test(s))&&(residual[0]===candidates[0]||((inferred.city||out.city)&&(inferred.zip||out.zip)&&/[ .’'-]/.test(candidates[0])))){put('name',candidates[0]);residual.splice(residual.indexOf(candidates[0]),1)}
 else if(residual.length&&folded(residual[0])===folded(out.name||inferred.name))residual.shift();
 if(residual.length&&!out.street&&residual.some(v=>/\d|\b(rue|road|street|via|avenue|lane|drive|strasse|straße)\b/i.test(v)))put('street',residual.join(', '));
 for(const [k,v] of Object.entries(inferred))if(!out[k])out[k]=v;
 out.country=iso(out.country)||out.country||'';out.issues=[...issues];return out;
}
const cache=new Map();
export async function enrichAddress(r){
 const c=iso(r.country);if(!c||!r.zip)return;
 if(!cache.has(c))cache.set(c,fetch(new URL('./ysd-postal/'+c+'.json',import.meta.url)).then(x=>x.ok?x.json():{}).catch(()=>({})));
 const idx=await cache.get(c),key=String(r.zip).toUpperCase().replace(/[\s-]/g,''),hits=idx[key];
 if(!hits&&c==='GB'&&patterns.GB.test(key)){const regions=new Set((idx[key.slice(0,-3)]||[]).map(h=>h[1]).filter(Boolean));if(!r.state&&regions.size===1)r.state=[...regions][0]}
 if(!hits)return;
 const match=r.city?hits.filter(([city])=>folded(city)===folded(r.city)||(c==='FR'&&folded(city).replace(/ \d{2}$/,'')===folded(r.city))):hits;
 if(!match.length)return;
 const uniq=i=>[...new Set(match.map(h=>h[i]))];if(!r.city&&uniq(0).length===1)r.city=uniq(0)[0];if(!r.state&&uniq(1).length===1)r.state=uniq(1)[0];
}
