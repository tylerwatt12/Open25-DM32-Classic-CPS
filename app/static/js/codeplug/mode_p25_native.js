// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The RadioFoundry Authors
// Copyright (c) 2026 Open25-DM32 Contributors
// Native five-byte conventional parameters, matching core/p25/p25_codeplug.c.
// Contact targets replace r13's explicit-TG extension. Existing tails remain opaque.
import {p25Kind,decodeConv,NAC_DEFAULT,NAC_ANY,NAC_REPEAT_ANY,NAC_SET,UNIT_MAX} from './mode_p25.js';
import {nativeParamIssue} from './profiles.js';
import {grow,put16} from './modebytes.js';
export function decodeNativeConv(b) {
 const {squelch,rxNac,txNac}=decodeConv(b);
 return {squelch,rxNac,txNac,...(nativeParamIssue(b??[])?{legacyIssue:nativeParamIssue(b)}:{})};
}
export function encodeNativeConv(p,prev=null) {
 const v=grow(prev,5);
 v[0]=(v[0]&~3)|(p.squelch===1?1:0);
 put16(v,1,p.rxNac===NAC_DEFAULT?0:NAC_SET|(p.rxNac&0xFFF));
 put16(v,3,p.txNac==null?0:NAC_SET|(p.txNac&0xFFF));
 return v;
}
const acceptContact=c=>c.type==='all'||Number.isInteger(c.id)&&c.id>=1&&
 ((c.type==='group'&&c.id<=65535)||(c.type==='private'&&c.id<=UNIT_MAX));
export const nativeP25Kind={...p25Kind,
 recordFields:['contact','rxList','dmrId','dmo'],acceptContact,
 newParams:()=>({squelch:0,rxNac:NAC_DEFAULT,txNac:null}),
 decode:decodeNativeConv,encode:encodeNativeConv,
 fields:()=>p25Kind.fields().filter(f=>['squelch','rxNac','txNac'].includes(f.key)),
 validate(c,p,problem,{model}={}) {
  if(p.legacyIssue||p.talkgroup!=null)problem.err('contact',p.legacyIssue??'native_migration_required');
  const target=c.contact||(typeof c.rxList==='object'?c.rxList?.contacts.find(x=>x&&typeof x==='object'&&x.type!=='private'):null);
  if(typeof target==='number')problem.err('contact','native_p25_target_missing');
  else if(target&&!acceptContact(target))problem.err('contact','native_p25_target_unsupported');
  const modeId=model?.modeSettings?.[2]?.unitId||model?.general?.dmrId||0;
  const id=c.dmrId||modeId;
  if(!Number.isInteger(c.dmrId)||c.dmrId<0||c.dmrId>UNIT_MAX||!Number.isInteger(id)||id<0||id>UNIT_MAX)
   problem.err('dmrId','range',{min:0,max:UNIT_MAX});
  if(c.tagTx&&!id)problem.err('dmrId','native_p25_tx_identity');
  if(p.rxNac===NAC_REPEAT_ANY)problem.err('rxNac','p25_nac_repeat');
  if(p.txNac===NAC_ANY||p.txNac===NAC_REPEAT_ANY)problem.err('txNac','p25_nac_any_tx');
 }
};
