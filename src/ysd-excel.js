import CFB from './vendor/ysd-cfb.mjs';
import template,{columnStyles,orderRowHeight} from './ysd-template.js';
import {parcel} from './ysd.js';

// Preserve the template's styles, column widths and country sheet. Insert
// typed BIFF8 cells before the first sheet EOF, then rebase the second sheet.
export function ysdExcel(orders,settings){
 if(!orders.length||orders.length>65535)throw Error('Select 1–65535 orders');
 const base=Uint8Array.from(atob(template),c=>c.charCodeAt(0)),view=new DataView(base.buffer);
 const bounds=[];let dimension,end;
 for(let i=0;i+4<=base.length;){
   const id=view.getUint16(i,true),len=view.getUint16(i+2,true);
   if(id===0x85)bounds.push(i+4);
   if(bounds.length===2&&i>=view.getUint32(bounds[0],true)){
     if(id===0x200)dimension=i+4;
     if(id===0x0a){end=i;break}
   }
   i+=len+4;
 }
 if(!dimension||!end||bounds.length!==2)throw Error('Invalid Excel template');
 const parts=[];let bytes=0;
 orders.forEach((r,index)=>{
   let fields;try{fields=parcel(r,settings)}catch(e){throw Error(r.order+': '+e.message)}
   const row=new Uint8Array(20),rd=new DataView(row.buffer);
   rd.setUint16(0,0x208,true);rd.setUint16(2,16,true);rd.setUint16(4,index+1,true);
   rd.setUint16(8,fields.length,true);rd.setUint16(10,orderRowHeight,true);rd.setUint32(16,0x140,true);
   parts.push(row);bytes+=row.length;
   fields.forEach((v,col)=>{
     if(v===''){const p=new Uint8Array(10),d=new DataView(p.buffer);d.setUint16(0,0x201,true);d.setUint16(2,6,true);d.setUint16(4,index+1,true);d.setUint16(6,col,true);d.setUint16(8,columnStyles[col],true);parts.push(p);bytes+=p.length;return}
     const numeric=[2,18,23,24].includes(col);
     if(!numeric&&v.length>4000)throw Error(r.order+': Excel field too long');
     const n=numeric?14:9+v.length*2,p=new Uint8Array(4+n),d=new DataView(p.buffer);
     d.setUint16(0,numeric?0x203:0x204,true);d.setUint16(2,n,true);
     d.setUint16(4,index+1,true);d.setUint16(6,col,true);d.setUint16(8,columnStyles[col],true);
     if(numeric)d.setFloat64(10,Number(v),true);
     else{d.setUint16(10,v.length,true);p[12]=1;for(let j=0;j<v.length;j++)d.setUint16(13+j*2,v.charCodeAt(j),true)}
     parts.push(p);bytes+=p.length;
   });
 });
 view.setUint32(dimension+4,orders.length+1,true);
 view.setUint32(bounds[1],view.getUint32(bounds[1],true)+bytes,true);
 const stream=new Uint8Array(base.length+bytes);stream.set(base.subarray(0,end));let pos=end;
 for(const p of parts){stream.set(p,pos);pos+=p.length}stream.set(base.subarray(end),pos);
 const file=CFB.utils.cfb_new();CFB.utils.cfb_add(file,'Workbook',stream);
 return new Blob([new Uint8Array(CFB.write(file,{type:'array'}))],{type:'application/vnd.ms-excel'});
}
