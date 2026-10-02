#!/usr/bin/env python3
"""Листы онбоарда: кадры 3×3 с подписью «кадр / S игры / км/ч» (S — kadry.tsv).
    python3 sheet.py 10 90 3     # кадры 10..90 через 3 -> plans/sheet_10_90.jpg (по 9 на лист)"""
import os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
K = {}
for l in open(os.path.join(HERE, 'onboard', 'kadry.tsv')):
    if l.startswith('#'): continue
    f = l.split('\t'); K[int(f[0])] = (f[2], f[3])
a, b, st = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 3
fr = list(range(a, b + 1, st))
os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
for p in range(0, len(fr), 9):
    im = Image.new('RGB', (1920, 1080)); d = ImageDraw.Draw(im)
    for j, k in enumerate(fr[p:p + 9]):
        t = Image.open(os.path.join(HERE, 'onboard', 'kadr_%04d.jpg' % k)).resize((640, 360))
        x, y = (j % 3) * 640, (j // 3) * 360; im.paste(t, (x, y))
        s, v = K.get(k, ('?', '?'))
        d.rectangle([x, y, x + 190, y + 18], fill=(0, 0, 0)); d.text((x + 4, y + 3), 'k%d  S%s  %skm/h' % (k, s, v), fill=(255, 255, 0))
    out = os.path.join(HERE, 'plans', 'sheet_%03d_%03d.jpg' % (fr[p], fr[min(p + 8, len(fr) - 1)]))
    im.save(out, quality=85); print(out)
