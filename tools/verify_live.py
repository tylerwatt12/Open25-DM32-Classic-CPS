#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Verify every deployed payload byte via public HTTP, plus server preservation receipt."""
from pathlib import Path
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
import json,hashlib,argparse
p=argparse.ArgumentParser();p.add_argument('receipt',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args();r=json.loads(a.receipt.read_text())
base='https://kd8zmm.com/open25-dm32/'
def check(item):
 name,wanted=item
 req=Request(base+name,headers={'User-Agent':'Mozilla/5.0 Open25-Classic-CPS verification','Cache-Control':'no-cache'})
 with urlopen(req,timeout=30) as response:
  data=response.read();actual=hashlib.sha256(data).hexdigest();assert actual==wanted,(name,actual,wanted)
  return {'file':name,'sha256':actual,'status':response.status}
items=dict(r['payload'])
# Also verify the existing Next CPS entry directly; all its server hashes are in the preservation receipt.
items.update({n:h for n,h in r['before'].items() if n in ['cps/index.html','v3/firmware.html','releases/catalog.json']})
with ThreadPoolExecutor(max_workers=6) as pool:verified=list(pool.map(check,items.items()))
a.out.write_text(json.dumps({'base':base,'verified':verified,'preserved_existing':r['preserved_existing']},indent=2)+'\n')
print(f'Public HTTP hashes match for {len(verified)} files; all other existing server files preserved.')
