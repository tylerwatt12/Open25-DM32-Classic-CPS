// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The RadioFoundry Authors
// The P25 mode modules of the Codeplug Editor (docs/spec/p25-codeplug.md): kind 2 (conventional), kind 3 (trunked)
// and system type 3 on the channel-mode layer (channelmodes.js). Bytes to fields and back, and the fields the pages
// show, as data. Current radio engines support group and all-call targets.

import {getName,putName} from "./fields.js";
import { u8, u16, u24, u32, s8, put16, put24, put32, grow } from "./modebytes.js";

export const NAC_DEFAULT = 0x293, NAC_ANY = 0xF7E, NAC_REPEAT_ANY = 0xF7F, NAC_SET = 0x8000;
export const UNIT_MAX = 0xFFFFFE;
// Above this the editor warns: unit IDs this long are unusual (the standard's range is not checked here)
export const UNIT_WARN = 9999999;
export const WACN_ANY = 0xFFFFFF, SYSID_ANY = 0xFFFF, P25_UNKNOWN = 0xFF;

// A NAC field: its value when set, else dflt; a value the field can't hold reads as dflt too
const nacField = (f, dflt) => ((f & NAC_SET) && !(f & 0x7000) ? f & 0x0FFF : dflt);
const nacOut = (v, dflt) => (v === dflt ? 0 : NAC_SET | (v & 0x0FFF));

const p25Contact = c => c.type === 'all' || c.type === 'group' && Number.isInteger(c.id) && c.id >= 1 && c.id <= 0xFFFF;
function tgRange(c, p, problem) {
 if(c.dmo&&(c.kind===3||c.rxHz!==c.txHz))problem.err('dmo','p25_dmo_unsupported');
 if(p.talkgroup!=null)return; // an explicit override owns the actual target
 const target=c.contact||(c.rxList&&typeof c.rxList==='object'?c.rxList.contacts.find(t=>t&&typeof t==='object'&&t.type!=='private'):null);
 if(typeof target==='number')problem.err('contact','p25_target_missing');
 else if(target&&!p25Contact(target))problem.err('contact','p25_target_unsupported');
}


// Appended mode fields: the upstream prefixes remain unchanged. Key bytes stay
// device-local; only the existing slot number is programming data.
function decodeOptions(b,o){const f=u8(b,o);return {talkgroup:f&1?u16(b,o+1):null,mixed:!!(f&2),txEncryption:f&8?2:f&4?1:0,ignoreClear:!!(f&16),keySlot:u8(b,o+3)}}
function encodeOptions(p,b,o){b[o]=(b[o]&0xE0)|(p.talkgroup!=null?1:0)|(p.mixed?2:0)|(p.txEncryption?4:0)|(p.txEncryption===2?8:0)|(p.ignoreClear?16:0);put16(b,o+1,p.talkgroup??0);b[o+3]=p.keySlot??0;}
const optionsDefaults=()=>({talkgroup:null,mixed:false,txEncryption:0,ignoreClear:false,keySlot:0});
const optionsFields=(mixed=false)=>[
 {key:'talkgroup',label:'editor.p25.direct_tg',type:'int',min:0,max:65535,blank:null,help:'editor.p25.direct_tg_help'},
 ...(mixed?[{key:'mixed',feature:'P25_PREFERRED',label:'editor.p25.mixed',type:'bool'}]:[]),
 {key:'txEncryption',feature:'P25_ENCRYPTION',label:'editor.p25.tx_encryption',type:'select',options:()=>[[0,'Clear'],[1,'Secure'],[2,'Secure only']]},
 {key:'keySlot',feature:'P25_ENCRYPTION',label:'editor.p25.key_slot',type:'select',options:(p={})=>[[0,'None'],[1,'1'],[2,'2'],[3,'3'],[4,'4'],...(p.keySlot!=null&&(p.keySlot<0||p.keySlot>4)?[[p.keySlot,`#${p.keySlot} (unavailable)`]]:[])]},
 {key:'ignoreClear',feature:'P25_ENCRYPTION',label:'editor.p25.ignore_clear',type:'bool'},
];
function validateOptions(p,problem){
 if(p.talkgroup!=null&&(!Number.isInteger(p.talkgroup)||p.talkgroup<0||p.talkgroup>65535))problem.err('talkgroup','p25_tg_range');
 if(!Number.isInteger(p.keySlot)||p.keySlot<0||p.keySlot>4)problem.err('keySlot','p25_key_slot');
 if(p.txEncryption&&!p.keySlot)problem.err('keySlot','p25_key_required');
 if(p.ignoreClear&&!p.txEncryption)problem.err('ignoreClear','p25_secure_required');
}

// --- Conventional channel (2) ---

export function decodeConv(b) {
	const sq = u8(b, 0) & 3;
	let rx = nacField(u16(b, 1), NAC_DEFAULT);
	if (rx === NAC_REPEAT_ANY) rx = NAC_DEFAULT;
	const txDflt = rx === NAC_ANY ? NAC_DEFAULT : rx;
	let tx = u16(b, 3) & NAC_SET ? nacField(u16(b, 3), txDflt) : null;
	if (tx === NAC_ANY || tx === NAC_REPEAT_ANY) tx = txDflt;
	return { squelch: sq === 1 ? 1 : 0, rxNac: rx, txNac: tx, ...decodeOptions(b,5) };
}

export function encodeConv(p, prev = null) {
	const v = grow(prev, 9);
	v[0] = (v[0] & ~3) | (p.squelch === 1 ? 1 : 0);
	put16(v, 1, nacOut(p.rxNac, NAC_DEFAULT));
	put16(v, 3, p.txNac == null ? 0 : NAC_SET | (p.txNac & 0x0FFF));
 encodeOptions(p,v,5);
	return v;
}

// The radio-wide record (1): {unitId: 0 = the radio's DMR ID}
export function decodeUnit(b) {
	const id = b && b.length >= 4 ? u32(b, 0) : 0;
	return { unitId: id >= 1 && id <= UNIT_MAX ? id : 0 };
}

const nacText = (v) => v.toString(16).toUpperCase().padStart(3, "0");
const nacFieldDef = (key, label) => ({ key, label, type: "hex", min: 0, max: 0xFFF, digits: 3, format: nacText });

export const p25Kind = {
	id: 2,
	feature: "P25",
 channelDefaults:{bw:12.5},
	systemType: null,
	contacts: true,
 acceptContact:p25Contact,
	ownFreqs: true,
	defaultTx: true,
	recordFields: r=>["contact", "dmrId",...(r.params?.mixed?["rxTone"]:[])],
	flags: {},
	newParams: () => ({ squelch: 0, rxNac: NAC_DEFAULT, txNac: null, ...optionsDefaults() }),
	decode: decodeConv,
	encode: encodeConv,
	fields: () => [
		{ key: "squelch", label: "editor.p25.squelch", type: "select", options: () => [[0, "editor.p25.squelch0"], [1, "editor.p25.squelch1"]] },
		// blank: the default NAC; the TX NAC's, the RX NAC
		{ ...nacFieldDef("rxNac", "editor.p25.rx_nac"), blank: NAC_DEFAULT, exclude:[NAC_REPEAT_ANY], help: "editor.p25.nac_any" },
		{ ...nacFieldDef("txNac", "editor.p25.tx_nac"), blank: null,exclude:[NAC_ANY,NAC_REPEAT_ANY] },
 ...optionsFields(true),
	],
	validate(c, p, problem, { model } = {}) {
		tgRange(c,p,problem);validateOptions(p,problem);
		const modeId = model?.modeSettings?.[2]?.unitId;
		const defaultId = Number.isInteger(modeId) && modeId >= 1 && modeId <= UNIT_MAX ? modeId : model?.general?.dmrId ?? 0;
		const effectiveId = c.dmrId || defaultId;
		if (!Number.isInteger(c.dmrId) || c.dmrId < 0 || c.dmrId > UNIT_MAX || !Number.isInteger(effectiveId) || effectiveId < 0 || effectiveId > UNIT_MAX)
			problem.err("dmrId", "range", { min: 0, max: UNIT_MAX });
		if (c.tagTx && p.talkgroup === 0) problem.err("talkgroup", "p25_tx_identity");
		if (c.tagTx && effectiveId === 0) problem.err("dmrId", "p25_tx_identity");
		if (p.rxNac === NAC_REPEAT_ANY) problem.err("rxNac", "p25_nac_repeat");
		if (p.txNac === NAC_ANY || p.txNac === NAC_REPEAT_ANY) problem.err("txNac", "p25_nac_any_tx");
	},
	settings: {
		key: "p25",
		decode: decodeUnit,
		encode: (s, prev) => {
			if (!s.unitId) return null;
			const v = grow(prev, 4);
			put32(v, 0, s.unitId);
			return v;
		},
		fields: [{ key: "unitId", label: "editor.p25.unit_id", type: "int", min: 0, max: UNIT_MAX, blank: 0, help: "editor.p25.unit_id_help" }],
		validate(s, problem) {
			if (!Number.isInteger(s.unitId) || s.unitId < 0 || s.unitId > UNIT_MAX) problem.err("unitId", "range", { min: 0, max: UNIT_MAX });
			if (s.unitId > UNIT_WARN) problem.warn("unitId", "p25_unit_long", { max: UNIT_WARN });
		},
	},
};

// --- Trunked system (3) ---

export function decodeTsys(b) {
	const w = b && b.length >= 3 ? u24(b, 0) : 0;
	const s = u16(b, 3);
	return {
		wacn: w === WACN_ANY ? null : w & 0xFFFFF,
		sysid: s === SYSID_ANY ? null : s & 0x0FFF,
		ccNac: (() => {
			const n = nacField(u16(b, 5), NAC_ANY);
			return n === NAC_ANY ? null : n;
		})(),
		skipEnc: (u8(b, 7) & 1) !== 0,
		planOnly: (u8(b, 7) & 2) !== 0,
		holdS: u8(b, 8),
		roamDbm: s8(b, 9),roaming:!!(u8(b,10)&1),idenSet:u8(b,11),textServer:u32(b,12),dataAccess:u16(b,16),
	};
}

export function encodeTsys(s, prev = null) {
	const v = grow(prev, 18);
	put24(v, 0, s.wacn == null ? WACN_ANY : s.wacn & 0xFFFFF);
	put16(v, 3, s.sysid == null ? SYSID_ANY : s.sysid & 0x0FFF);
	put16(v, 5, s.ccNac == null ? 0 : NAC_SET | (s.ccNac & 0x0FFF));
	v[7] = (v[7] & ~3) | (s.skipEnc ? 1 : 0) | (s.planOnly ? 2 : 0);
	v[8] = s.holdS & 0xFF;
	v[9] = s.roamDbm & 0xFF;
 v[10]=(v[10]&~1)|(s.roaming?1:0);v[11]=s.idenSet??0;put32(v,12,s.textServer??0);put16(v,16,s.dataAccess??0);
	return v;
}

const optHex = (key, label, max, digits) => ({ key, label, type: "hex", min: 0, max, digits, any: true, format: (v) => v.toString(16).toUpperCase().padStart(digits, "0") });
const byteOrUnknown = (key, label) => ({ key, label, type: "int", min: 0, max: 254, any: true });

export const p25System = {
	id: 3,
	feature: "P25_TRUNK",
	idLen: 5,
	defaultTx: false,	// a new system is listen only: no firmware transmits on one yet
	newFields: () => ({ wacn: null, sysid: null, ccNac: null, skipEnc: false, planOnly: false, holdS: 0, roamDbm: 0,roaming:false,idenSet:0,textServer:0,dataAccess:0 }),
	decode: decodeTsys,
	encode: encodeTsys,
	identity: (s) => `WACN ${s.wacn == null ? "*" : s.wacn.toString(16).toUpperCase()} · SYS ${s.sysid == null ? "*" : s.sysid.toString(16).toUpperCase()}`,
	fields: (model={}) => [
		{ ...optHex("wacn", "editor.p25.wacn", 0xFFFFF, 5), help: "editor.p25.any_help" },
		optHex("sysid", "editor.p25.sysid", 0xFFF, 3),
		{...optHex("ccNac", "editor.p25.cc_nac", 0xFFF, 3),feature:"P25_CC_NAC"},
		{ key: "skipEnc", feature:"P25_SKIP_ENC", label: "editor.p25.skip_enc", type: "bool" },
		{ key: "planOnly", label: "editor.p25.plan_only", type: "bool", advanced: true },
		{ key: "holdS", feature:"P25_HOLD", label: "editor.p25.hold", type: "int", min: 0, max: 255, advanced: true },
		{ key: "roamDbm", feature:"P25_ROAM_THRESHOLD", label: "editor.p25.roam_dbm", type: "int", min: -128, max: 127, advanced: true },
 {key:"roaming",label:"editor.p25.roaming",type:"bool"},
 {key:"idenSet",label:"editor.p25.iden_set",type:"select",options:(p={})=>[[0,"Default"],...(model.idenSets??[]).map(r=>[r.number,r.name]),...(p.idenSet&&!(model.idenSets??[]).some(r=>r.number===p.idenSet)?[[p.idenSet,`#${p.idenSet} (missing)`]]:[])]},
 {key:"textServer",label:"editor.p25.text_server",type:"ipv4",blank:0},
 {key:"dataAccess",label:"editor.p25.data_access",type:"hex",min:0,max:65535,digits:4,blank:0},
	],
	classes: [
		{
			cls: 1, name: "sites", group: true, groupLabel: "editor.p25.site_no", groupMax: 254,
			newEntry: (list) => ({ group: Math.min(254, list.reduce((n, e) => Math.max(n, e.group + 1), 0)), rfss: null, site: null,name:"",nac:null }),
			decode: (body) => ({ rfss: u8(body, 0) === P25_UNKNOWN || !body.length ? null : body[0], site: u8(body, 1) === P25_UNKNOWN || body.length < 2 ? null : body[1],name:body.length>=20?getName(body,2,16):"",nac:body.length>=20&&(u16(body,18)&NAC_SET)?u16(body,18)&0xFFF:null }),
			encode: (e, body) => {
				const v = grow(body, 20);
				v[0] = e.rfss ?? P25_UNKNOWN;
				v[1] = e.site ?? P25_UNKNOWN;putName(v,2,16,e.name??"");put16(v,18,e.nac==null?0:NAC_SET|e.nac);
				return v;
			},
			fields: [{key:"name",label:"editor.col.name",type:"text"},byteOrUnknown("rfss", "editor.p25.rfss"), byteOrUnknown("site", "editor.p25.site"),{...nacFieldDef("nac","editor.p25.site_nac"),blank:null}],
		},
		{
			cls: 0, name: "control", group: true, groupLabel: "editor.p25.site_no", groupMax: 254, control: true,
			newEntry: (list) => ({ group: list[list.length - 1]?.group ?? 0, control: true, iden: 0, chanNo: 0, rxHz: 0, txHz: 0 }),
			decode: (body) => ({ iden: u16(body, 0) >> 12, chanNo: u16(body, 0) & 0x0FFF }),
			encode: (e, body) => {
				const v = grow(body, 10);
				put16(v, 0, ((e.iden & 15) << 12) | (e.chanNo & 0x0FFF));
				return v;
			},
			fields: [
				{ key: "iden", label: "editor.p25.iden", type: "int", min: 0, max: 15 },
				{ key: "chanNo", label: "editor.p25.chan_no", type: "int", min: 0, max: 4095 },
				{ key: "rxHz", label: "editor.col.rx", type: "freq" },
				{ key: "txHz", label: "editor.col.tx", type: "freq", zero: true },
			],
		},
		{
			cls: 2, name: "plan", group: true, groupLabel: "editor.p25.iden", groupMax: 15,
			newEntry: (list) => ({ group: Math.min(15, list.reduce((n, e) => Math.max(n, e.group + 1), 0)), baseHz: 0, spacingHz: 12500, txOffsetHz: 0, bwHz: 12500, tdma: false, slots: 2 }),
			decode: (b) => ({
				baseHz: u32(b, 0), spacingHz: u32(b, 4), txOffsetHz: u32(b, 8) | 0, bwHz: u32(b, 12), tdma: u8(b, 16) === 1,
				slots: u8(b, 16) === 1 ? u8(b, 17) || 2 : 2,
			}),
			encode: (e, body) => {
				const v = grow(body, 18);
				put32(v, 0, e.baseHz);
				put32(v, 4, e.spacingHz);
				put32(v, 8, e.txOffsetHz >>> 0);
				put32(v, 12, e.bwHz);
				v[16] = e.tdma ? 1 : 0;
				v[17] = e.tdma ? e.slots & 0xFF : 0;
				return v;
			},
			fields: [
				{ key: "baseHz", label: "editor.p25.base", type: "freq",quantum:5 },
				{ key: "spacingHz", label: "editor.p25.spacing", type: "int", min: 1, max: 1000000 },
				{ key: "txOffsetHz", label: "editor.p25.tx_offset", type: "int", min: -2147483648, max: 2147483647 },
				{ key: "bwHz", label: "editor.p25.bw", type: "int", min: 0, max: 1000000 },
				{ key: "tdma", label: "editor.p25.tdma", type: "bool" },
				{ key: "slots", label: "editor.p25.slots", type: "int", min: 1, max: 8 },
			],
		},
	],
	secret: null,
	ownedKeys: () => [],
	validate(s, f, entries, problem,{model,limits}={}) {
		if(s.ownId>UNIT_MAX)problem.err("ownId","range",{min:0,max:UNIT_MAX});
  if(!Number.isInteger(f.idenSet)||f.idenSet<0||f.idenSet>8)problem.err('idenSet','range',{min:0,max:8});
  else if(f.idenSet&&model&&!(model.idenSets??[]).some(r=>r.number===f.idenSet))problem.err('idenSet','dangling',{number:f.idenSet});
        const sites = entries.filter((e) => e.cls === 1);
  if(limits?.sites!=null&&model?.systems.find(x=>x.type===3)===s){const count=model.systems.filter(x=>x.type===3).reduce((n,x)=>n+x.entries.filter(e=>e.cls===1).length,0);if(count>limits.sites)problem.err('entries','p25_site_capacity',{max:limits.sites,count});}
  if(limits?.controlsPerSite!=null){const groups=new Set(entries.filter(e=>e.cls===0&&e.control).map(e=>e.group));for(const group of groups){const count=entries.filter(e=>e.cls===0&&e.control&&e.group===group).length;if(count>limits.controlsPerSite)problem.err('entries','p25_control_capacity',{max:limits.controlsPerSite,count,group});}}
		const groups = new Set(sites.map((e) => e.group));
		if (groups.size !== sites.length) problem.err("entries", "p25_site_twice");
		const plan = entries.filter((e) => e.cls === 2);
		if (new Set(plan.map((e) => e.group)).size !== plan.length) problem.err("entries", "p25_iden_twice");
		for (const e of entries.filter((x) => x.cls === 0 && x.control)) {
			if (sites.length && !groups.has(e.group)) problem.warn("entries", "p25_ctl_no_site", { site: e.group });
		}
	},
};

export const p25TrunkKind = {
	id: 3,
	feature: "P25_TRUNK",
 channelDefaults:{bw:12.5},
	systemType: 3,
	contacts: true,
 acceptContact:p25Contact,
	ownFreqs: false,
	defaultTx: false,
	fallback: true,
	recordFields: ["contact"],
	flags: { noFallback: 0x10 },
	newParams: () => ({ followAll: false,...optionsDefaults() }),
	decode: (b) => ({ followAll: (u8(b, 0) & 1) !== 0,...decodeOptions(b,1) }),
	encode: (p, prev) => {
		const v = grow(prev, 5);
		v[0] = (v[0] & ~1) | (p.followAll ? 1 : 0);encodeOptions({...p,mixed:false},v,1);
		return v;
	},
	fields: () => [{ key: "followAll", label: "editor.p25.follow_all", type: "bool" },...optionsFields()],
	validate: (c, p, problem) => {tgRange(c,p,problem);validateOptions(p,problem);},
};
