#!/usr/bin/env python3
"""Writes web/tvlist.js from Free My Android's television list (id, label and risk only).

    python3 tools/tvlist.py ../freemyandroid/data/packages/androidtv.json
"""
import json
import os
import sys

src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Desktop/freemyandroid/data/packages/androidtv.json')
rows = [{'id': p['id'], 'label': p['label'], 'risk': p['risk']} for p in json.load(open(src, encoding='utf-8'))['packages']]
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'tvlist.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('/* The television list (Free My Android, data/packages/androidtv.json): name and risk only. */\n')
    f.write('window.TV_LIST = ' + json.dumps(rows, indent=0, ensure_ascii=False) + ';\n')
print('web/tvlist.js:', len(rows), 'apps')
