#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Compile the native C format owners in an explicitly selected firmware checkout.

Uses the public RadioFoundry/Classic MIT implementation, never private Next code.
No firmware checkout files are changed, and no radio is accessed.
"""
from pathlib import Path
import os,subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
source=Path(os.environ.get('OPEN25_NATIVE_SOURCE',str(ROOT/'build/native-source'))).resolve()
if not (source/'core/p25/p25_codeplug.c').is_file():
    raise SystemExit('Set OPEN25_NATIVE_SOURCE to the matching native Classic source checkout')
out=ROOT/'build';out.mkdir(exist_ok=True)
names=['core/codeplug/codeplug.c','core/codeplug/codeplug_kv.c','core/codeplug/codeplug_talk.c',
 'core/codeplug/codeplug_tag.c','core/codeplug/codeplug_records.c','core/p25/p25_codeplug.c',
 'core/nxdn/nxdn_codeplug.c','core/storage/storage.c','tests/host/sim/sim_flash.c']
subprocess.run(['clang','-std=gnu99','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-g',
 '-fsanitize=address,undefined','-fno-sanitize-recover=undefined','-fno-omit-frame-pointer',
 '-DCONFIG_P25=1','-DCONFIG_NXDN=1','-DCONFIG_DMR=1','-DCONFIG_CPS_RFKV_ONLY=1',
 '-DCONFIG_P25_TRUNK=0','-DCONFIG_CODEPLUG_MODES=1','-DCONFIG_AM_RX=0','-DCONFIG_BCAST_FM=0',
 '-I'+str(source/'core'),'-I'+str(source/'hal'),'-I'+str(source/'drivers'),'-I'+str(source/'tests/host'),
 str(ROOT/'tests/c_native_bridge.c'),*[str(source/n) for n in names],'-o',str(out/'c-native-bridge')],check=True)
(out/'native-source.json').write_text(json.dumps({'source_commit':subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip(),
 'files_sha256':{n:hashlib.sha256((source/n).read_bytes()).hexdigest() for n in names}},indent=2)+'\n')
print('Prepared sanitized actual native C codeplug/target owners')
