# Classic r9 RFKV programming format

The base format and registry are RadioFoundry's `9e1f7209` specifications and
implementation. New records are the normal upstream base channel plus the
registered mode tag; P25 no longer uses an A5 base-record discriminator.
Retired Classic A5/D/E and other noncanonical base-record discriminators are
rejected. No legacy-format reader, writer or conversion is retained.

The upstream five-byte conventional P25 parameter prefix is unchanged. Unset TX
NAC is represented as `null` in the editing model; every explicit numeric NAC,
including 000 or a value equal to RX, retains bit 15 in the stored field.
Unknown RFKV mode records and unowned parameter tails are kept.

The following appended fields preserve existing programming that the upstream
initial P25 module does not yet represent. They belong to that mode module,
not to a separate record model:

| Record | Appended bytes |
| --- | --- |
| Conventional P25 parameters | At 5: flags; at 6: LE16 direct talkgroup; at 8: device-local key slot reference. |
| Trunked P25 parameters | At 1: flags; at 2: LE16 direct talkgroup; at 4: device-local key slot reference. |
| Trunked system block | At 10: roaming flag bit 0; at 11: saved plan reference; at 12: LE32 text-server IPv4; at 16: LE16 data-access flags. Standard prefix byte 7 bit 1 owns the manual-plan setting. |
| P25 site entry body | After RFSS/site: 16-byte name at 2; LE16 NAC at 18 with bit 15 denoting an explicit value. |

Channel-option bits are direct TG 1, mixed FM receive 2, Secure 4, Secure Only 8,
and Ignore Clear RX 16. Direct TG is optional; absent uses the standard contact
reference. This retains full channel capacity without allocating an unrelated
DMR contact for each P25 channel. Key values and nonce state are not
codeplug programming; only an existing device-local slot reference is stored.
Unsupported edition options remain preserved but fail write validation.

These unreleased development-key assignments use upstream's development range
pending upstream allocation. The same RFKV owner reads and writes them:

| Keys | Known prefix |
| --- | --- |
| 8100–8107 | Saved bandplan: name16 and sixteen LE32 base/spacing/signed-offset rows (208 bytes). |
| 8200–820F | Named scan: name16, count1, talkback1, thirty-two LE16 channel references (82 bytes). |
| 8300–8343 | Zone slot: position1, scan-list reference1. |

Unknown bytes after these prefixes are preserved. Membership is owned by each
list; channel references resolve to the existing model's channel objects.

RFKV version-1 framing is retained. The existing header continuation field
links complete CRC-checked sectors. The primary remains at E000; two alternating
continuation banks occupy AF000–BEFFF and BF000–CEFFF in the combined image.
A chain contains the primary plus at most sixteen continuation sectors. Before
publishing a new primary, the transport writes and checks the destination
continuations; it leaves the old active bank untouched. Only the destination
chain is part of the write plan. A newer or unsupported chain is not erased.
The radio must report `codeplug=rfkv1` and `codeplug_chain=1` before this client
uses its programming interface.

Classic owns the common CPS source. Next's derived modules are refreshed and
verified with `web-installer/tools/sync_cps.py` and `cps/UPSTREAM-SHARED.json`.
The Next-only importer and programming authorization are owned by Next's CPS.
The browser model, on-disk BIN and radio programming all share this one format.

Storage support does not imply every upstream P25 system option is implemented
by Next's receiver. Next currently preserves the stored control-channel NAC,
Skip Encrypted, call hold and signal-threshold values, but does not consume
them. Its CPS hides those controls unless firmware advertises their individual
capabilities; other targets can continue to expose them through the same mode
metadata. The supported site NAC and system roaming controls remain separate.

Current P25 engines accept group targets 1–65535 and all-call; active private,
oversized or missing contact targets fail write validation. An explicit direct
talkgroup overrides a stored contact without deleting that reference. A saved
RX list can supply the default TX contact; it does not filter P25 reception, so
its RX-list editor is hidden. Stored DMR talkaround does not implement P25
talkaround and its control is hidden; incompatible split/trunk flags fail write
validation. Existing bytes and references remain preserved.
P25 Preferred retains and exposes its analog receive tone.

Next supplies its concrete limits to the existing validator: 8 systems (stored
references 1–8), 16 sites across systems, and 4 control channels per site. Named
bandplans and scans retain their existing bounds of 8 and 16. Larger canonical
files remain inspectable and saveable; write validation refuses overflow rather
than truncating it. The generic model's upstream capacity remains unchanged.
