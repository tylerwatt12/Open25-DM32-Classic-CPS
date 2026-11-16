// SPDX-License-Identifier: MIT
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {empty,newChannel,newContact,encode,decode,remove,validate} from '../app/static/js/codeplug/model.js';
import {encodeChannel,decodeChannel,p25Problems,channelAddr,DTMF_CONTACTS,decodeDtmf,encodeDtmf} from '../app/static/js/codeplug/records.js';
import {CodeplugImage,CODEPLUG_SPAN} from '../app/static/js/codeplug/image.js';
import {exportTable,importTable} from '../app/static/js/codeplug/csv.js';
import {exportQdmr} from '../app/static/js/codeplug/qdmr.js';
import {parseNac,nacText} from '../app/static/js/codeplug/fields.js';
import {FakeCpsRadio} from '../app/static/js/codeplug/fakecps.js';
import {CpsSerial} from '../app/static/js/codeplug/transport.js';
const radios=JSON.parse(readFileSync('app/data/radios.json')).radios;
const ch=(fields={})=>newChannel({name:'P25 fixture',mode:'p25',rxHz:446050000,txHz:446050000,...fields});
const raw=c=>encodeChannel(c,new Uint8Array(56).fill(255));
function bridge(lines){const p=spawnSync('build/c-format-bridge',[],{input:lines.join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(p.status,0,p.stderr);return p.stdout.trim().split('\n').map(JSON.parse);}
const fixture=()=>decode(CodeplugImage.from(new Uint8Array(readFileSync('build/site-tests/codeplug_sim.bin')).slice(0,CODEPLUG_SPAN)));

test('all usable TX NAC values and inheritance decode identically in actual Classic C',()=>{
 const cases=[ch(),ch({p25RxNac:0,p25TxNac:null}),ch({p25RxNac:0xF7E,rxOnly:true,p25Tg:0,p25Id:0})];
 for(let tx=0;tx<=0xFFF;tx++)if(tx!==0xF7E&&tx!==0xF7F)cases.push(ch({p25RxNac:tx&1?0xF7E:0x293,p25TxNac:tx,p25Tg:65535,p25Id:9999999}));
 const lines=cases.flatMap(c=>['D '+Buffer.from(raw(c)).toString('hex'),`E ${c.p25RxNac} ${c.p25TxNac==null?0:c.p25TxNac+1} ${c.p25Tg} ${c.p25Id} ${+c.rxOnly} 2 0`]);
 const out=bridge(lines);
 cases.forEach((c,i)=>{const a=out[i*2],b=out[i*2+1];assert.equal(a.ok,1);assert.equal(b.input_ok,1);for(const k of ['mode','rx','tx','tg','id','rxOnly'])assert.equal(a[k],b[k],`${i} ${k}`);
 const d=decodeChannel(Buffer.from(b.hex,'hex'));assert.equal(d.mode,'p25');for(const k of ['p25RxNac','p25TxNac','p25Tg','p25Id'])assert.equal(d[k],c[k],`${i} ${k}`);
 for(const off of [0x18,0x22,0x23,0x2B,0x2C,0x2E,0x2F])assert.equal(raw(c)[off],parseInt(b.hex.slice(off*2,off*2+2),16));
 });
});
test('Classic C and JS reject invalid NAC, identity and bandwidth combinations',()=>{
 const fields=[{p25RxNac:0xF7F},{p25RxNac:0x1000},{p25TxNac:0xF7E},{p25TxNac:0xF7F},{p25TxNac:0x1000},{p25RxNac:0xF7E},{p25Tg:0},{p25Id:0},{p25Id:10000000},{bw:25},{rxOnly:true,p25RxNac:0xF7E,p25Tg:0,p25Id:0},{p25TxNac:0}];
 const cases=fields.map(ch),out=bridge(cases.map(c=>`E ${c.p25RxNac} ${c.p25TxNac==null?0:c.p25TxNac+1} ${c.p25Tg} ${c.p25Id} ${+c.rxOnly} 2 ${+(c.bw===25)}`));
 cases.forEach((c,i)=>{assert.equal(+!p25Problems(c).length,out[i].input_ok,JSON.stringify(fields[i]));if(p25Problems(c).length)assert.throws(()=>raw(c));});
 for(const f of [{p25Tg:65536},{p25Tg:-1},{p25Id:1.5},{p25RxNac:NaN}])assert.throws(()=>raw(ch(f)));
});
test('P25 edits preserve FM/DMR and unrelated image bytes; deleting contacts never changes P25 TG',()=>{
 const m=fixture(),contact=newContact({name:'DMR contact',id:123,number:900});m.contacts.push(contact);m.channels.push(ch({contact:null,p25Tg:900,number:900}));
 const image=encode(m),again=decode(image);assert.deepEqual(encode(again).bytes,image.bytes);
 const p=again.channels.find(c=>c.number===900);assert.equal(p.contact,null);assert.equal(p.rxList,null);assert.equal(p.dmrId,0);
 remove(again,'contacts',[again.contacts.find(c=>c.number===900)]);assert.equal(p.p25Tg,900);
 const before=encode(again);p.name='Renamed';const after=encode(again);const addr=channelAddr(900);
 for(let i=0;i<before.bytes.length;i++)if(i<addr||i>=addr+16)assert.equal(after.bytes[i],before.bytes[i],`offset ${i}`);
 p.p25TxNac=0;p.p25RxNac=0x123;const d=decode(encode(again)).channels.find(c=>c.number===900);assert.equal(d.p25TxNac,0);assert.equal(d.p25RxNac,0x123);
 p.p25TxNac=null;assert.equal(decode(encode(again)).channels.find(c=>c.number===900).p25TxNac,null);
});
test('BIN and CSV preserve split, zero and inherited NACs; qdmr refuses lossy P25 export',()=>{
 const m=empty();m.channels.push(ch({name:'Inherit'}),ch({name:'Zero',p25TxNac:0}),ch({name:'Split',p25RxNac:0xF7E,p25TxNac:0xABC,p25Id:9999999,p25Tg:65535}));
 encode(m);const n=empty(),r=importTable(n,exportTable(m,'channels'),'channels');assert.deepEqual(r.problems,[]);
 assert.deepEqual(decode(encode(n)).channels,decode(encode(m)).channels);assert.throws(()=>exportQdmr(m));assert.doesNotThrow(()=>exportQdmr(fixture()));
 const invalid=importTable(empty(),'Name,Mode,RX NAC (hex)\nInvalid,P25,ZZZ\n','channels');assert.ok(invalid.problems.length);
});
test('unknown mode or malformed P25 is preserved and cannot silently become FM',()=>{
 for(const [off,value] of [[0x18,0xA6],[0x2C,0xA2]]){const m=empty();m.channels.push(ch());const image=encode(m);image.bytes[channelAddr(1)+off]=value;const n=decode(image);assert.equal(n.channels[0].mode,'unsupported');assert.ok(validate(n).length);assert.deepEqual(encode(n).bytes,image.bytes);n.channels[0].name='Edit';assert.throws(()=>encode(n));}
});
test('NAC input uses hex; blank TX means inheritance and explicit zero stays zero',()=>{
 assert.equal(parseNac('293'),0x293);assert.equal(parseNac('0xabc'),0xABC);assert.equal(parseNac('$000',true),0);assert.equal(parseNac('',true),null);assert.equal(parseNac('Same as RX',true),null);assert.equal(parseNac('xyz'),undefined);assert.equal(nacText(null),'Same as RX');assert.equal(nacText(0),'000');
});
test('simulated Classic radio writes P25 at its true flash base while keeping local settings',async()=>{
 const m=fixture(),image=encode(m),base=0x700000;
 const radio=new FakeCpsRadio({board:'DM-32UV',base,end:0xF00000,image:image.bytes,cable:true});radio.spi.fill(0x5A,base+0x604B,base+0x6100);
 const tr=new CpsSerial(radio.stream(),{cable:true});await tr.identify(radios);const have=await tr.read({iddb:false}),edit=decode(have);edit.channels.push(ch({number:900,p25TxNac:0}));
 const want=encode(edit),result=await tr.write(want,have);await tr.verify(want,result.plan);await tr.finish();
 assert.ok(radio.writes.length);assert.ok(radio.writes.every(([a])=>a>=base));assert.ok(radio.spi.subarray(base+0x604B,base+0x6100).every(x=>x===0x5A));assert.equal(radio.reloads,1);
 const back=decode(await tr.read({iddb:false}));assert.equal(back.channels.find(c=>c.number===900).p25TxNac,0);
 for(const git of ['open25-next-1','0123abcd']){const wrong=new FakeCpsRadio({board:'DM-32UV',git});await assert.rejects(new CpsSerial(wrong.stream()).identify(radios),e=>e.code==='not_classic');assert.equal(wrong.writes.length,0);}
});

test('residual non-DTMF records do not block programming or change their stored bytes',()=>{
 const m=empty(),r=m.base.bytes.subarray(DTMF_CONTACTS,DTMF_CONTACTS+32);r.fill(0x41);r.set(new TextEncoder().encode('Residual text'));
 assert.equal(decodeDtmf(r),null);const n=decode(m.base);assert.equal(n.dtmfContacts.length,0);assert.equal(validate(n).filter(p=>p.level==='error').length,0);assert.deepEqual(encode(n).bytes,m.base.bytes);
 const valid=new Uint8Array(32).fill(255);encodeDtmf({name:'Valid',code:'0123456789ABCD*#'},valid);assert.deepEqual(decodeDtmf(valid),{name:'Valid',code:'0123456789ABCD*#'});
});
