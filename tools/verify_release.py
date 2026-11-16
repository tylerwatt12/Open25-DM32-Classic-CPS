#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Check byte identity with the initial live Classic CPS release."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
files=json.loads((ROOT/'LIVE-SNAPSHOT.json').read_text())['files_sha256']
for name,wanted in files.items():
    path=ROOT/name
    if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=wanted:raise SystemExit('Live snapshot mismatch: '+name)
print(f'Verified {len(files)} live Classic CPS files')
