// SPDX-License-Identifier: MIT
// Unreleased development allocations in the upstream RFKV development range.
// These values use the normal RFKV owner; there is no parallel programming store.
import {decodeArea,getValue,setValue,deleteValue,putArea} from './kv.js';
import {u16,u32,put16,put32,sameBytes} from './modebytes.js';
import {getName,putName} from './fields.js';
export const DEVELOPMENT={iden:0x8100,scan:0x8200,zone:0x8300};
export function decodeDevelopment(m,b){
 const entries=decodeArea(b).entries;
 m.idenSets=[];m.scanLists=[];
 for(let n=0;n<8;n++){
  const v=getValue(entries,DEVELOPMENT.iden+n);if(!v||v.length<208)continue;
  m.idenSets.push({number:n+1,name:getName(v,0,16),rows:Array.from({length:16},(_,i)=>({baseHz:u32(v,16+i*12),stepHz:u32(v,20+i*12),txOffsetHz:u32(v,24+i*12)|0})),raw:v});
 }
 for(let n=0;n<16;n++){
  const v=getValue(entries,DEVELOPMENT.scan+n);if(!v||v.length<18||v[16]>32||v.length<18+v[16]*2)continue;
  m.scanLists.push({number:n+1,name:getName(v,0,16),talkback:!!v[17],channels:Array.from({length:v[16]},(_,i)=>{const num=u16(v,18+i*2);return m.channels.find(c=>c.number===num)??num}),raw:v});
 }
 for(const z of m.zones){const v=getValue(entries,DEVELOPMENT.zone+z.slot);z.developmentRaw=v??null;z.position=v?.length>=2?v[0]:z.slot+1;const n=v?.length>=2?v[1]:0;z.scan=m.scanLists.find(s=>s.number===n)??(n||null);}
 m.zones.sort((a,b)=>a.position-b.position||a.slot-b.slot);
}
export function developmentEntries(m,entries){
 let out=entries;
 const set=(key,v)=>{if(!sameBytes(getValue(out,key),v))out=setValue(out,key,v)};
 const del=key=>{if(getValue(out,key))out=deleteValue(out,key)};
 for(let n=0;n<8;n++){
  const r=m.idenSets?.find(r=>r.number===n+1);if(!r){del(DEVELOPMENT.iden+n);continue;}
  const v=new Uint8Array(Math.max(208,r.raw?.length??0));if(r.raw)v.set(r.raw);putName(v,0,16,r.name);r.rows.slice(0,16).forEach((p,i)=>{put32(v,16+i*12,p.baseHz);put32(v,20+i*12,p.stepHz);put32(v,24+i*12,p.txOffsetHz)});set(DEVELOPMENT.iden+n,v);
 }
 for(let n=0;n<16;n++){
  const r=m.scanLists?.find(r=>r.number===n+1);if(!r){del(DEVELOPMENT.scan+n);continue;}
  const v=new Uint8Array(Math.max(82,r.raw?.length??0));if(r.raw)v.set(r.raw);putName(v,0,16,r.name);v[16]=r.channels.length;v[17]=+r.talkback;r.channels.forEach((c,i)=>put16(v,18+i*2,typeof c==='number'?c:c.number));set(DEVELOPMENT.scan+n,v);
 }
 for(let slot=0;slot<68;slot++){
  const z=m.zones[slot];if(!z){del(DEVELOPMENT.zone+slot);continue;}
  const scan=typeof z.scan==='number'?z.scan:z.scan?.number??0;
  if(scan||z.developmentRaw){const old=z.developmentRaw,v=new Uint8Array(Math.max(2,old?.length??0));if(old)v.set(old);v[0]=slot+1;v[1]=scan;set(DEVELOPMENT.zone+slot,v);}else del(DEVELOPMENT.zone+slot);
 }
 return out;
}
export function encodeDevelopment(m,b){const area=decodeArea(b);if(area.state==='newer')return;const out=developmentEntries(m,area.entries);if(out!==area.entries)putArea(b,out)}
export function validateDevelopment(m,err){
 const ids=(rows,max,table)=>{const used=new Set();for(const r of rows){if(!Number.isInteger(r.number)||r.number<1||r.number>max||used.has(r.number))err(table,r,'number','range',{min:1,max});used.add(r.number);if(!r.name||r.name.length>16)err(table,r,'name',!r.name?'no_name':'too_long',{max:16})}};
 ids(m.idenSets??[],8,'idenSets');ids(m.scanLists??[],16,'scanLists');
 for(const r of m.idenSets??[])if(r.rows.length!==16||r.rows.some(p=>(p.baseHz||p.stepHz||p.txOffsetHz)&&(!(p.baseHz>0&&p.baseHz<1e9&&p.baseHz%5===0)||!(p.stepHz>0&&p.stepHz<=127875&&p.stepHz%125===0)||!Number.isInteger(p.txOffsetHz)||(p.txOffsetHz!==-2147483648&&Math.abs(p.txOffsetHz)>999999999))))err('idenSets',r,'rows','bad_freq');
 for(const r of m.scanLists??[])if(r.channels.length>32||new Set(r.channels).size!==r.channels.length||r.channels.some(c=>!m.channels.includes(c)))err('scanLists',r,'channels','dangling',{number:0});
 for(const z of m.zones)if(z.scan&&!m.scanLists.includes(z.scan))err('zones',z,'scan','dangling',{number:typeof z.scan==='number'?z.scan:z.scan.number});
}
