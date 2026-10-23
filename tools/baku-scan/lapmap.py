#!/usr/bin/env python3
"""Карта всего круга сверху (Google z17): кромки полотна из edges.tsv (жёлтые), линия старта, номера поворотов → views/lapmap.jpg."""
import math, json, numpy as np
from PIL import Image, ImageDraw, ImageFont
import bk, tiles
Z = 17; F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
E = [tuple(map(float, l.split('\t')[:3])) for l in open('edges.tsv').read().splitlines()[1:]]
def nrm(s):
    q1, _ = bk.at(s - 3); q2, _ = bk.at(s + 3); t = np.subtract(q2, q1); t /= np.hypot(*t); return np.array([-t[1], t[0]])
L = [np.array(bk.at(s)[0]) + nrm(s) * l for s, l, r in E]; R = [np.array(bk.at(s)[0]) + nrm(s) * r for s, l, r in E]
ll = [bk.latlon(*p) for p in L + R]
la0, la1 = min(a for a, b in ll) - 0.0012, max(a for a, b in ll) + 0.0012; lo0, lo1 = min(b for a, b in ll) - 0.0015, max(b for a, b in ll) + 0.0015
x0, y0 = tiles.deg2num(la1, lo0, Z); x1, y1 = tiles.deg2num(la0, lo1, Z)
X0, Y0 = int(x0), int(y0); im = Image.new('RGB', ((int(x1) - X0 + 1) * 256, (int(y1) - Y0 + 1) * 256))
for X in range(X0, int(x1) + 1):
    for Y in range(Y0, int(y1) + 1):
        tiles.tile(X, Y, 'google', Z); im.paste(Image.open('%s/google_%d_%d_%d.jpg' % (tiles.TD, Z, X, Y)), ((X - X0) * 256, (Y - Y0) * 256))
im = Image.blend(im, Image.new('RGB', im.size, (0, 0, 0)), 0.35); d = ImageDraw.Draw(im)
def P(p):
    a, b = bk.latlon(*p); u, v = tiles.deg2num(a, b, Z); return ((u - X0) * 256, (v - Y0) * 256)
for side in (L, R): d.line([P(p) for p in side] + [P(side[0])], fill=(255, 220, 0), width=3)
p, t = bk.at(0); n = np.array([-t[1], t[0]]); d.line([P(np.array(p) + n * 9), P(np.array(p) - n * 14)], fill=(255, 255, 255), width=6)
for c in json.load(open('multiviewer_2026.json'))['corners']:
    s = c['length'] / 10 * bk.TOT / 6003; q = P(bk.at(s)[0]); d.text((q[0] + 8, q[1] - 26), str(c['number']), fill=(120, 220, 255), font=F)
im = im.crop((0, 0, int((x1 - X0) * 256), int((y1 - Y0) * 256)))
im.save('views/lapmap.jpg', quality=82); print(im.size)
