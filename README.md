# Open25-DM32 Classic CPS

**Classic CPS supports Open25-DM32 Classic firmware R9 and newer.** These
versions use RFKV programming only. Update firmware and CPS together. Earlier
Classic programming files and browser drafts are unsupported;
create new programming after the update. This release has no legacy-format
reader, writer or automatic conversion path. Full-radio recovery remains a
separate flasher operation.

A standalone browser codeplug editor for **Open25-DM32 Classic** on the
Baofeng DM-32UV. Live at https://kd8zmm.com/open25-dm32/classic-cps/.
Next CPS remains separately hosted at `/open25-dm32/cps/`. Firmware installation
and recovery use [Flasher v3](https://kd8zmm.com/open25-dm32/v3/firmware.html).
The retired v1/v2 flasher entry URLs redirect to v3 and are not listed on the
tools homepage.

This edition uses RadioFoundry revision `9e1f7209` directly: safe base channel
records, mode/system records in RFKV and upstream raw CPS/CPS_FAST. Noncanonical
channel records are refused before they can be interpreted or programmed.
Standard upstream stock-device import and current CSV interchange remain
separate editing features; retired Open25 programming is not converted.
Continuation sectors use the upstream header continuation field and alternate
banks so existing 1024-channel programming fits. The settings root is written
last, after continuation integrity checks.

This repository owns the common editor/model/format code. Next’s copy is derived
by `web-installer/tools/sync_cps.py`; `--check` verifies exact source and derived
hashes in `cps/UPSTREAM-SHARED.json`. Next independently owns only its schema-5
file importer, device-local Programming authorization and branding. Its firmware
source is not copied into this repository. Unreleased extension assignments in
the upstream development-key range are documented with the firmware source;
they preserve existing scan lists, bandplans and zone links until upstream IDs
are assigned.

Adapted from RadioFoundry's MIT codeplug editor at the exact revision recorded
in `UPSTREAM.json`. Original MIT notices and author credits are retained.
This repository has its own history, assets, deployment and browser draft store;
it contains no Next CPS implementation.

## Programming

Use Classic r9 or later and desktop Chrome or Edge for radio read/write over
Web Serial. Turn the radio
on normally, close other applications using its port, and choose Read from Radio.
Read and save an original BIN before editing. This CPS accepts Classic firmware;
it refuses a Next or unrecognized firmware identity before programming.

FM and DMR retain the original editor's fields. Conventional P25 is available in
the Mode selector in the channel table or the pencil/edit form:

- **RX NAC**: hexadecimal `000`–`FFF`; `F7E` receives any NAC; `F7F` is reserved.
- **TX NAC**: `Same as RX` or an explicit hexadecimal NAC. `000` is a valid
  explicit NAC. `F7E` and `F7F` cannot be transmitted.
- **Talkgroup override**: decimal 1–65535 for transmitting channels.
- **Channel Radio ID**: decimal 1–16777214 for transmitting channels. Values
  above 9999999 retain the upstream interoperability warning.

P25 uses 12.5 kHz. A blank TX NAC inherits RX; with wildcard RX F7E, it uses
TX NAC 293. Set an explicit TX NAC when a different transmit NAC is needed.
RX-only channels may use zero talkgroup/radio ID. P25 values are independent of
DMR contacts, RX lists and DMR IDs. Add channels to a zone for normal selection
on the radio. This is conventional P25; no trunking configuration is provided.

BIN preserves all mode/system records. Conventional-channel CSV preserves P25
fields, including separate RX/TX NACs. Use BIN for systems/sites/scan/bandplan
records that the CSV or qdmr schema cannot express. qdmr YAML export
refuses P25 because that format cannot represent these Classic fields. Unknown
channel formats are preserved in an unchanged BIN, flagged, and blocked from
radio writes until corrected. Drafts stay in this browser, separate from Next.
Contact downloads use RadioID only when requested; no codeplug is uploaded.

Classic r10 adds the matching on-radio default and confirmation. In this CPS,
new and copied channels outside 144–148 or 420–450 MHz start RX Only. Changing
the actual TX frequency outside those bands also selects RX Only. Turning it
off requires an explicit Enable TX confirmation; cancel keeps the whole edit
unapplied. Existing saved/imported programming is kept, and the radio's transmit
checks still apply; the existing P25 transmit-band restriction is unchanged.
The effective TX frequency uses RX for talkaround or a blank TX frequency.
There is no new stored approval flag or prompt on every PTT press.

## Development and validation

```sh
npm ci
python3 tools/build.py
npm run prepare:tests
npm test
npm run test:browser
npm start
```

`npm run prepare:tests` fetches published Classic r10 source at
`b885d5da77c9d41fb7d54d344f2568493846a36d` into ignored `build/classic-source`
and prepares the real host simulator and C encoder/decoder. Use Node22+,
Python3.10+, Git, Make and a host C compiler; the C cross-check is tested with
clang on macOS. No target compiler is needed for the CPS tests. Alternatively
set `OPEN25_CLASSIC_SOURCE` to an already prepared matching RFKV-only firmware
checkout. An old r7/r8 source checkout cannot validate this programming format.
Host tests exercise all usable TX NACs, validation limits, CSV/BIN round trips,
unchanged FM/DMR bytes, DMR reference isolation and simulated serial writes.
Browser tests use installed Chrome (or install Chrome through Playwright).
`CPS_URL` selects a hosted deployment for the same browser checks; `#sim` uses
only a browser-local simulated radio. No test flashes firmware or keys RF.

## Source and local packaging

Source is published in [Open25-DM32-Classic-CPS](https://github.com/tylerwatt12/Open25-DM32-Classic-CPS).
`npm run verify` checks the current release payload manifest. `npm run package`
builds and verifies only the current Classic CPS static files into ignored
`build/site/classic-cps/`; it refuses to overwrite an existing payload. No command
in this source repository deploys to the website or accesses a physical radio.
Site administration is maintained separately. Preserve LICENSE, UPSTREAM-AUTHORS
and UPSTREAM.json with every source/static distribution.
