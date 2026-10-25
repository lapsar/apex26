#!/usr/bin/env python3
"""Лист «онбоард / игра было / игра стало» по кадрам (v1.17.11): plans/game_K_o.png и game_K_n.png — от povcmp.js (APEX_INDEX — прошлая сборка).
    python3 sheet3.py выход.jpg K [K …]"""
import sys
from PIL import Image, ImageDraw, ImageFont
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
S = {int(l.split('\t')[0]): l.split('\t')[2] for l in open('onboard/kadry.tsv') if not l.startswith('#')}
out, ks = sys.argv[1], [int(k) for k in sys.argv[2:]]; W, H = 560, 315
sh = Image.new('RGB', (W * 3, H * len(ks))); d = ImageDraw.Draw(sh)
for j, k in enumerate(ks):
    sh.paste(Image.open('onboard/kadr_%04d.jpg' % k).crop((261, 0, 2607, 1320)).resize((W, H)), (0, j * H))
    for i, t in enumerate(('_o', '_n')): sh.paste(Image.open('plans/game_%d%s.png' % (k, t)).resize((W, H)), ((i + 1) * W, j * H))
    for i, lab in enumerate(('онбоард k%d S%s' % (k, S[k]), 'было', 'стало')):
        d.rectangle((i * W, j * H, i * W + 8 + 11 * len(lab), j * H + 24), fill='black'); d.text((i * W + 4, j * H + 2), lab, fill='yellow', font=F)
sh.save(out, quality=82)
