#!/usr/bin/env python3
"""Поперечный срез для замера кромок: снимок вокруг точки S, повёрнутый по касательной (трасса — слева направо),
0.05 м/пкс, поперёк ±HALF м, вдоль ±12 м. Линейка поперёк в центре: деление 1 м, подпись через 2 м (+ влево по ходу),
красная точка — контур (0). Несколько S — в один лист столбцом.

    python3 xsec.py S [S …] [--half=16] [--src=google] [--z=20] [--out=…]
"""
import math, os, sys, numpy as np
from PIL import Image, ImageDraw
import bk, tiles
args = [float(a) for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
HALF = float(opt.get('half', 16)); SRC = opt.get('src', 'google'); Z = int(opt.get('z', 20)); PX = 0.05; ALONG = 12


def cut(S):
    p, _ = bk.at(S); q1, _ = bk.at(S - 4); q2, _ = bk.at(S + 4)
    ex = np.subtract(q2, q1); ex /= np.hypot(*ex); ey = np.array([-ex[1], ex[0]]); p = np.array(p)
    W, H = int(2 * ALONG / PX), int(2 * HALF / PX)
    U, V = np.meshgrid(-ALONG + np.arange(W) * PX, HALF - np.arange(H) * PX)
    WX = p[0] + ex[0] * U + ey[0] * V; WY = p[1] + ex[1] * U + ey[1] * V
    la = bk.LAT0 + WY / bk.MPD_LAT; lo = bk.LON0 + WX / bk.MPD_LON; n = 2 ** Z
    tx = (lo + 180) / 360 * n; lr = np.radians(la); ty = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n
    TX, TY = tx.astype(int), ty.astype(int); img = np.zeros((H, W, 3), np.uint8)
    for key in set(zip(TX.ravel().tolist(), TY.ravel().tolist())):
        tiles.tile(key[0], key[1], SRC, Z)
        t = np.asarray(Image.open(os.path.join(tiles.TD, '%s_%d_%d_%d.jpg' % (SRC, Z, key[0], key[1]))).convert('RGB'))
        m = (TX == key[0]) & (TY == key[1])
        img[m] = t[np.clip(((ty[m] - key[1]) * 256).astype(int), 0, 255), np.clip(((tx[m] - key[0]) * 256).astype(int), 0, 255)]
    im = Image.fromarray(img); d = ImageDraw.Draw(im); cx = W // 2
    for k in range(-int(HALF), int(HALF) + 1):
        y = (HALF - k) / PX; L = 30 if k % 2 == 0 else 14
        d.line([(cx - L, y), (cx + L, y)], fill=(255, 255, 0), width=2)
        if k % 2 == 0:
            d.rectangle([cx + 34, y - 7, cx + 62, y + 7], fill=(0, 0, 0)); d.text((cx + 36, y - 6), '%+d' % k, fill=(255, 255, 0))
    d.line([(cx, 0), (cx, H)], fill=(255, 255, 0), width=1)
    d.ellipse([cx - 5, HALF / PX - 5, cx + 5, HALF / PX + 5], fill=(255, 0, 0))
    d.rectangle([0, 0, 80, 18], fill=(0, 0, 0)); d.text((4, 3), 'S %d' % S, fill=(255, 140, 0))
    return im


ims = [cut(S) for S in args]
out = Image.new('RGB', (sum(i.width for i in ims) + 6 * (len(ims) - 1), ims[0].height)); x = 0
for i in ims: out.paste(i, (x, 0)); x += i.width + 6
fn = opt.get('out', 'plans/xsec_%s.jpg' % '_'.join('%d' % s for s in args)); out.save(fn, quality=88); print(fn, out.size)
