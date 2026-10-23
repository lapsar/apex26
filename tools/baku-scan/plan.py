#!/usr/bin/env python3
"""Снимок сверху вдоль участка Баку для замера кромок (по образцу monaco-scan/plan.py, без игры).
Кадр повёрнут так, что трасса идёт слева направо (по хорде участка), масштаб ровный (не развёртка).
Наложение: контур (красный), линии отступа от него через 2 м (тонкие; подписи ±4, ±8, ±12, + — влево по ходу),
S через 10 м (жёлтые метки), нитка телеметрии 2026 (голубые точки), место болида онбоарда по кадрам (оранжевое,
номер через 2 кадра). Края полотна читаются по линиям отступа.

    python3 plan.py S0 S1 [--src=google] [--z=20] [--half=22] [--px=0.08]   -> plans/plan_S0_S1.jpg
"""
import math, os, sys, numpy as np
from PIL import Image, ImageDraw
import bk, tiles
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
S0, S1 = float(args[0]), float(args[1])
SRC = opt.get('src', 'google'); Z = int(opt.get('z', 20)); HALF = float(opt.get('half', 22)); PX = float(opt.get('px', 0.08))
pts = [bk.at(s)[0] for s in np.arange(S0, S1 + 0.1, 2.0)]
a, b = np.array(pts[0]), np.array(pts[-1]); ex = (b - a) / np.linalg.norm(b - a); ey = np.array([-ex[1], ex[0]])
loc = np.array([[(np.array(p) - a) @ ex, (np.array(p) - a) @ ey] for p in pts])
x0, x1 = loc[:, 0].min() - 15, loc[:, 0].max() + 15; y0, y1 = loc[:, 1].min() - HALF, loc[:, 1].max() + HALF
W, H = int((x1 - x0) / PX), int((y1 - y0) / PX)
U, V = np.meshgrid(x0 + np.arange(W) * PX, y1 - np.arange(H) * PX)
WX = a[0] + ex[0] * U + ey[0] * V; WY = a[1] + ex[1] * U + ey[1] * V
la = bk.LAT0 + WY / bk.MPD_LAT; lo = bk.LON0 + WX / bk.MPD_LON; n = 2 ** Z
tx = (lo + 180) / 360 * n; lr = np.radians(la); ty = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n
TX, TY = tx.astype(int), ty.astype(int); img = np.zeros((H, W, 3), np.uint8)
for key in set(zip(TX.ravel().tolist(), TY.ravel().tolist())):
    tiles.tile(key[0], key[1], SRC, Z)
    t = np.asarray(Image.open(os.path.join(tiles.TD, '%s_%d_%d_%d.jpg' % (SRC, Z, key[0], key[1]))).convert('RGB'))
    m = (TX == key[0]) & (TY == key[1])
    img[m] = t[np.clip(((ty[m] - key[1]) * 256).astype(int), 0, 255), np.clip(((tx[m] - key[0]) * 256).astype(int), 0, 255)]
im = Image.fromarray(img); d = ImageDraw.Draw(im)


def P(q):
    q = np.array(q) - a; return ((q @ ex - x0) / PX, (y1 - q @ ey) / PX)


ss = np.arange(S0 - 10, S1 + 10.1, 1.0)
for off in range(-int(HALF), int(HALF) + 1, 2):
    line = []
    for s in ss:
        p, _ = bk.at(s); q1, _ = bk.at(s - 3); q2, _ = bk.at(s + 3)
        t = np.subtract(q2, q1); t /= np.hypot(*t); nn = np.array([-t[1], t[0]])
        line.append(P(np.array(p) + nn * off))
    if off == 0: d.line(line, fill=(255, 40, 40), width=2); continue
    d.line(line, fill=(255, 255, 255) if off % 4 == 0 else (150, 150, 150), width=1)
    if off % 4 == 0:
        for k in range(15, len(line), 40): d.text((line[k][0] + 2, line[k][1] - 12), '%+d' % off, fill=(255, 255, 255))
import os as _os
if _os.path.exists('edges.tsv') and opt.get('edges', '1') == '1':          # кромки из edges.tsv: пурпурные, середина — зелёная
    E = [tuple(map(float, l.split('\t')[:3])) for l in open('edges.tsv').read().splitlines()[1:]]
    for col, j in (((255, 0, 255), 1), ((255, 0, 255), 2), ((0, 255, 0), 0)):
        pl = []
        for s_, l_, r_ in E:
            if not (S0 - 5 <= s_ <= S1 + 5): continue
            p, _ = bk.at(s_); q1, _ = bk.at(s_ - 3); q2, _ = bk.at(s_ + 3)
            t = np.subtract(q2, q1); t /= np.hypot(*t); nn = np.array([-t[1], t[0]])
            off = l_ if j == 1 else r_ if j == 2 else (l_ + r_) / 2
            pl.append(P(np.array(p) + nn * off))
        if len(pl) > 1: d.line(pl, fill=col, width=3)
for s in np.arange(math.ceil(S0 / 10) * 10, S1 + 0.1, 10):
    p, _ = bk.at(s); q = P(p); d.ellipse([q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3], fill=(255, 220, 0)); d.text((q[0] + 4, q[1] + 2), '%d' % (s % bk.TOT), fill=(255, 220, 0))
for l in open('openf1/top8_xy.tsv'):
    q = P(tuple(map(float, l.split()))); 
    if 0 <= q[0] < W and 0 <= q[1] < H: d.ellipse([q[0] - 2, q[1] - 2, q[0] + 2, q[1] + 2], fill=(0, 230, 255))
for l in open('onboard/kadry.tsv'):
    if l.startswith('#'): continue
    f = l.split('\t')
    if not f[2]: continue
    k, S = int(f[0]), float(f[2])
    if not (S0 - 5 <= S <= S1 + 5) or k > 425: continue
    p, _ = bk.at(S); q = P(p); d.ellipse([q[0] - 4, q[1] - 4, q[0] + 4, q[1] + 4], outline=(255, 140, 0), width=2)
    if k % 2 == 0: d.text((q[0] - 6, q[1] + 6), 'k%d' % k, fill=(255, 140, 0))
os.makedirs('plans', exist_ok=True); fn = opt.get('out', 'plans/plan_%04d_%04d.jpg' % (S0, S1))
im.save(fn, quality=88); print(fn, im.size)
