# Open25-DM32 Classic CPS

A standalone browser codeplug editor for **Open25-DM32 Classic** on the
Baofeng DM-32UV. Live at https://kd8zmm.com/open25-dm32/classic-cps/.
Next CPS remains separately hosted at `/open25-dm32/cps/`.

Adapted from RadioFoundry's MIT codeplug editor at the exact revision recorded
in `UPSTREAM.json`. Original MIT notices and author credits are retained.
This repository has its own history, assets, deployment and browser draft store;
it contains no Next CPS implementation.

## Programming

Use desktop Chrome or Edge for radio read/write over Web Serial. Turn the radio
on normally, close other applications using its port, and choose Read from Radio.
Read and save an original BIN before editing. This CPS accepts Classic firmware;
it refuses a Next or unrecognized firmware identity before programming.

FM and DMR retain the original editor's fields. Conventional P25 is available in
the Mode selector in the channel table or the pencil/edit form:

- **RX NAC**: hexadecimal `000`–`FFF`; `F7E` receives any NAC; `F7F` is reserved.
- **TX NAC**: `Same as RX` or an explicit hexadecimal NAC. `000` is a valid
  explicit NAC. `F7E` and `F7F` cannot be transmitted.
- **P25 Talkgroup**: decimal 1–65535 for transmitting channels.
- **P25 Radio ID**: decimal 1–9999999 for transmitting channels.

P25 uses 12.5 kHz. A wildcard RX NAC needs an explicit valid TX NAC or RX Only.
RX-only channels may use zero talkgroup/radio ID. P25 values are independent of
DMR contacts, RX lists and DMR IDs. Add channels to a zone for normal selection
on the radio. This is conventional P25; no trunking configuration is provided.

BIN and CSV preserve P25 fields, including separate RX/TX NACs. qdmr YAML export
refuses P25 because that format cannot represent these Classic fields. Unknown
channel formats are preserved in an unchanged BIN, flagged, and blocked from
radio writes until corrected. Drafts stay in this browser, separate from Next.
Contact downloads use RadioID only when requested; no codeplug is uploaded.

## Initial source release

This initial source snapshot matches the currently live Classic CPS, based on
`fcac0f5f761996ee78232e5c7450402ba37eaaf7`. It uses the legacy Classic
programming format compatible with installed r7/r8 firmware. It does not contain
the unreleased RFKV migration. `LIVE-SNAPSHOT.json` records the exact deployed
54-file payload. Packaging does not change runtime files.

## Development and validation

```sh
npm ci
python3 tools/build.py
npm run prepare:tests
npm test
npm run test:browser
npm start
```

`npm run prepare:tests` fetches the published Classic r8 source at
`a12f996118ec367593ef2736990c93a76f778823` into ignored `build/classic-source`,
then prepares only host-test source, not a target firmware build. This needs
Python 3.10+, Node 22+, Git, Make and a host C compiler (`clang` on macOS).
No C-SKY toolchain is required for these CPS tests. Alternatively set
`OPEN25_CLASSIC_SOURCE` to an already prepared, compatible Classic r8 checkout;
that checkout is used to build its host simulator. The current RFKV migration
checkout is incompatible with these legacy-format tests.
Host tests exercise all usable TX NACs, validation limits, CSV/BIN round trips,
unchanged FM/DMR bytes, DMR reference isolation and simulated serial writes.
Browser tests use installed Chrome (or install Chrome through Playwright).
`CPS_URL` selects a hosted deployment for the same browser checks; `#sim` uses
only a browser-local simulated radio. No test flashes firmware or keys RF.

## Local release packaging

`npm run verify` checks the initial deployed hashes. `npm run package` rebuilds
and verifies the static app, then writes only the 54 reviewed live files under
`build/site/classic-cps/`. It preserves an existing output instead of overwriting
it. This command never uploads or deploys anything. Site administration and SSH
configuration are maintained separately from the public source.

The public source repository is intended to be named `Open25-DM32-Classic-CPS`.
This preparation does not create a GitHub repository or publish a release.
The original MIT license, upstream author list and source hash inventory remain
in LICENSE, UPSTREAM-AUTHORS and UPSTREAM.json.
