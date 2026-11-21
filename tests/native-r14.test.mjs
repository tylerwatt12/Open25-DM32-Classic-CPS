// SPDX-License-Identifier: MIT
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {empty,newChannel,newContact,decode,encode,validate,numberAll} from '../app/static/js/codeplug/model.js';
import {setKind,decodeTag,MODE_KEY} from '../app/static/js/codeplug/channelmodes.js';
import {NATIVE,LEGACY,firmwareProfile,nativeIssue,nativeTxAllowed} from '../app/static/js/codeplug/profiles.js';
import {decodeArea,getValue,putArea,KV_ADDR,KV_CONTINUATIONS} from '../app/static/js/codeplug/kv.js';
import {encodeNativeConv} from '../app/static/js/codeplug/mode_p25_native.js';
import {encodeConv as encodeNxdn} from '../app/static/js/codeplug/mode_nxdn.js';
import {CpsSerial} from '../app/static/js/codeplug/transport.js';
import {FakeCpsRadio} from '../app/static/js/codeplug/fakecps.js';
import {columns,channelForm,txDefault} from '../app/static/js/editor/views.js';
const FEATURES='FM,DMR,P25,NXDN,CPS_FAST';
const radio=(extra={})=>new FakeCpsRadio({board:'DM-32UV',git:'open25-classic-0.1.0-rc1-r14',features:FEATURES,codeplug:null,codeplugChain:null,...extra});
const radios=JSON.parse(readFileSync('app/data/radios.json')).radios;
function channel(m,name='Native',kind=2){const c=newChannel({name,rxHz:446050000,txHz:446050000,dmrId:101});m.channels.push(c);setKind(m,c,kind);return c;}
function actual(image){const dir=mkdtempSync(join(tmpdir(),'classic-native-cps-'));try{const path=join(dir,'codeplug.bin');writeFileSync(path,image.bytes);const run=spawnSync('build/c-native-bridge',[path],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.doesNotMatch(run.stderr,/Sanitizer|runtime error/);return run.stdout.trim().split('\n').filter(Boolean).map(JSON.parse)}finally{rmSync(dir,{recursive:true})}}
test('actual native C reader resolves P25 contact targets and NACs, preserving unknown tails',()=>{
 const m=empty({profile:NATIVE});m.general.dmrId=12345;
 for(const [type,id] of [['group',42],['private',123456],['all',0xFFFFFF]]){const contact=newContact({name:type,type,id});m.contacts.push(contact);const c=channel(m,type);c.contact=contact;c.params.rxNac=0x123;c.params.txNac=0;}
 const img=encode(m),area=decodeArea(img.bytes);
 assert.equal(area.sectors.length,1);
 for(const c of m.channels)assert.equal(decodeTag(getValue(area.entries,MODE_KEY.tag+c.number-1)).params.length,5);
 assert.deepEqual(actual(img).map(({ok,rx,tx,target,unit,id})=>({ok,rx,tx,target,unit,id})),[
  {ok:1,rx:0x123,tx:0,target:42,unit:0,id:101},{ok:1,rx:0x123,tx:0,target:123456,unit:1,id:101},{ok:1,rx:0x123,tx:0,target:65535,unit:0,id:101}]);
 const tail=Uint8Array.of(0xAA,0xBB,0xCC);const e=area.entries.find(e=>e.key===MODE_KEY.tag);e.value=Uint8Array.from([...e.value,...tail]);putArea(img.bytes,area.entries);
 const back=decode(img,{profile:NATIVE});assert.deepEqual(encode(back).bytes,img.bytes);back.channels[0].params.rxNac=0x321;
 const changed=decodeTag(getValue(decodeArea(encode(back).bytes).entries,MODE_KEY.tag));assert.deepEqual(changed.params.slice(5),tail);
});
test('every usable TX NAC agrees with the actual native C decoder, including explicit zero and equal RX',()=>{
 const cases=[];for(let tx=0;tx<4096;tx++)if(tx!==0xF7E&&tx!==0xF7F)cases.push({squelch:0,rxNac:0x293,txNac:tx});cases.push({squelch:1,rxNac:0xF7E,txNac:null});
 const run=spawnSync('build/c-native-bridge',[],{input:cases.map(p=>'P '+Buffer.from(encodeNativeConv(p)).toString('hex')).join('\n')+'\n',encoding:'utf8',maxBuffer:2e6});assert.equal(run.status,0,run.stderr);
 const got=run.stdout.trim().split('\n').map(JSON.parse);assert.equal(got.length,cases.length);
 cases.forEach((p,i)=>assert.deepEqual(got[i],{rx:p.rxNac,tx:p.txNac??0x293,squelch:p.squelch}));
});
test('native NXDN 4800/9600 RAN and contact programming is read by actual C owners',()=>{
 const m=empty({profile:NATIVE});for(const rate9600 of [true,false]){const c=channel(m,rate9600?'NX96':'NX48',4);c.params={rate9600,squelch:1,rxRan:3,txRan:0};const target=newContact({name:c.name,type:'private',id:505});m.contacts.push(target);c.contact=target;}
 const img=encode(m);assert.deepEqual(actual(img).map(({ok,rx,tx,target,unit,rate9600})=>({ok,rx,tx,target,unit,rate9600})),[1,0].map(rate9600=>({ok:1,rx:3,tx:0,target:505,unit:1,rate9600})));
 assert.deepEqual(encode(decode(img,{profile:NATIVE})).bytes,img.bytes);
 const cases=[];for(const rate9600 of [true,false])for(let ran=0;ran<64;ran++)cases.push({rate9600,squelch:1,rxRan:ran,txRan:ran});
 const r=spawnSync('build/c-native-bridge',[],{input:cases.map(p=>'N '+Buffer.from(encodeNxdn(p)).toString('hex')).join('\n')+'\n',encoding:'utf8'});assert.equal(r.status,0,r.stderr);const got=r.stdout.trim().split('\n').map(JSON.parse);cases.forEach((p,i)=>assert.deepEqual(got[i],{rx:p.rxRan,tx:p.txRan,squelch:1,rate9600:+p.rate9600}));
});
test('r13 explicit targets remain byte exact and actual native firmware refuses the unconverted record',async()=>{
 const old=empty(),c=channel(old);c.params.talkgroup=123;c.params.txNac=0;const img=encode(old),before=img.bytes.slice();
 assert.equal(actual(img)[0].ok,0);assert.equal(nativeIssue(img.bytes),'native_migration_required');
 assert.deepEqual(encode(decode(img)).bytes,before);
 const native=decode(img,{profile:NATIVE});assert.ok(validate(native).some(p=>p.code==='native_migration_required'));assert.deepEqual(encode(native).bytes,before);
 const fake=radio(),tr=new CpsSerial(fake.stream());await tr.identify(radios);await assert.rejects(tr.plan(img,null),e=>e.code==='native_migration_required');await assert.rejects(tr.write(img,null),e=>e.code==='native_migration_required');assert.equal(fake.writes.length,0);assert.equal(fake.claims||0,0);
});
test('native settings do not spill into r13 continuation banks; old chains remain inspectable and unwritable',async()=>{
 const old=empty();for(let i=0;i<340;i++)channel(old,'P'+i);const img=encode(old);assert.ok(decodeArea(img.bytes).sectors.length>1);
 const tr=new CpsSerial(radio().stream());await tr.identify(radios);await assert.rejects(tr.plan(img,null),e=>e.code==='native_migration_required');assert.deepEqual(encode(decode(img)).bytes,img.bytes);
 const m=empty({profile:NATIVE});for(let i=0;i<340;i++)channel(m,'P'+i);numberAll(m);assert.ok(validate(m).some(p=>p.code==='settings_area_full'));assert.throws(()=>encode(m),/full|one sector/);
});
test('actual r14 VERSION shape admits only qualified native releases; legacy capability path remains separate',async()=>{
 const tr=new CpsSerial(radio().stream());await tr.identify(radios);assert.equal(tr.profile,NATIVE);assert.ok(tr.regions.every(([a])=>!KV_CONTINUATIONS.includes(a)));
 for(const git of ['open25-classic-0.1.0-rc1-r13','open25-classic-0.1.0-rc1-r15']){const fake=radio({git});await assert.rejects(new CpsSerial(fake.stream()).identify(radios),e=>e.code==='codeplug_migration_firmware');assert.equal(fake.writes.length,0);}
 const legacy=new CpsSerial(new FakeCpsRadio({board:'DM-32UV',git:'open25-classic-0.1.0-rc1-r13'}).stream());await legacy.identify(radios);assert.equal(legacy.profile,LEGACY);
 assert.equal(firmwareProfile({git:'open25-next-x',features:FEATURES,board:'DM-32UV'}),null);
});
test('native editor offers contact targets, NAC and NXDN without direct TG or old receive-only defaults',()=>{
 const m=empty({profile:NATIVE}),c=channel(m),form=channelForm(m,k=>k,{features:FEATURES});
 assert.ok(form.some(f=>f.key==='k2.rxNac'));assert.ok(form.some(f=>f.key==='k2.txNac'));assert.ok(!form.some(f=>f.key==='k2.talkgroup'));assert.ok(form.find(f=>f.key==='mode').options(c).some(([v])=>v==='k4'));
 const table=columns('channels',m,k=>k,{features:FEATURES});assert.ok(table.some(f=>f.key==='contact'));assert.ok(!table.some(f=>f.key==='k2.talkgroup'));
 c.txHz=154570000;txDefault(446050000,c);assert.equal(c.tagTx,true);assert.equal(form.find(f=>f.key==='rxOnly').defaultWhen,null);
 const freq=form.find(f=>f.key==='freqs').fields[0];const fm=newChannel({profile:NATIVE});freq.parse(fm,'rxHz','136.5');assert.equal(fm.rxOnly,false);assert.equal(table.find(f=>f.key==='mode').format('fm',fm),'FM');
});
test('native policy uses continuous service ranges and exact amateur upper bounds for every protocol',()=>{
 for(const kind of [0,2,4])for(const [hz,expected] of [[136e6,kind!==2],[174e6,kind!==2],[400e6,kind!==2],[480e6,kind!==2],[148e6,kind!==2],[450e6,kind!==2],[151900000,true],[154585000,true],[462600000,true],[467600000,true],[151819999,kind!==2],[764e6,false]])assert.equal(nativeTxAllowed({kind,txHz:hz}),expected,`${kind}/${hz}`);
});

test('native programming traverses the real serial transport and actual C loader without touching continuation banks',async()=>{
 const fake=radio(),tr=new CpsSerial(fake.stream());await tr.identify(radios);
 const have=await tr.read({iddb:false}),m=empty({profile:NATIVE}),c=channel(m);
 const tg=newContact({name:'Dispatch',type:'group',id:701});m.contacts.push(tg);c.contact=tg;c.params.rxNac=0x321;
 const want=encode(m),plan=await tr.plan(want,have);assert.ok(plan.plan.length);
 assert.ok(plan.plan.every(([a])=>!KV_CONTINUATIONS.includes(a)));
 const result=await tr.write(want,have);await tr.verify(want,result.plan);
 const back=await tr.read({iddb:false});assert.equal(decode(back,{profile:NATIVE}).channels[0].contact.id,701);
 assert.deepEqual(actual(back).map(p=>[p.ok,p.target,p.rx,p.tx]),[[1,701,0x321,0x321]]);
 assert.ok(fake.writes.every(([addr])=>!KV_CONTINUATIONS.includes(Math.floor((addr-tr.base)/4096)*4096)));
});

test('native P25/NXDN conventional CSV roundtrips without introducing legacy option fields',async()=>{
 const {exportTable,importTable}=await import('../app/static/js/codeplug/csv.js');
 const m=empty({profile:NATIVE});for(const kind of [2,4]){const c=channel(m,'Mode'+kind,kind);if(kind===2)c.params.txNac=0;else c.params.txRan=0;}
 const csv=exportTable(m,'channels');assert.match(csv,/NXDN/);
 const n=empty({profile:NATIVE}),out=importTable(n,csv,'channels');assert.deepEqual(out.problems,[]);
 assert.deepEqual(decode(encode(n),{profile:NATIVE}).channels.map(c=>[c.kind,c.params.txNac,c.params.txRan]),[[2,0,undefined],[4,undefined,0]]);
 const invalid=importTable(empty({profile:NATIVE}),'Name,Mode,RX Frequency (MHz),TX Frequency (MHz),Talkgroup override\nOld,P25,446.05,446.05,123\n','channels');assert.ok(invalid.problems.some(p=>p.code==='native_migration_required'));
});
test('native writing refuses legacy mixed/security requests while preserving their bytes',async()=>{
 for(const flag of [2,4,8,16]){const old=empty(),c=channel(old);c.params.talkgroup=null;c.params.mixed=flag===2;c.params.txEncryption=flag===4?1:flag===8?2:0;c.params.ignoreClear=flag===16;c.params.keySlot=flag===16?1:0;
  const image=encode(old),before=image.bytes.slice(),back=decode(image,{profile:NATIVE});assert.ok(validate(back).some(p=>p.code==='native_options_unsupported'));assert.deepEqual(encode(back).bytes,before);
  const fake=radio(),tr=new CpsSerial(fake.stream());await tr.identify(radios);await assert.rejects(tr.write(image,null),e=>e.code==='native_options_unsupported');assert.equal(fake.writes.length,0);
 }
});

test('opaque native NXDN key selections survive ordinary edits without permitting a new unverifiable key',()=>{
 const m=empty({profile:NATIVE}),c=channel(m,'Keyed NXDN',4);c.params.txKeyId=7;
 assert.ok(validate(m).some(p=>p.code==='nxdn_missing_tx_key'));
 const image=encode(m),back=decode(image,{profile:NATIVE});assert.ok(!validate(back).some(p=>p.code==='nxdn_missing_tx_key'));
 assert.deepEqual(encode(back).bytes,image.bytes);back.channels[0].params.rxRan=4;
 const output=decode(encode(back),{profile:NATIVE});assert.equal(output.channels[0].params.txKeyId,7);assert.equal(output.channels[0].params.rxRan,4);
 output.channels[0].params.txKeyId=8;assert.ok(validate(output).some(p=>p.code==='nxdn_missing_tx_key'));
});
