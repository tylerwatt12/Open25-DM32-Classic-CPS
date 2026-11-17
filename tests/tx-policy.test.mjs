// SPDX-License-Identifier: MIT
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,newChannel,encode,decode} from '../app/static/js/codeplug/model.js';
import {setKind} from '../app/static/js/codeplug/channelmodes.js';
import {CLASSIC_TX_GUARD,effectiveTx,outsideAmateur,rxOnlyGet,rxOnlySet,txDefault} from '../app/static/js/editor/views.js';

test('Classic amateur bounds are inclusive and depend on effective transmit frequency',()=>{
 assert.equal(CLASSIC_TX_GUARD,true);
 for(const hz of [144000000,148000000,420000000,450000000])assert.equal(outsideAmateur({rxHz:155000000,txHz:hz}),false,hz);
 for(const hz of [143999999,148000001,419999999,450000001])assert.equal(outsideAmateur({rxHz:145000000,txHz:hz}),true,hz);
 assert.equal(effectiveTx({rxHz:155000000,txHz:446050000,dmo:false}),446050000);
 assert.equal(effectiveTx({rxHz:155000000,txHz:446050000,dmo:true}),155000000);
 assert.equal(effectiveTx({rxHz:145500000,txHz:0}),145500000);
 assert.equal(outsideAmateur({rxHz:145500000,txHz:0}),false);
});
test('any changed effective TX outside resets RX-only while an unchanged saved channel stays enabled',()=>{
 const c=newChannel({name:'Saved',rxHz:155000000,txHz:155000000,rxOnly:false});
 txDefault(155000000,c);assert.equal(rxOnlyGet(c),false);
 c.txHz=156000000;txDefault(155000000,c);assert.equal(rxOnlyGet(c),true);
 rxOnlySet(c,false);c.txHz=157000000;txDefault(156000000,c);assert.equal(rxOnlyGet(c),true);
 rxOnlySet(c,false);c.rxHz=158000000;c.dmo=true;txDefault(157000000,c);assert.equal(rxOnlyGet(c),true);
 rxOnlySet(c,false);c.dmo=false;c.txHz=145500000;txDefault(158000000,c);assert.equal(rxOnlyGet(c),false);
});
test('fresh copied P25 uses the mode transmit flag and preserves its safe receive-only base',()=>{
 const m=empty(),c=newChannel({name:'P25',rxHz:155000000,txHz:155000000});m.channels.push(c);setKind(m,c,2);c.params.talkgroup=1;c.dmrId=101;c.tagTx=true;
 assert.equal(c.rxOnly,true);assert.equal(rxOnlyGet(c),false);
 const copy={...c,params:{...c.params}};txDefault(effectiveTx(c),copy,true);
 assert.equal(copy.rxOnly,true);assert.equal(copy.tagTx,false);assert.equal(c.tagTx,true);
 rxOnlySet(copy,false);assert.equal(copy.rxOnly,true);assert.equal(copy.tagTx,true);
});
test('encoding and loading existing out-of-band programming do not apply editor defaults',()=>{
 const m=empty(),c=newChannel({name:'Existing',rxHz:155000000,txHz:155000000,rxOnly:false});m.channels.push(c);
 assert.equal(decode(encode(m)).channels[0].rxOnly,false);
 setKind(m,c,2);c.params.talkgroup=1;c.dmrId=101;c.tagTx=true;
 const back=decode(encode(m)).channels[0];assert.equal(back.tagTx,true);assert.equal(back.rxOnly,true);
});
