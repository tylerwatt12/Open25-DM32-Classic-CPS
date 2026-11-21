# Classic programming profiles

## Native r14

Profile `classic-r14` matches the native firmware schema
`rfkv-p25-contact-v1`. The RFKV root remains E000, with a single 4 KB settings
sector and a zero continuation pointer. P25 conventional parameters are the
native five-byte squelch/RX NAC/TX NAC prefix; targets are standard contact
references in the channel record. Numeric TX NAC values retain their explicit
presence, including zero and a value equal to RX; blank inherits RX, or 293 for
wildcard RX. Unknown parameter tails and unrelated records remain intact.

The actual C reader is authoritative. Native transport refuses explicit-TG
legacy extensions, continuation chains and malformed/newer settings before any
write. It checks the image again after radio/file settings merging. Profile
selection does not convert stored programming. Only Flasher v3 migrates an
identified r13 image with verified recovery; the radio and CPS have no converter.

The native profile registers upstream NXDN kind 4 for rate/RAN/contact editing.
Existing key/system records remain preserved; key editing is outside this CPS.
The native editor does not apply the earlier RX-only defaults or TX confirmation.
Saved RX-only bits and protocol tags remain unchanged unless explicitly edited;
firmware band admission remains the final authority.

The browser draft database is unchanged. Drafts predating profile metadata use
`classic-r13`; new drafts save the selected profile separately from codeplug
bytes. BIN has no invented schema marker. Opening a file uses the selected
profile; an incompatible legacy file remains inspectable/saveable and is blocked
from native writes.

## Legacy r9–r13 RFKV programming format

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

The existing common browser model, on-disk legacy BIN and legacy radio programming retain this format. Native r14 uses the profile above.

The legacy Classic profile accepts group targets 1–65535 and all-call; active private,
oversized or missing contact targets fail write validation. An explicit direct
talkgroup overrides a stored contact without deleting that reference. A saved
RX list can supply the default TX contact; it does not filter P25 reception, so
its RX-list editor is hidden. Stored DMR talkaround does not implement P25
talkaround and its control is hidden; incompatible split/trunk flags fail write
validation. Existing bytes and references remain preserved.
P25 Preferred retains and exposes its analog receive tone.
