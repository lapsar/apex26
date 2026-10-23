#!/usr/bin/env python3
"""Развёрнутая лента дороги Баку: снимок, выпрямленный вдоль контура (по образцу hungaroring-scan/unroll.py).
По горизонтали — дуга S, по вертикали — отступ от осевой (+ влево по ходу — ВВЕРХ), 0.1 м на пиксель.
Сетка: тонкие линии через 1 м поперёк, жирные — через 5 м с подписью; вертикали через 10 м с S.
Кромки полотна (краска поребриков, бордюр) читаются глазом прямо в метрах.

    python3 unroll.py S0 S1 [--src=google] [--z=20] [--half=20] [--chunk=150] [--extra=файл.tsv:RRGGBB] [--out=…]
"""
import math, os, sys, numpy as np
from PIL import Image, ImageDraw
import bk, tiles
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
S0, S1 = float(args[0]), float(args[1])
SRC = opt.get('src', 'google'); Z = int(opt.get('z', 20)); HALF = float(opt.get('half', 20)); CH = float(opt.get('chunk', 150))
PX = 0.1


def sample(xs, ys):
    """цвета точек (метры bk) — по тайлам, ближайший пиксель"""
    la = bk.LAT0 + ys / bk.MPD_LAT; lo = bk.LON0 + xs / bk.MPD_LON
    n = 2 ** Z; tx = (lo + 180) / 360 * n
    lr = np.radians(la); ty = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n
    X, Y = tx.astype(int), ty.astype(int); out = np.zeros(xs.shape + (3,), np.uint8)
    for key in set(zip(X.ravel().tolist(), Y.ravel().tolist())):
        m = (X == key[0]) & (Y == key[1])
        try: im = np.asarray(Image.open(os.path.join(tiles.TD, '%s_%d_%d_%d.jpg' % (SRC, Z, key[0], key[1]))).convert('RGB')) if tiles.tile(*key, SRC, Z) else None
        except Exception: continue
        u = np.clip(((tx[m] - key[0]) * 256).astype(int), 0, 255); v = np.clip(((ty[m] - key[1]) * 256).astype(int), 0, 255)
        out[m] = im[v, u]
    return out


def strip(a, b):
    W = int(round((b - a) / PX)); H = int(round(2 * HALF / PX)) + 1
    Ss = a + np.arange(W) * PX; offs = HALF - np.arange(H) * PX
    P = np.zeros((W, 2)); N = np.zeros((W, 2))
    for i, s in enumerate(Ss):
        # нормаль — по сглаженной касательной (±6 м), иначе на изломах ломаной лента рвётся
        p, _ = bk.at(s); q1, _ = bk.at(s - 6); q2, _ = bk.at(s + 6)
        t = np.subtract(q2, q1); t /= np.hypot(*t); P[i] = p; N[i] = (-t[1], t[0])
    xs = P[None, :, 0] + N[None, :, 0] * offs[:, None]; ys = P[None, :, 1] + N[None, :, 1] * offs[:, None]
    im = Image.fromarray(sample(xs, ys)); d = ImageDraw.Draw(im)
    for k in range(-int(HALF), int(HALF) + 1):
        y = (HALF - k) / PX
        if k % 5 == 0:
            d.line([(0, y), (W, y)], fill=(255, 255, 0) if k == 0 else (255, 255, 255), width=1)
            for x in range(0, W, 300): d.text((x + 2, y - 11), '%+d' % k, fill=(255, 255, 0))
        else:
            for x in range(0, W, 6): d.point((x, y), fill=(255, 255, 255))
    s = math.ceil(a / 10) * 10
    while s < b:
        x = (s - a) / PX; d.line([(x, 0), (x, H)], fill=(255, 80, 80) if s % 50 == 0 else (200, 200, 200), width=1)
        d.text((x + 2, 2), '%d' % s, fill=(255, 80, 80)); s += 10
    for spec in [v for k, v in opt.items() if k.startswith('extra')]:
        fn, _, colr = spec.partition(':'); col = tuple(int(colr[i:i + 2], 16) for i in (0, 2, 4)) if colr else (60, 255, 60)
        for l in open(fn):
            if not l.strip() or l.startswith('#'): continue
            q = tuple(map(float, l.split()[:2])); S, side, dd = bk.proj(q)
            if a <= S < b and abs(side) < HALF: x, y = (S - a) / PX, (HALF - side) / PX; d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=col)
    return im


ims = []; s = S0
while s < S1 - 1e-6: ims.append(strip(s, min(S1, s + CH))); s += CH
W = max(i.width for i in ims); out = Image.new('RGB', (W, sum(i.height + 6 for i in ims)), (0, 0, 0)); y = 0
for i in ims: out.paste(i, (0, y)); y += i.height + 6
fn = opt.get('out', os.path.join('plans', 'unroll_%04d_%04d.jpg' % (S0, S1))); os.makedirs(os.path.dirname(fn) or '.', exist_ok=True)
out.save(fn, quality=88); print(fn, out.size)
