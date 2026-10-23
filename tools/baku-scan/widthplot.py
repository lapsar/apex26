#!/usr/bin/env python3
"""График ширины полотна Баку по кругу из edges.tsv -> views/width.png (повороты — multiviewer 2026)."""
from PIL import Image, ImageDraw, ImageFont
import numpy as np, json
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15); Fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
R = [l.split('\t') for l in open('edges.tsv').read().splitlines()[1:]]
S = np.array([float(r[0]) for r in R]); w = np.array([float(r[1]) - float(r[2]) for r in R]); src = [r[3] for r in R]
W, H = 1800, 540; im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
X = lambda s: 60 + s / 5960 * (W - 80); Y = lambda v: H - 50 - v * 18
for v in range(0, 25, 2):
    d.line([(60, Y(v)), (W - 20, Y(v))], fill=(225, 225, 225)); d.text((25, Y(v) - 8), '%d м' % v, fill='black', font=Fs)
d.line([(60, Y(12)), (W - 20, Y(12))], fill=(240, 150, 0), width=2); d.text((W - 230, Y(12) + 4), 'Монако: 12 м везде', fill=(200, 110, 0), font=F)
for c in json.load(open('multiviewer_2026.json'))['corners']:
    s = c['length'] / 10 * 5958 / 6003; d.line([(X(s), Y(0)), (X(s), Y(24))], fill=(225, 225, 255)); d.text((X(s) - 8, Y(24) - 18), 'T%d' % c['number'], fill=(60, 60, 200), font=Fs)
for i in range(len(S) - 1):
    d.line([(X(S[i]), Y(w[i])), (X(S[i + 1]), Y(w[i + 1]))], fill=(0, 140, 0) if src[i] == 'fix' else (150, 150, 150), width=3)
for s in range(0, 6000, 500): d.text((X(s) - 14, H - 42), '%d м' % s, fill='black', font=Fs)
d.text((60, 6), 'Баку: ширина полотна по кругу (зелёное — по снимку и онбоарду, серое — по тротуарам OSM, проверено выборочно)', fill='black', font=F)
d.text((X(2690) - 30, Y(7.5) + 6), 'замок 7.5', fill=(0, 100, 0), font=Fs)
im.save('views/width.png'); print('views/width.png')
