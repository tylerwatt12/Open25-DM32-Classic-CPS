# Open25-DM32 Classic CPS

A browser codeplug editor for **Open25-DM32 Classic** on the Baofeng DM-32UV.
The firmware profile selects the stored programming format:

| Profile | Firmware | P25 target | RFKV settings |
| --- | --- | --- | --- |
| Classic r14 | r14 native | Group, private or all-call contact | One 4 KB sector |
| Classic r9–r13 | Earlier RFKV Classic releases | Legacy direct talkgroup or contact | Existing continuation banks |

New programming defaults to r14. Existing browser drafts keep the earlier
profile unless they already saved an explicit profile. Selecting another profile
changes how the editor presents the programming; it does **not** migrate bytes.
Existing legacy records, unknown keys and unowned tails remain in the file.

Upgrade r13 through the migration-aware
[Flasher v3](https://kd8zmm.com/open25-dm32/v3/firmware.html), then **Read from
Radio** before editing with the r14 profile. The flasher owns the one-time
conversion and verified recovery file. This CPS refuses to write r13 direct-TG
extensions or chained settings to r14. An old BIN or draft must not overwrite the
migrated programming. Retired pre-RFKV Classic formats remain unsupported.

The hosted location is [Classic CPS](https://kd8zmm.com/open25-dm32/classic-cps/).
Next has its own CPS. This source contains no private Next implementation.

## Programming

Use desktop Chrome or Edge for radio read/write over Web Serial. Turn the radio
on normally, close other applications using its port, and choose Read from
Radio. Read and save an original BIN before editing. The connected radio selects
its profile when read; a mismatched profile cannot be written. Unrecognized
firmware and Next firmware are refused before programming.

FM and DMR retain their existing fields. Native r14 also edits conventional P25
and NXDN 4800/9600:

- **RX NAC:** hexadecimal `000`–`FFF`; `F7E` receives any NAC; `F7F` is reserved.
- **TX NAC:** leave blank to inherit RX, or enter an explicit hexadecimal NAC.
  `000` is valid. Wildcard RX inherits TX NAC `293`. `F7E` and `F7F` cannot be sent.
- **P25 TX Contact:** choose a group contact with ID 1–65535, private contact with
  ID 1–16777214, or all-call. No contact defaults to group 1. A saved RX group
  list may supply the first group when the TX contact is unset.
- **Channel Radio ID:** overrides the mode-wide P25 ID, which otherwise inherits
  the radio's DMR ID. P25 TX requires a nonzero effective ID.
- **NXDN:** select 4800 or 9600 bit/s, RX/TX RAN and a contact. Existing system/key
  records remain preserved; this release does not add a scrambler-key editor.

P25 uses 12.5 kHz. Add channels to a zone for normal selection. Classic r14 is
conventional; it does not run trunked channels. The r9–r13 profile retains its
legacy direct-TG controls and earlier RX-only editing defaults/confirmation.
Native r14 retains saved RX-only choices without those editor defaults. Its
firmware enforces the band policy; the CPS warns when a saved TX frequency is
outside it. Extended RX coverage is included by the firmware.

BIN is the preservation format for unknown records, systems, keys and future
tails. Native settings must fit the firmware's one-sector capacity; overflow
stops programming, rather than allocating legacy continuation sectors.
CSV supports the existing conventional interchange. A legacy Talkgroup override
column cannot be imported as an r14 contact. Use BIN for information CSV or qdmr
cannot represent. Codeplug files and drafts stay in the browser. RadioID is
contacted only when requested; no codeplug is uploaded.

## Development and validation

```sh
npm ci
python3 tools/build.py
npm run prepare:tests
OPEN25_NATIVE_SOURCE=/path/to/matching/native-classic-source npm test
npm run test:browser
npm start
```

`prepare:tests` fetches the published legacy Classic r11 source at
`6dc8214949a521f07d9f9816040329d6f7294c16` into ignored `build/classic-source`
and prepares its actual host simulator/encoder. Alternatively set
`OPEN25_CLASSIC_SOURCE` to an already prepared matching legacy source checkout.
The native source path is separate: `prepare_native_tests.py` compiles its actual
C codeplug, contact, P25 and NXDN owners with AddressSanitizer and
UndefinedBehaviorSanitizer, without changing that source checkout. Its input
hashes are recorded under ignored `build/`. No target compiler is required.
Use Node 22+, Python 3.10+, Git, Make and clang on macOS.

Tests cover all usable P25 TX NACs, native/legacy refusal, contact resolution,
NXDN RAN/rate, unknown-tail and BIN round trips, settings capacity, simulated
serial read/write/verify and browser profile/draft flows. The legacy VERSION
regression compiles the firmware's real handler and feature list. `#sim-native`
uses a browser-local native radio; `#sim` retains the legacy simulation.
No test accesses a physical radio or transmits RF.

## Source and local packaging

Source: [Open25-DM32-Classic-CPS](https://github.com/tylerwatt12/Open25-DM32-Classic-CPS).
The common model derives from RadioFoundry's MIT editor; `UPSTREAM.json` records
its base and the current upstream NXDN addition. Original author notices remain.
`npm run verify` checks the reviewed static payload manifest. `npm run package`
builds only the Classic CPS payload under ignored `build/site/classic-cps/` and
refuses an existing output. Site deployment and publication are separate owner
operations. Preserve LICENSE, UPSTREAM-AUTHORS and UPSTREAM.json in distributions.
