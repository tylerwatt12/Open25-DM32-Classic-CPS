// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The RadioFoundry Authors
// Codeplug tables as CSV (RFC 4180): one file per table, a header row of fixed English names, references by name
// (a channel's contact, a zone's channels). Import matches rows to the records already there by number, then by
// name, so references from other tables follow an edited record; records missing from the file are removed and
// their references cleared. A file may hold only some columns: the others keep their values. Problems come back as
// {row, column, code, params}, and the page words them.

import { parseFreq, parseTone, mhz } from "./fields.js";
import { LIMITS, POWER_NAMES, CALL_TYPES, validDtmf } from "./records.js";
import { newChannel, newContact, remove, assignNumbers } from "./model.js";
import {KINDS,kindsFor} from "./modes.js";
const CSV_KINDS=[...KINDS,kindsFor("classic-r14").find(k=>k.id===4)];
import {setKind} from "./channelmodes.js";

// --- RFC 4180 ---

// Rows of fields. The delimiter is the first of , ; or tab found outside quotes in the first line (Excel writes ;
// in locales with a decimal comma). A leading byte order mark is dropped; blank lines are skipped.
export function parse(text) {
	text = String(text).replace(/^﻿/, "");
	const delim = sniff(text);
	const rows = [];
	let row = [], field = "", quoted = false, i = 0, any = false;
	const endField = () => {
		row.push(field);
		field = "";
	};
	const endRow = () => {
		endField();
		if (row.length > 1 || row[0] !== "" || any) rows.push(row);
		row = [];
		any = false;
	};
	while (i < text.length) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
		} else if (c === '"' && field === "") {
			quoted = true;
			any = true;
		} else if (c === delim) endField();
		else if (c === "\r" || c === "\n") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			endRow();
		} else field += c;
		i++;
	}
	if (field !== "" || row.length || any) endRow();
	return rows;
}

function sniff(text) {
	let quoted = false;
	for (const c of text) {
		if (c === '"') quoted = !quoted;
		else if (!quoted && (c === "," || c === ";" || c === "\t")) return c;
		else if (!quoted && (c === "\n" || c === "\r")) break;
	}
	return ",";
}

export function stringify(rows) {
	const cell = (v) => {
		const s = v == null ? "" : String(v);
		return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

// --- Values ---

const YES = new Set(["yes", "y", "true", "1", "on", "x"]);
const NO = new Set(["no", "n", "false", "0", "off", ""]);

class Bad extends Error {
	constructor(code, params = {}) {
		super(code);
		Object.assign(this, { code, params });
	}
}

const asBool = (s) => {
	const v = s.trim().toLowerCase();
	if (YES.has(v)) return true;
	if (NO.has(v)) return false;
	throw new Bad("bad_bool");
};
const yesNo = (v) => (v ? "Yes" : "No");

const asInt = (lo, hi, blank) => (s) => {
	s = s.trim();
	if (s === "" && blank !== undefined) return blank;
	const n = Number(s);
	if (!Number.isInteger(n) || n < lo || n > hi) throw new Bad("range", { min: lo, max: hi });
	return n;
};

const asNum = (lo, hi) => (s) => {
	s = s.trim().replace(",", ".");
	if (s === "") return 0;
	const n = Number(s);
	if (!Number.isFinite(n) || n < lo || n > hi) throw new Bad("range", { min: lo, max: hi });
	return n;
};

const asName = (max, required = true) => (s) => {
	s = s.trim();
	if (required && !s) throw new Bad("no_name");
	if (s.length > max) throw new Bad("too_long", { max });
	return s;
};

const asFreq = (blank) => (s) => {
	if (blank !== undefined && !s.trim()) return blank;
	const hz = parseFreq(s.trim().replace(",", "."));
	if (hz === null) throw new Bad("bad_freq");
	return hz;
};

const asTone = (s) => {
	const v = parseTone(s.trim().replace(",", "."));
	if (v === null) throw new Bad("bad_tone");
	return v;
};

const asId = (s) => {
	s = s.trim();
	if (s === "" || s === "0") return 0;
	const n = Number(s);
	if (!Number.isInteger(n) || n < 1 || n > 0xFFFFFF) throw new Bad("id_range");
	return n;
};

// One of a few words (case-insensitive), or a number in range; a blank cell is the default
const asWord = (words, dflt, lo, hi) => (s) => {
	const v = s.trim().toLowerCase();
	if (!v) return dflt;
	for (const [k, w] of Object.entries(words)) if (w.toLowerCase() === v) return isNaN(Number(k)) ? k : Number(k);
	if (lo !== undefined && /^\d+$/.test(v) && Number(v) >= lo && Number(v) <= hi) return Number(v);
	throw new Bad("bad_value", { value: s.trim(), allowed: Object.values(words).join(", ") });
};

const POWER = { ...POWER_NAMES };
const powerText = (n) => POWER_NAMES[n] || String(n);
const MODES = { fm: "FM", dmr: "DMR" };
const TYPES = Object.fromEntries(CALL_TYPES.map((k) => [k, k[0].toUpperCase() + k.slice(1)]));

// --- References by name ---

// A record's name in a file: its name, or "#n" when the name can't stand for it (another record has it, or it holds
// the member list separator or looks like "#n" itself)
function refText(x, list) {
	if (x == null) return "";
	if (typeof x === "number") return `#${x}`;
	const plain = !x.name.includes(SEP) && !/^#\d+$/.test(x.name.trim()) && list.filter((y) => y.name === x.name).length === 1;
	return plain || !x.number ? x.name : `#${x.number}`;
}

function findRef(text, list) {
	const s = text.trim();
	if (!s) return null;
	const num = /^#(\d+)$/.exec(s);
	if (num) {
		const n = Number(num[1]);
		const hit = list.find((x) => x.number === n);
		if (!hit) throw new Bad("unknown_ref", { name: s });
		return hit;
	}
	const hits = list.filter((x) => x.name === s);
	if (hits.length === 1) return hits[0];
	const loose = hits.length ? hits : list.filter((x) => x.name.toLowerCase() === s.toLowerCase());
	if (loose.length === 1) return loose[0];
	throw new Bad(loose.length ? "ambiguous_ref" : "unknown_ref", { name: s });
}

const SEP = "|";

function refsText(list, pool) {
	return list.map((x) => refText(x, pool)).join(SEP);
}

// Member lists: problems for the names that don't resolve, the rest kept
function findRefs(text, pool, max, bad) {
	const out = [];
	for (const part of text.split(SEP)) {
		if (!part.trim()) continue;
		try {
			out.push(findRef(part, pool));
		} catch (e) {
			bad(e);
		}
	}
	if (out.length > max) {
		bad(new Bad("too_many", { max, count: out.length }));
		out.length = max;
	}
	return out;
}

// --- Tables ---

// A column: header, other names a file may use, get(record, model) -> text, set(record, text, model, bad)
const c = (header, key, put, get = (r) => r[key] ?? "", aliases = []) => ({
	header, aliases, key,
	get,
	set: (r, s) => {
		r[key] = put(s);
	},
});

const ref = (header, key, table, aliases = []) => ({
	header, aliases, key,
	get: (r, m) => refText(r[key], m[table]),
	set: (r, s, m) => {
		r[key] = findRef(s, m[table]);
	},
});

const NUMBER = (max) => ({ header: "Number", aliases: ["No", "#", "Index"], key: "number", get: (r) => r.number ?? "", set: (r, s) => {
	r.number = asInt(1, max, null)(s);
} });

export const TABLES = {
	contacts: {
		file: "contacts.csv",
		columns: [
			NUMBER(LIMITS.contacts),
			c("Name", "name", asName(LIMITS.name), undefined, ["Contact Name", "Contact"]),
			c("ID", "id", asInt(1, 0xFFFFFF), undefined, ["DMR ID", "Call ID", "Radio ID", "TG", "Talkgroup"]),
			c("Call Type", "type", asWord(TYPES, "group"), (r) => TYPES[r.type], ["Type"]),
			c("Timeslot", "timeslot", asInt(0, 2, 0), (r) => r.timeslot || "", ["TS", "Timeslot Override"]),
		],
		create: () => newContact(),
		required: ["name", "id"],
	},
	rxLists: {
		file: "rx-group-lists.csv",
		columns: [
			NUMBER(LIMITS.rxLists),
			c("Name", "name", asName(LIMITS.name), undefined, ["Group List", "RX Group List"]),
			{ header: "Contacts", aliases: ["Members", "Talkgroups"], key: "contacts", get: (r, m) => refsText(r.contacts, m.contacts),
				set: (r, s, m, bad) => {
					r.contacts = findRefs(s, m.contacts, LIMITS.rxListContacts, bad);
				} },
		],
		create: () => ({ number: null, name: "", contacts: [] }),
		required: ["name", "contacts"],
	},
	dtmfContacts: {
		file: "dtmf-contacts.csv",
		columns: [
			NUMBER(LIMITS.dtmfContacts),
			c("Name", "name", asName(LIMITS.name)),
			c("Code", "code", (s) => {
				s = s.trim().toUpperCase();
				if (!validDtmf(s)) throw new Bad("bad_dtmf");
				return s;
			}, undefined, ["DTMF", "DTMF Code", "Number String"]),
		],
		create: () => ({ number: null, name: "", code: "" }),
		required: ["name", "code"],
	},
	aprs: {
		file: "aprs.csv",
		columns: [
			NUMBER(LIMITS.aprs),
			c("Name", "name", asName(LIMITS.aprsName)),
			c("SSID", "ssid", asInt(0, 15, 0)),
			c("Path 1", "path1", path, undefined, ["Path1"]),
			c("Path 2", "path2", path, undefined, ["Path2"]),
			c("Symbol Table", "symTable", (s) => char(s, "/")),
			c("Symbol", "symCode", (s) => char(s, ">"), undefined, ["Symbol Code"]),
			c("Comment", "comment", asName(LIMITS.aprsComment, false)),
			c("TX Frequency (MHz)", "txHz", asFreq(0), (r) => (r.txHz ? mhz(r.txHz) : ""), ["TX Frequency", "Frequency"]),
			c("300 Baud", "baud300", asBool, (r) => yesNo(r.baud300)),
			c("Fixed Position", "useFixed", asBool, (r) => yesNo(r.useFixed), ["Use Fixed Position"]),
			c("Latitude", "lat", asNum(-90, 90), (r) => coordText(r.lat)),
			c("Longitude", "lon", asNum(-180, 180), (r) => coordText(r.lon)),
			c("QSY", "qsy", asBool, (r) => yesNo(r.qsy)),
			c("Silent", "silent", asBool, (r) => yesNo(r.silent)),
			c("Ambiguity", "ambiguity", asInt(0, 4, 0), undefined, ["Position Ambiguity"]),
		],
		create: () => ({
			number: null, name: "", ssid: 0, lat: 0, lon: 0, path1: "", path2: "", symTable: "/", symCode: ">", comment: "",
			txHz: 0, baud300: false, useFixed: false, qsy: false, silent: false, ambiguity: 0,
		}),
		required: ["name"],
	},
	channels: {
		file: "channels.csv",
		columns: [
			NUMBER(LIMITS.channels),
			c("Name", "name", asName(LIMITS.name), undefined, ["Channel Name", "Channel"]),
			{header:"Mode",aliases:["Channel Mode","Channel Type","Type"],key:"mode",get:r=>r.kind?CSV_KINDS.find(k=>k.id===r.kind)?.short??`Kind ${r.kind}`:MODES[r.mode],set:(r,s,m)=>{const kind=CSV_KINDS.find(k=>k.short.toLowerCase()===s.trim().toLowerCase());if(kind)setKind(m,r,kind.id);else setKind(m,r,0,asWord(MODES,"fm")(s));}},
            ...CSV_KINDS.flatMap(kind=>kind.module.fields().map(spec=>({
                header:(kind.id===2?({rxNac:'RX NAC (hex)',txNac:'TX NAC (hex)',talkgroup:'Talkgroup override'})[spec.key]:null)??`${kind.short} ${spec.key.replace(/([A-Z])/g,' $1')}`,
                key:`k${kind.id}.${spec.key}`,aliases:[],
                get:r=>{if(r.kind!==kind.id)return '';const v=r.params?.[spec.key];if(v==null)return '';return spec.type==='hex'?v.toString(16).toUpperCase().padStart(spec.digits??1,'0'):spec.type==='bool'?yesNo(v):spec.type==='select'?spec.options().find(([n])=>n===v)?.[1]??v:String(v)},
                set:(r,s,m)=>{if(r.kind!==kind.id)return;if(m.profile==='classic-r14'&&kind.id===2&&!['squelch','rxNac','txNac'].includes(spec.key)){if(s.trim())throw new Bad('native_migration_required');return;}let v;if(spec.type==='bool')v=asBool(s);else if(spec.type==='select'){const found=spec.options().find(([n,label])=>String(label).toLowerCase()===s.trim().toLowerCase()||String(n)===s.trim());if(!found)throw new Bad('bad_value',{value:s,allowed:spec.options().map(x=>x[1]).join(', ')});v=found[0];}else if(!s.trim())v=Object.hasOwn(spec,'blank')?spec.blank:spec.type==='hex'||spec.type==='int'?0:'';else if(spec.type==='hex'){if(!/^(?:0x|\$)?[0-9A-F]{1,3}$/i.test(s.trim()))throw new Bad('bad_value',{value:s,allowed:'hexadecimal NAC'});v=parseInt(s.trim().replace(/^(0x|\$)/i,''),16);}else if(spec.type==='int')v=asInt(spec.min,spec.max,spec.blank)(s);else v=s;if(spec.exclude?.includes(v))throw new Bad('bad_value',{value:s,allowed:'a non-reserved value'});r.params={...r.params,[spec.key]:v};},
            }))),
            {header:'Channel Radio ID',aliases:[],key:'p25Id',get:r=>r.kind===2?r.dmrId||'':'',set:(r,s)=>{if(r.kind===2)r.dmrId=asInt(0,0xFFFFFE,0)(s)}},
			c("RX Frequency (MHz)", "rxHz", asFreq(), (r) => mhz(r.rxHz), ["RX Frequency", "RX Freq", "Receive Frequency", "RX"]),
			c("TX Frequency (MHz)", "txHz", asFreq(), (r) => mhz(r.txHz), ["TX Frequency", "TX Freq", "Transmit Frequency", "TX"]),
			c("Power", "power", asWord(POWER, 0, 0, 10), (r) => powerText(r.power), ["TX Power"]),
			c("Timeout (s)", "tot", asInt(0, 3825, 0), undefined, ["Timeout", "TOT"]),
			c("Bandwidth (kHz)", "bw", (s) => {
				const v = s.trim().replace(",", ".").replace(/\s*khz$/i, "");
				if (v === "" || v === "12.5") return 12.5;
				if (v === "25") return 25;
				throw new Bad("bad_value", { value: s.trim(), allowed: "12.5, 25" });
			}, undefined, ["Bandwidth", "BW"]),
			c("RX Tone", "rxTone", asTone, undefined, ["RX CTCSS/DCS", "Decode", "RX CTCSS"]),
			c("TX Tone", "txTone", asTone, undefined, ["TX CTCSS/DCS", "Encode", "TX CTCSS"]),
			c("Squelch", "squelch", asInt(0, 21, 0)),
			c("Color Code", "colorCode", asInt(0, 15, 1), undefined, ["CC", "Colour Code"]),
			c("Timeslot", "timeslot", asInt(1, 2, 1), undefined, ["TS", "Time Slot", "Slot"]),
			ref("TX Contact", "contact", "contacts", ["Contact"]),
			ref("RX Group List", "rxList", "rxLists", ["Group List", "RX List"]),
			ref("APRS", "aprs", "aprs", ["APRS Configuration"]),
			c("DMR ID", "dmrId", asId, (r) => r.dmrId || "", ["Channel DMR ID"]),
			{header:"RX Only",key:"rxOnly",aliases:[],get:r=>yesNo(r.kind?!r.tagTx:r.rxOnly),set:(r,s)=>{const on=asBool(s);if(r.kind){r.tagTx=!on;r.rxOnly=true;}else r.rxOnly=on;}},
			c("All Skip", "allSkip", asBool, (r) => yesNo(r.allSkip), ["Scan Skip"]),
			c("Zone Skip", "zoneSkip", asBool, (r) => yesNo(r.zoneSkip)),
			c("VOX", "vox", asBool, (r) => yesNo(r.vox)),
			c("Tone Burst", "toneBurst", asBool, (r) => yesNo(r.toneBurst), ["1750 Hz"]),
			c("No Beep", "noBeep", asBool, (r) => yesNo(r.noBeep)),
			c("No Eco", "noEco", asBool, (r) => yesNo(r.noEco)),
			c("DMO", "dmo", asBool, (r) => yesNo(r.dmo)),
			c("Roaming", "roam", asBool, (r) => yesNo(r.roam)),
			c("Talker Alias TS1", "aliasTs1", asInt(0, 3, 0)),
			c("Talker Alias TS2", "aliasTs2", asInt(0, 3, 0)),
			c("Use Location", "useLocation", asBool, (r) => yesNo(r.useLocation)),
			c("Latitude", "lat", asNum(-90, 90), (r) => coordText(r.lat)),
			c("Longitude", "lon", asNum(-180, 180), (r) => coordText(r.lon)),
			c("SFR", "sfr", asBool, (r) => yesNo(r.sfr)),
			c("SFR A", "sfrA", asInt(0, 255, 0)),
			c("SFR B", "sfrB", asInt(0, 255, 0)),
		],
		create: () => newChannel(),
		required: ["name", "rxHz"],
	},
	zones: {
		file: "zones.csv",
		columns: [
			c("Name", "name", asName(LIMITS.name), undefined, ["Zone Name", "Zone"]),
			{ header: "Channels", aliases: ["Members", "Channel Members"], key: "channels", get: (r, m) => refsText(r.channels, m.channels),
				set: (r, s, m, bad) => {
					r.channels = findRefs(s, m.channels, LIMITS.zoneChannels, bad);
				} },
		],
		create: () => ({ name: "", channels: [], slot: null }),
		required: ["name", "channels"],
	},
};

// Import order for several tables at once: what a table refers to comes first
export const ORDER = ["contacts", "rxLists", "dtmfContacts", "aprs", "channels", "zones"];

function path(s) {
	s = s.trim().toUpperCase();
	if (s && !/^[A-Z0-9]{1,6}(-([0-9]|1[0-5]))?$/.test(s)) throw new Bad("bad_path");
	return s;
}

function char(s, dflt) {
	const v = s.trim();
	if (!v) return dflt;
	if (v.length !== 1 || v.charCodeAt(0) > 0x7E) throw new Bad("bad_value", { value: v, allowed: "one character" });
	return v;
}

function coordText(x) {
	return x ? Number(x).toFixed(4).replace(/\.?0+$/, "") : "";
}

// --- Export ---

export function exportTable(m, table) {
 if(table==="channels"&&m.channels.some(c=>c.kind&&((CSV_KINDS.find(k=>k.id===c.kind)?.module.systemType&&!CSV_KINDS.find(k=>k.id===c.kind)?.module.optionalSystem)||c.system)))throw new Bad("mode_system_export");
	const spec = TABLES[table];
	return stringify([spec.columns.map((x) => x.header), ...m[table].map((r) => spec.columns.map((x) => x.get(r, m)))]);
}

// --- Import ---

const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9#]/g, "");

// The columns a header row names: [{column, index}], plus the headers not recognized
function mapHeader(spec, head) {
	const found = [], unknown = [];
	const used = new Set();
	head.forEach((hname, index) => {
		const n = norm(hname);
		const col = spec.columns.find((x) => !used.has(x) && [x.header, ...x.aliases].some((a) => norm(a) === n));
		if (col) {
			used.add(col);
			found.push({ col, index });
		} else if (n) unknown.push(hname.trim());
	});
	return { found, unknown };
}

// Which table a header row is for: the one whose columns it names most, among those whose required columns it has
export function detect(text) {
	const head = parse(text)[0] || [];
	let best = null, score = 0;
	for (const [table, spec] of Object.entries(TABLES)) {
		const { found } = mapHeader(spec, head);
		const keys = new Set(found.map((f) => f.col.key));
		if (!spec.required.every((k) => keys.has(k))) continue;
		if (found.length > score) {
			best = table;
			score = found.length;
		}
	}
	return best;
}

// Import one table's CSV into m (changed in place). Returns {table, added, updated, removed, problems, unknown}
// or throws Bad("not_a_table") when no table's columns match.
export function importTable(m, text, table = detect(text)) {
	if (!table) throw new Bad("not_a_table");
	const spec = TABLES[table];
	const rows = parse(text);
	const { found, unknown } = mapHeader(spec, rows[0] || []);
	const problems = [];
	const keys = new Set(found.map((f) => f.col.key));
	const hasNumber = keys.has("number");
	const old = m[table];
	const taken = new Set();
	const out = [];
	let added = 0, updated = 0;
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (row.every((v) => !v.trim())) continue;
		const cell = (key) => {
			const f = found.find((x) => x.col.key === key);
			return f ? row[f.index] ?? "" : undefined;
		};
		// the record this row stands for: same number, else same name, else a new one
		let rec = null;
		const nText = hasNumber ? cell("number").trim() : "";
		if (nText) rec = old.find((x) => !taken.has(x) && String(x.number) === nText) || null;
		const nameText = (cell("name") ?? "").trim();
		if (!rec && nameText) rec = old.find((x) => !taken.has(x) && x.name === nameText) || null;
		const fresh = !rec;
		if (fresh) rec = spec.create();
		else taken.add(rec);
		const work = { ...rec };
		let skip = false;
		for (const { col, index } of found) {
			try {
				col.set(work, row[index] ?? "", m, (e) => problems.push({ row: i + 1, column: col.header, code: e.code, params: e.params }));
			} catch (e) {
				if (!(e instanceof Bad)) throw e;
				// a new record without a usable required value (name, frequency, ID) would only be a default; skip it
				const lost = fresh && spec.required.includes(col.key);
				problems.push({ row: i + 1, column: col.header, code: e.code, params: e.params, skipped: lost });
				skip ||= lost;
			}
		}
		if (!skip && !work.name) {
			problems.push({ row: i + 1, column: "Name", code: "no_name", params: {}, skipped: true });
			skip = true;
		}
		if (skip) continue;
		Object.assign(rec, work);
		if (fresh) added++;
		else updated++;
		out.push(rec);
	}
	const gone = old.filter((x) => !taken.has(x));
	remove(m, table, gone);
	m[table] = out;
	// rows the file numbered twice keep the first; the rest get free numbers
	if (table !== "zones") assignNumbers(out, LIMITS[table]);
	if (out.length > LIMITS[table]) problems.push({ row: 0, column: "", code: "too_many", params: { max: LIMITS[table], count: out.length } });
	return { table, added, updated, removed: gone.length, problems, unknown };
}

// Several tables (the .zip export): [{name, text}] in dependency order. Files that match no table are listed.
export function importAll(m, files) {
	const results = [], skipped = [];
	const tagged = files.map((f) => ({ ...f, table: detect(f.text) }));
	for (const table of ORDER) for (const f of tagged.filter((x) => x.table === table)) results.push({ name: f.name, ...importTable(m, f.text, table) });
	for (const f of tagged) if (!f.table) skipped.push(f.name);
	return { results, skipped };
}

export function exportAll(m) {
	return ORDER.map((table) => ({ name: TABLES[table].file, data: "﻿" + exportTable(m, table) }));
}

export { Bad as CsvError };
