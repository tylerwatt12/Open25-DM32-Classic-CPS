// SPDX-License-Identifier: MIT
import {test} from 'node:test';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decode,encode,empty,newChannel,newContact,validate} from '../app/static/js/codeplug/model.js';
import {columns,channelForm} from '../app/static/js/editor/views.js';
import {CodeplugImage} from '../app/static/js/codeplug/image.js';
import {channelAddr,CH_SIZE,DTMF_CONTACTS,decodeDtmf,encodeDtmf} from '../app/static/js/codeplug/records.js';
import {setKind,MODE_KEY} from '../app/static/js/codeplug/channelmodes.js';
import {decodeArea,getValue,putArea,areaForWrite,KV_ADDR,KV_BANKS} from '../app/static/js/codeplug/kv.js';
import {encodeConv,decodeConv,encodeTsys,decodeTsys,p25System} from '../app/static/js/codeplug/mode_p25.js';
import {DEVELOPMENT} from '../app/static/js/codeplug/development.js';
import {CpsSerial,writeRanges} from '../app/static/js/codeplug/transport.js';
import {FakeCpsRadio} from '../app/static/js/codeplug/fakecps.js';
import {parseKv} from '../app/static/js/flasher/link.js';
const p25=(m,name='P25')=>{const c=newChannel({name,rxHz:446050000,txHz:446050000});m.channels.push(c);setKind(m,c,2);c.params.talkgroup=1;c.dmrId=101;return c};
const legacy=(fields={})=>{const m=empty();m.channels.push(newChannel({name:'FM'}),newChannel({name:'DMR',mode:'dmr'}),newChannel({name:'Old P25'}));const image=encode(m),r=image.bytes.subarray(channelAddr(3),channelAddr(3)+CH_SIZE);r[0x18]=0xA5;r[0x2B]=0x93;r[0x2C]=0xD2;r[0x2E]=1;r[0x2F]=0;r[0x26]|=0x80;r.set([0,0,101],0x27);for(const [k,v]of Object.entries(fields))r[Number(k)]=v;return image};
test('actual Classic firmware VERSION offers P25 in a codeplug with no existing P25 channels',()=>{
 const run=spawnSync('build/c-format-bridge',[],{input:'F\n',encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const version=parseKv(run.stdout);
 assert.equal(version.codeplug,'rfkv1');assert.equal(version.codeplug_chain,'1');
 const features=version.features?.split(',')??[];
 assert.equal(features.filter(f=>f==='P25').length,1,run.stdout);
 assert.ok(!features.includes('P25_TRUNK'));
 for(const withFmDmr of [false,true]){
  const m=empty();if(withFmDmr)m.channels.push(newChannel({name:'FM'}),newChannel({name:'DMR',mode:'dmr'}));
  const row=newChannel(),form=channelForm(m,k=>k,{features:version.features}).find(f=>f.key==='mode');
  const grid=columns('channels',m,k=>k,{features:version.features}).find(f=>f.key==='mode');
  for(const field of [form,grid]){
   const options=field.options(row);assert.ok(options.some(([value,label])=>value==='k2'&&label==='P25'));
   assert.ok(!options.some(([value])=>value==='k3'));
  }
 }
});
test('all usable explicit TX NACs preserve their presence including000 andequalRX',()=>{for(let tx=0;tx<=0xFFF;tx++){if(tx===0xF7E||tx===0xF7F)continue;const p={squelch:0,rxNac:0x293,txNac:tx,talkgroup:65535,mixed:false,txEncryption:0,ignoreClear:false,keySlot:0};assert.deepEqual(decodeConv(encodeConv(p)),p);}assert.equal(decodeConv(encodeConv({squelch:0,rxNac:0x293,txNac:null})).txNac,null);});
test('retired Classic A5 D/E programming is rejected without altering any byte',async()=>{const {imageFrom}=await import('../app/static/js/editor/files.js');for(const fields of [{},{0x2C:0xE2,0x22:0,0x23:0},{0x2C:0xE2,0x22:0x93,0x23:2}]){const image=legacy(fields),before=image.bytes.slice();assert.throws(()=>imageFrom(image.bytes),e=>e.code==='rfkv_required');assert.deepEqual(image.bytes,before)}});
test('noncanonical base-record discriminators are rejected before they can become FM',async()=>{const {imageFrom}=await import('../app/static/js/editor/files.js');for(const marker of [0xA0,0xA5,0xA6,0xA7,0xC0]){const image=legacy({0x18:marker}),before=image.bytes.slice();assert.throws(()=>imageFrom(image.bytes),e=>e.code==='rfkv_required');assert.deepEqual(image.bytes,before)}});
test('zone metadata future tails follow their owners through ordering and deletion',()=>{const m=empty();m.zones.push({name:'A',channels:[],slot:0},{name:'B',channels:[],slot:1});const image=encode(m);putArea(image.bytes,[{key:DEVELOPMENT.zone,value:Uint8Array.of(2,0,0xA1)},{key:DEVELOPMENT.zone+1,value:Uint8Array.of(1,0,0xB2)}]);const back=decode(image);assert.deepEqual(back.zones.map(z=>z.name),['B','A']);const out=encode(back);let entries=decodeArea(out.bytes).entries;assert.deepEqual([...getValue(entries,DEVELOPMENT.zone)],[1,0,0xB2]);assert.deepEqual([...getValue(entries,DEVELOPMENT.zone+1)],[2,0,0xA1]);back.zones.shift();entries=decodeArea(encode(back).bytes).entries;assert.deepEqual([...getValue(entries,DEVELOPMENT.zone)],[1,0,0xA1]);assert.equal(getValue(entries,DEVELOPMENT.zone+1),null)});
test('manual plans use the standard prefix and preserve unknown system-tail flags',()=>{const prev=new Uint8Array(21);prev[10]=0x82;prev[20]=0xA5;const raw=encodeTsys({...decodeTsys(prev),planOnly:true,roaming:true},prev);assert.equal(raw[7]&2,2);assert.equal(raw[10],0x83);assert.equal(raw[20],0xA5);assert.equal(decodeTsys(raw).planOnly,true);assert.equal('manualIden' in decodeTsys(raw),false)});
test('unimplemented system controls require explicit capabilities and retain stored values',()=>{const fields=p25System.fields(empty()),keys=['ccNac','skipEnc','holdS','roamDbm'];assert.deepEqual(fields.filter(f=>keys.includes(f.key)).map(f=>f.feature),['P25_CC_NAC','P25_SKIP_ENC','P25_HOLD','P25_ROAM_THRESHOLD']);const features='FM,P25,P25_TRUNK,P25_PREFERRED,P25_ENCRYPTION';assert.ok(fields.filter(f=>!f.feature||features.includes(f.feature)).every(f=>!keys.includes(f.key)));const before=encodeTsys({...p25System.newFields(),ccNac:0x123,skipEnc:true,holdS:37,roamDbm:-95});const after=encodeTsys({...decodeTsys(before),roaming:true},before);assert.deepEqual([...after.slice(5,10)],[...before.slice(5,10)]);});
test('P25 target choices reject unsupported active targets without changing saved references',()=>{const m=empty(),c=p25(m);c.params.talkgroup=null;m.contacts.push(...[['Group','group',123],['Private','private',456],['Other private','private',789],['Oversized','group',65536],['All','all',0xFFFFFF]].map(([name,type,id],i)=>newContact({number:i+1,name,type,id})));c.contact=m.contacts[1];const features='FM,DMR,P25,P25_PREFERRED',table=columns('channels',m,k=>k,{features}),pick=table.find(f=>f.key==='contact');assert.deepEqual(pick.options(c).slice(1).map(([v])=>v.name),['Group','Private','All']);const bytes=encode(m).bytes;assert.ok(validate(m,{features}).some(p=>p.code==='p25_target_unsupported'));assert.deepEqual(encode(decode(CodeplugImage.from(bytes))).bytes,bytes);c.params.talkgroup=42;assert.ok(!validate(m,{features}).some(p=>p.code.startsWith('p25_target')));assert.equal(c.contact,m.contacts[1]);c.params.talkgroup=null;c.contact=null;m.rxLists.push({number:1,name:'Saved list',contacts:[m.contacts[1],m.contacts[3]]});c.rxList=m.rxLists[0];assert.ok(validate(m,{features}).some(p=>p.code==='p25_target_unsupported'));c.rxList.contacts=[m.contacts[1],m.contacts[0]];assert.ok(!validate(m,{features}).some(p=>p.code.startsWith('p25_target')));const old=decode(encode(m));old.channels[0].name='Renamed';const back=decode(encode(old));assert.equal(back.channels[0].contact,null);assert.equal(back.channels[0].rxList,back.rxLists[0]);});
test('P25 hides unsupported list/talkaround controls and exposes Preferred RX tone without clearing bytes',()=>{const m=empty(),c=p25(m);c.params.mixed=true;c.rxTone='D023I';c.dmo=true;const features='FM,P25,P25_PREFERRED',form=channelForm(m,k=>k,{features});assert.equal(form.find(f=>f.key==='rxList').show(c),false);assert.equal(form.find(f=>f.key==='dmo').show(c),false);assert.equal(form.find(f=>f.key==='rxTone').show(c),true);assert.equal(columns('channels',m,k=>k,{features}).find(f=>f.key==='rxTone').readOnly(c),false);let back=decode(encode(m));assert.equal(back.channels[0].rxTone,'D023I');assert.equal(back.channels[0].dmo,true);c.txHz=441050000;assert.ok(validate(m,{features}).some(p=>p.code==='p25_dmo_unsupported'));});
test('1024 P25 channels fit continuation; re-encode preserves all tags and field values',()=>{const m=empty();for(let i=0;i<1024;i++){const c=p25(m,'P25 '+i);c.params.txNac=i;c.params.talkgroup=i;c.rxOnly=true;c.tagTx=false;}const image=encode(m),area=decodeArea(image.bytes);assert.equal(area.state,'valid');assert.ok(area.sectors.length>1);assert.equal(area.entries.filter(e=>e.key>=MODE_KEY.tag&&e.key<MODE_KEY.tag+1024).length,1024);const back=decode(image);assert.equal(back.channels.length,1024);assert.deepEqual(encode(back).bytes,image.bytes);});
test('RFKV continuation write plan writes only destination pages and activates root last',()=>{const radio=empty().base;putArea(radio.bytes,Array.from({length:600},(_,i)=>({key:0x8400+i,value:new Uint8Array(20).fill(i&255)})));const before=decodeArea(radio.bytes),file=radio.clone();const entries=before.entries.map(e=>({key:e.key,value:e.value.slice()}));entries[0].value[0]^=1;putArea(file.bytes,entries);areaForWrite(file.bytes,radio.bytes);const after=decodeArea(file.bytes);assert.notEqual(before.sectors[1].offset,after.sectors[1].offset);const tr=new CpsSerial({});const plan=tr.cpsPlan(file,radio).plan;assert.equal(plan.at(-1)[0],KV_ADDR);const activeBefore=new Set(before.sectors.slice(1).map(p=>p.offset));assert.ok(plan.every(([a])=>!activeBefore.has(a)));assert.ok(writeRanges(file.bytes).filter(([a])=>a>=KV_BANKS[0]).every(([a])=>after.sectors.some(p=>p.offset===a)));});
test('CPS rejects old firmware before canonical records can be written',async()=>{const radios=JSON.parse(readFileSync('app/data/radios.json')).radios;const fake=new FakeCpsRadio({board:'DM-32UV'}),tr=new CpsSerial(fake.stream());await tr.identify(radios);assert.equal(tr.probe.version.codeplug,'rfkv1');for(const capabilities of [{codeplug:null,codeplugChain:null},{codeplug:'rfkv1',codeplugChain:null}]){const old=new FakeCpsRadio({board:'DM-32UV',git:'open25-classic-0.1.0-rc1-r8',...capabilities});await assert.rejects(new CpsSerial(old.stream()).identify(radios),e=>e.code==='codeplug_migration_firmware');assert.equal(old.writes.length,0);assert.equal(old.claims||0,0)}const wrong=new FakeCpsRadio({board:'DM-32UV',git:'open25-next-x'});await assert.rejects(new CpsSerial(wrong.stream()).identify(radios),e=>e.code==='not_classic')});
test('residual non-DTMF bytes remain untouched and do not block programming',()=>{const m=empty(),r=m.base.bytes.subarray(DTMF_CONTACTS,DTMF_CONTACTS+32);r.fill(0x41);assert.equal(decodeDtmf(r),null);const n=decode(m.base);assert.equal(n.dtmfContacts.length,0);assert.equal(validate(n).filter(p=>p.level==='error').length,0);assert.deepEqual(encode(n).bytes,m.base.bytes);const valid=new Uint8Array(32).fill(255);encodeDtmf({name:'Valid',code:'0123456789ABCD*#'},valid);assert.deepEqual(decodeDtmf(valid),{name:'Valid',code:'0123456789ABCD*#'});});

test('canonical parameter bytes match Classic real C encoder for every usable TX NAC',()=>{
 const cases=[];for(let tx=0;tx<=4095;tx++)if(tx!==0xF7E&&tx!==0xF7F)cases.push({squelch:0,rxNac:0x293,txNac:tx,talkgroup:65535,keySlot:0});cases.push({squelch:0,rxNac:0xF7E,txNac:null,talkgroup:0,keySlot:0});
 const input=cases.map(p=>`P ${p.rxNac} ${p.txNac==null?0:p.txNac+1} ${p.talkgroup} 101 1`).join('\n')+'\n';const run=spawnSync('build/c-format-bridge',[],{input,encoding:'utf8',maxBuffer:2e6});assert.equal(run.status,0,run.stderr);const out=run.stdout.trim().split('\n').map(JSON.parse);assert.equal(out.length,cases.length);cases.forEach((p,i)=>assert.equal(Buffer.from(encodeConv(p)).toString('hex'),out[i].hex));
});
test('Classic conventional P25 CSV retains split/fixed-zero/inherited fields',async()=>{const {exportTable,importTable}=await import('../app/static/js/codeplug/csv.js');const m=empty();for(const tx of [null,0,0x293]){const c=p25(m,'P25 '+tx);c.params.txNac=tx;}const n=empty(),result=importTable(n,exportTable(m,'channels'),'channels');assert.deepEqual(result.problems,[]);assert.deepEqual(decode(encode(n)).channels.map(c=>[c.params.txNac,c.params.talkgroup,c.dmrId,c.tagTx]),[[null,1,101,true],[0,1,101,true],[0x293,1,101,true]])});
test('conventional P25 CSV preserves inherited and explicit-zero TX NAC',async()=>{const {importTable}=await import('../app/static/js/codeplug/csv.js');const m=empty();const out=importTable(m,'Name,Mode,RX Frequency (MHz),TX Frequency (MHz),RX NAC (hex),TX NAC (hex),Talkgroup override,Channel Radio ID,RX Only\nInherited,P25,446.05,446.05,293,,1,101,No\nZero,P25,446.05,446.05,293,000,1,101,No\n','channels');assert.deepEqual(out.problems,[]);assert.deepEqual(decode(encode(m)).channels.map(c=>c.params.txNac),[null,0])});
test('canonical RFKV P25 file entry preserves records without conversion',async()=>{const {imageFrom}=await import('../app/static/js/editor/files.js');const m=empty();p25(m);const image=encode(m),before=image.bytes.slice(),result=imageFrom(image.bytes);assert.deepEqual(result.bytes,before);assert.equal(decode(result).channels[0].kind,2)});

test('missing named-plan references remain selectable unchanged and fail validation',()=>{const m=empty(),s={number:1,name:'Missing plan',type:3,ownId:0,fields:{...p25System.newFields(),idenSet:9},entries:[]};m.systems.push(s);const field=p25System.fields(m).find(f=>f.key==='idenSet');assert.deepEqual(field.options(s.fields).at(-1),[9,'#9 (missing)']);const before=encode(m).bytes;assert.ok(validate(m).some(p=>p.field==='idenSet'&&p.level==='error'));assert.equal(decode(CodeplugImage.from(before)).systems[0].fields.idenSet,9);s.fields.idenSet=1;assert.ok(validate(m).some(p=>p.field==='idenSet'&&p.code==='dangling'));});
test('missing scan and unavailable key choices keep their current value in grid and form',()=>{const m=empty(),c=p25(m);const features='FM,P25,P25_ENCRYPTION';for(const slot of [4,5]){c.params.keySlot=slot;const cell=columns('channels',m,k=>k,{features,keyMask:0}).find(x=>x.key==='k2.keySlot');assert.ok(cell.options(c).some(([v])=>v===slot));assert.ok(channelForm(m,k=>k,{features,keyMask:0}).find(x=>x.key==='k2.keySlot').options(c).some(([v])=>v===slot));}const z={name:'Missing scan',channels:[],scan:99},cell=columns('zones',m,k=>k).find(x=>x.key==='scan');assert.ok(cell.options(z).some(([v])=>v===99));assert.notEqual(cell.format(99),'');});

test('current CSV refuses retired inherited-NAC text instead of converting it',async()=>{const {importTable}=await import('../app/static/js/codeplug/csv.js');for(const value of ['Same as RX','inherit']){const out=importTable(empty(),'Name,Mode,RX Frequency (MHz),TX Frequency (MHz),TX NAC (hex)\nP25,P25,446.05,446.05,'+value+'\n','channels');assert.ok(out.problems.length)}});


test('P25 effective transmit identities and RX-only zero values match the actual C validator',()=>{
 const cases=[
  {tg:0,own:101,mode:0,radio:0,only:false,valid:false},
  {tg:0,own:0,mode:0,radio:0,only:true,valid:true},
  {tg:1,own:0,mode:0,radio:0,only:false,valid:false},
  {tg:1,own:0,mode:0,radio:101,only:false,valid:true},
  {tg:1,own:0,mode:202,radio:101,only:false,valid:true},
  {tg:1,own:303,mode:202,radio:101,only:false,valid:true},
  {tg:65535,own:0xFFFFFE,mode:0,radio:0,only:false,valid:true},
  {tg:1,own:0xFFFFFF,mode:0,radio:0,only:false,valid:false},
  {tg:1,own:0,mode:0,radio:0xFFFFFF,only:true,valid:false},
  {tg:1,own:0,mode:0xFFFFFE,radio:0,only:false,valid:true}
 ];
 const lines=cases.map(x=>`V ${x.tg} ${x.own} ${x.mode} ${x.radio} ${+x.only}`).join('\n')+'\n';
 const run=spawnSync('build/c-format-bridge',[],{input:lines,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const native=run.stdout.trim().split('\n').map(JSON.parse);
 cases.forEach((x,i)=>{const m=empty(),c=p25(m);c.params.talkgroup=x.tg;c.dmrId=x.own;c.tagTx=!x.only;m.modeSettings[2].unitId=x.mode;m.general.dmrId=x.radio;
  const errors=validate(m,{features:'FM,DMR,P25'}).filter(p=>p.level==='error');assert.equal(errors.length===0,x.valid,JSON.stringify(x));assert.equal(!!native[i].valid,x.valid,JSON.stringify(native[i]));
  assert.equal(native[i].id,x.own||x.mode||x.radio);
 });
});
test('P25 zero and oversized derived contact targets fail validation while absent targets use group1',()=>{
 for(const throughList of [false,true])for(const id of [0,65536]){const m=empty(),c=p25(m);c.params.talkgroup=null;const contact=newContact({number:1,name:'Invalid group',type:'group',id});m.contacts.push(contact);
  if(throughList){const list={number:1,name:'Targets',contacts:[contact]};m.rxLists.push(list);c.rxList=list;}else c.contact=contact;
  assert.ok(validate(m,{features:'FM,DMR,P25'}).some(p=>p.level==='error'&&p.code==='p25_target_unsupported'));
 }
 const m=empty(),c=p25(m);c.params.talkgroup=null;assert.equal(validate(m,{features:'FM,DMR,P25'}).filter(p=>p.level==='error').length,0);
});

test('P25 channel and mode unit IDs reject negative fractional and reserved values before encoding',()=>{
 for(const value of [-1,0.5,0xFFFFFF])for(const target of ['channel','mode']){const m=empty(),c=p25(m);if(target==='channel')c.dmrId=value;else{c.dmrId=0;m.modeSettings[2].unitId=value;}const before=m.base.bytes.slice();assert.ok(validate(m,{features:'FM,DMR,P25'}).some(p=>p.level==='error'&&p.code==='range'));assert.deepEqual(m.base.bytes,before)}
});
