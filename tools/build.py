#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Refresh the Classic-only HTML/catalog and copy public license notices."""
from pathlib import Path
import json,html,shutil
ROOT=Path(__file__).resolve().parents[1]
# The checked-in English catalog is the only string owner in this standalone CPS.
strings=json.loads((ROOT/'strings.json').read_text())
catalog=json.dumps(strings,ensure_ascii=False).replace('</','<\\/')
page='''<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Program FM, DMR and conventional P25 channels for Open25-DM32 Classic.">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://database.radioid.net https://radioid.net https://proxy.corsfix.com https://api.allorigins.win; object-src 'none'; base-uri 'none'">
<title>Open25-DM32 Classic CPS</title>
<link rel="icon" href="static/img/classic.svg" type="image/svg+xml">
<link rel="stylesheet" href="static/css/tokens.css"><link rel="stylesheet" href="static/css/site.css"><link rel="stylesheet" href="classic.css">
<script type="module" src="classic.js"></script>
</head>
<body class="page-codeplug" data-root="./" data-home="./">
<a class="skip" href="#main">Skip to editor</a>
<header class="site-header"><div class="wrap header-row">
<a class="brand" href="./"><img src="static/img/classic.svg" alt="" width="34" height="34"><span>Open25-DM32 <b>Classic CPS</b></span></a>
<nav aria-label="Tools"><a href="../">All tools</a><a href="../cps/">Next CPS</a><a href="../v3/firmware.html">Flasher v3</a><a href="https://github.com/tylerwatt12/Open25-DM32/issues" target="_blank" rel="noopener">Report an issue</a></nav>
<button id="theme-toggle" type="button" class="theme-toggle" aria-label="Switch light and dark">◐</button>
</div></header>
<main id="main"><section class="wrap section page-head compact">
<h1>Open25-DM32 Classic CPS</h1><p class="lead">Program FM, DMR and conventional P25 channels for Classic.</p>
<p class="edition-note">For <strong>Open25-DM32 Classic</strong> firmware on the DM-32UV. For Next firmware, use <a href="../cps/">Next CPS</a>.</p>
</section><section class="wrap section editor-section">
<div id="editor" class="editor"><p class="muted">Loading editor…</p></div><noscript>Enable JavaScript to use the editor.</noscript>
</section></main>
<footer class="wrap classic-footer"><p>Open25-DM32 Classic CPS · <a href="https://github.com/tylerwatt12/Open25-DM32/issues">Support and issues</a> · <a href="LICENSE">MIT license</a></p>
<p class="small muted">Based on RadioFoundry’s open-source codeplug editor. <a href="https://github.com/RadioFoundry/RadioFoundry/tree/dfbaf20c400c73e2ccf6edb80af7d1d255bee418/site/static/js/codeplug">Upstream source</a> · <a href="UPSTREAM-AUTHORS">Upstream authors</a>. Codeplug files and drafts stay in your browser.</p></footer>
<script type="application/json" id="i18n">'''+catalog+'''</script>
<script type="module" src="static/js/editor/app.js"></script>
</body></html>
'''
(ROOT/'app/index.html').write_text(page)
for name in ['LICENSE','UPSTREAM-AUTHORS']:shutil.copyfile(ROOT/name,ROOT/'app'/name)
print('Built Open25-DM32 Classic CPS')
