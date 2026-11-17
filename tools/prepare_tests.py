#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Build synthetic codeplug fixtures from Classic's real firmware sources."""
from pathlib import Path
import subprocess,json,os,argparse
ROOT=Path(__file__).resolve().parents[1]
PIN='b885d5da77c9d41fb7d54d344f2568493846a36d'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--fetch',action='store_true',help='Fetch the published Classic r10 source and prepare host tests')
args=parser.parse_args()
CLASSIC=Path(os.environ.get('OPEN25_CLASSIC_SOURCE',str(ROOT/'build/classic-source'))).resolve()
if args.fetch:
    if 'OPEN25_CLASSIC_SOURCE' in os.environ:raise SystemExit('Use --fetch without OPEN25_CLASSIC_SOURCE; external checkouts are never modified')
    if not CLASSIC.exists():
        CLASSIC.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run(['git','init',str(CLASSIC)],check=True)
        subprocess.run(['git','-C',str(CLASSIC),'remote','add','origin','https://github.com/tylerwatt12/Open25-DM32.git'],check=True)
        subprocess.run(['git','-C',str(CLASSIC),'fetch','--depth=1','origin',PIN],check=True)
        subprocess.run(['git','-C',str(CLASSIC),'checkout','--detach',PIN],check=True)
    if subprocess.check_output(['git','-C',str(CLASSIC),'rev-parse','HEAD'],text=True).strip()!=PIN:raise SystemExit('Preserving unexpected firmware source; expected published Classic r10')
    subprocess.run(['python3','tools/build_radiofoundry.py','--classic','--prepare-only'],cwd=CLASSIC,check=True)
if 'OPEN25_CLASSIC_SOURCE' not in os.environ and CLASSIC.exists() and subprocess.check_output(['git','-C',str(CLASSIC),'rev-parse','HEAD'],text=True).strip()!=PIN:raise SystemExit('Cached firmware source differs; move build/classic-source before fetching r10')
HOST=CLASSIC/'build/radiofoundry-p25/tests/host'
if not HOST.is_dir():raise SystemExit('Run npm run prepare:tests first, or set OPEN25_CLASSIC_SOURCE to a prepared Classic r10 checkout')
OUT=ROOT/'build/site-tests';OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['make','-s','cpsSim'],cwd=HOST,check=True)
subprocess.run([str(HOST/'cpsSim'),'--populate','--dump',str(OUT/'codeplug_sim.bin')],stdin=subprocess.DEVNULL,check=True)
(OUT/'codeplug.json').write_text(json.dumps({'cpssim':str(HOST/'cpsSim')})+'\n')
# Link only the canonical C channel encoder/decoder and its real board power map.
app=CLASSIC/'build/radiofoundry-p25'
subprocess.run(['clang','-std=gnu99','-Wall','-Wextra','-Werror','-g','-ffunction-sections','-fdata-sections',
 '-DCONFIG_P25_CHANNELS=1','-DCONFIG_CODEPLUG_MODES=1','-DCONFIG_P25=1','-I'+str(app/'core'),'-I'+str(app/'hal'),'-I'+str(app/'drivers'),
 str(ROOT/'tests/c_format_bridge.c'),str(app/'core/codeplug/codeplug.c'),str(app/'core/p25/p25_codeplug.c'),'-Wl,-dead_strip','-o',str(ROOT/'build/c-format-bridge')],check=True)
print('Prepared synthetic fixtures and actual Classic C format bridge')
