#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Serve only the static application on loopback."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import argparse
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8340);a=p.parse_args()
root=Path(__file__).resolve().parents[1]/'app'
print(f'Classic CPS: http://127.0.0.1:{a.port}',flush=True)
ThreadingHTTPServer(('127.0.0.1',a.port),partial(SimpleHTTPRequestHandler,directory=str(root))).serve_forever()
