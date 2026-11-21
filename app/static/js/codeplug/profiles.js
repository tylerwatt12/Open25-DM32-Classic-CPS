// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Open25-DM32 Contributors
// Edition profiles describe stored bytes, never convert them. Schema migration belongs to Flasher v3.
import {decodeArea} from './kv.js';
export const LEGACY = 'classic-r13';
export const NATIVE = 'classic-r14';
export const PROFILES = [[NATIVE, 'Classic r14'], [LEGACY, 'Classic r9–r13']];
export const isNative = profile => profile === NATIVE;
export function firmwareProfile(p) {
 const v=p.version??{}, features=String(p.features??'').split(',');
 if(p.git==='open25-classic-0.1.0-rc1-r14' && p.board==='DM-32UV' &&
    ['FM','DMR','P25','NXDN','CPS_FAST'].every(f=>features.includes(f))) return NATIVE;
 if(p.git==='open25-classic-0.1.0-rc1-r14')return null;
 if(/^open25-classic-/i.test(String(p.git??'')) && v.codeplug==='rfkv1' && v.codeplug_chain==='1') return LEGACY;
 return null;
}

export function nativeParamIssue(p) {
 if(p.length>=6&&(p[5]&1))return 'native_migration_required';
 if(p.length>=6&&(p[5]&0x1E)||p.length>=9&&p[8]!==0)return 'native_options_unsupported';
 return null;
}

// Bytes are checked again at the transport boundary, independently of the editing profile.
export function nativeIssue(bytes) {
 const area=decodeArea(bytes);
 if(area.state==='bad'||area.state==='newer')return 'native_settings_unsupported';
 if((area.sectors?.length??0)>1)return 'native_migration_required';
 for(const {key,value:v} of area.entries)if(key>=0x0400&&key<0x0800&&v[0]===2){
  const at=v[4]&4?9:5;
  const issue=nativeParamIssue(v.subarray(at));if(issue)return issue;
 }
 return null;
}
export function nativeTxAllowed(c) {
 const hz=c.dmo||!c.txHz?c.rxHz:c.txHz;
 if(c.kind===2)return [[144e6,148e6,false],[420e6,450e6,false],[151820000,151940000,true],
  [154570000,154600000,true],[462550000,462725000,true],[467550000,467725000,true]]
  .some(([lo,hi,inclusive])=>hz>=lo&&(inclusive?hz<=hi:hz<hi));
 return [[136e6,174e6],[400e6,480e6]].some(([lo,hi])=>hz>=lo&&hz<=hi);
}

export const nativeRxAllowed=hz=>[[16000000,65000000],[136e6,174e6],[174e6,400e6],[400e6,480e6],[480e6,740e6],
 [764e6,776e6],[794e6,806e6],[806e6,824e6],[851e6,870e6]].some(([lo,hi])=>hz>=lo&&hz<=hi);
