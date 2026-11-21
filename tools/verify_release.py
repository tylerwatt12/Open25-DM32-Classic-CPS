#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Check the reviewed Classic CPS static payload and its module dependencies."""
from pathlib import Path,PurePosixPath
import hashlib,json,re,posixpath
ROOT=Path(__file__).resolve().parents[1]
files=json.loads((ROOT/'LIVE-SNAPSHOT.json').read_text())['files_sha256']
for name,wanted in files.items():
    parts=PurePosixPath(name).parts
    if not parts or parts[0]!='app' or '..' in parts:
        raise SystemExit('Unexpected payload path: '+name)
    path=ROOT/name
    if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=wanted:
        raise SystemExit('Reviewed snapshot mismatch: '+name)
    if path.suffix=='.js':
        for dep in re.findall(r'''(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']''',path.read_text()):
            target=posixpath.normpath(str(PurePosixPath(name).parent/dep))
            if target not in files:raise SystemExit('Unmanifested runtime dependency: '+target)
print(f'Verified {len(files)} reviewed Classic CPS files and module dependencies')
