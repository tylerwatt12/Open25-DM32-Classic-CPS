#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Build the Classic CPS-only static payload locally; never deploys."""
from pathlib import Path
import json,shutil,subprocess
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['python3','tools/build.py'],cwd=ROOT,check=True)
subprocess.run(['python3','tools/verify_release.py'],cwd=ROOT,check=True)
out=ROOT/'build/site/classic-cps'
if out.exists():raise SystemExit('Preserving existing payload; move build/site before packaging again')
for name in json.loads((ROOT/'LIVE-SNAPSHOT.json').read_text())['files_sha256']:
    target=out/Path(name).relative_to('app');target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,target)
print('Prepared local CPS payload in build/site/classic-cps. No upload performed.')
