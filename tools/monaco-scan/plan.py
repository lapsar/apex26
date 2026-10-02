#!/usr/bin/env python3
"""СНИМОК СВЕРХУ С КОЛЬЦАМИ ОТСТУПА — замер барьера Монако глазом (порт hungaroring-scan/plan.py).

Кадр повёрнут так, что участок S0..S1 идёт слева направо (левая сторона по ходу — сверху),
масштаб одинаковый по обеим осям. Поверх снимка:
  жёлтое   — кромка полотна игры (±HW);
  голубое  — отступ СЛЕВА от осевой (OFFS, подписаны), розовое — СПРАВА;
  красное  — ПОСТРОЕННЫЙ игрой барьер (wall.json из dump-wall.js), если есть;
  зелёное  — замер barrier.tsv (точки), если есть;
  белое    — S игры через 20 м; оранжевое — номера кадров онбоарда (kadry.tsv) через 2.

    python3 plan.py 180 330                  # google z20, 0.10 м/пкс, поле 30 м
    python3 plan.py 180 330 esri 19 0.2 40   # источник, зум, м/пкс, поле
    -> plans/plan_<src>_<S0>_<S1>.png (в .gitignore)
"""
import json, math, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TD = os.path.join(HERE, 'tiles'); os.makedirs(TD, exist_ok=True)
O = dict(lat0=43.737145229, lon0=7.425286371, mlon=80430.825145, mlat=110540)   # SCEN_ORIGIN.Monaco
w = json.load(open(os.path.join(HERE, 'wall.json')))
P = np.array(w['P']); R = np.array(w['R']); S = np.array(w['S']); L = w['len']; HW = np.array(w['HW'])
M = len(S)
OFFS = (7, 9, 12, 15, 20, 25, 30, 40)


def game2deg(x, z):
    return O['lat0'] + z / O['mlat'], O['lon0'] - x / O['mlon']


def deg2px(lat, lon, z):
    n = 256 * 2 ** z
    return ((lon + 180.0) / 360.0 * n,
            (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)


def tile_path(src, z, X, Y):
    return os.path.join(TD, '%s_%d_%d_%d.jpg' % (src, z, X, Y))


def fetch(a):
    src, z, X, Y = a; fn = tile_path(src, z, X, Y)
    if os.path.exists(fn) and os.path.getsize(fn) > 500: return
    url = (f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{Y}/{X}'
           if src == 'esri' else f'https://mt1.google.com/vt/lyrs=s&x={X}&y={Y}&z={z}')
    for k in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=45).read()
            open(fn, 'wb').write(data); return
        except Exception:
            if k == 3: print('нет тайла', X, Y)


def idx_range(s0, s1):
    i0 = int(np.searchsorted(S, s0 % L)) % M; n = int(round(((s1 - s0) % L or L) / (L / M)))
    return [(i0 + k) % M for k in range(n + 1)]


def main():
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    s0, s1 = float(a[0]), float(a[1])
    src = a[2] if len(a) > 2 else 'google'
    z = int(a[3]) if len(a) > 3 else (20 if src == 'google' else 19)
    st = float(a[4]) if len(a) > 4 else 0.10
    marg = float(a[5]) if len(a) > 5 else 30.0
    ids = idx_range(s0, s1); pts = P[ids]
    d = pts[-1] - pts[0]
    if np.hypot(*d) < 5: d = pts[len(pts) // 2] - pts[0]
    ang = math.atan2(d[1], d[0]); ca, sa = math.cos(ang), math.sin(ang)
    mid = ids[len(ids) // 2]
    vsign = -1.0 if np.dot(np.array([-sa, ca]), R[mid]) > 0 else 1.0      # v растёт ВЛЕВО по ходу

    def to_uv(x, zz):
        dx, dz = x - pts[0][0], zz - pts[0][1]
        return dx * ca + dz * sa, vsign * (-dx * sa + dz * ca)
    uv = np.array([to_uv(*p) for p in pts])
    u0, u1 = uv[:, 0].min() - marg, uv[:, 0].max() + marg
    v0, v1 = uv[:, 1].min() - marg, uv[:, 1].max() + marg
    W, Hh = int((u1 - u0) / st), int((v1 - v0) / st)

    def from_uv(u, v):
        v = v * vsign
        return pts[0][0] + u * ca - v * sa, pts[0][1] + u * sa + v * ca

    def to_px(x, zz):
        u, v = to_uv(x, zz)
        return (u - u0) / st, (v1 - v) / st
    cols = np.arange(W); rows = np.arange(Hh)
    U, V = np.meshgrid(u0 + cols * st, v1 - rows * st)
    Vs = V * vsign
    X = pts[0][0] + U * ca - Vs * sa; Z = pts[0][1] + U * sa + Vs * ca
    lat = O['lat0'] + Z / O['mlat']; lon = O['lon0'] - X / O['mlon']
    n = 256 * 2 ** z
    FX = (lon + 180.0) / 360.0 * n
    FY = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n
    TX, TY = (FX // 256).astype(int), (FY // 256).astype(int)
    need = sorted(set(zip(TX.ravel().tolist(), TY.ravel().tolist())))
    with ThreadPoolExecutor(8) as ex: list(ex.map(fetch, [(src, z, x, y) for x, y in need]))
    out = np.zeros((Hh, W, 3), np.uint8)
    for (x, y) in need:
        fn = tile_path(src, z, x, y)
        try: t = np.asarray(Image.open(fn).convert('RGB'))
        except Exception: continue
        m = (TX == x) & (TY == y)
        out[m] = t[(FY[m] % 256).astype(int), (FX[m] % 256).astype(int)]
    im = Image.fromarray(out); dr = ImageDraw.Draw(im)
    ext = idx_range(s0 - 40, s1 + 40)

    def line_at(off, col, wd=1):
        dr.line([to_px(*(P[i] + R[i] * off)) for i in ext], fill=col, width=wd)
    for sg in (-1, 1):
        dr.line([to_px(*(P[i] + R[i] * sg * HW[i])) for i in ext], fill=(255, 220, 0), width=1)
        for o in OFFS:
            col = (0, 200, 255) if sg < 0 else (255, 80, 200)
            line_at(sg * o, col, 1)
            for fr in (0.15, 0.5, 0.85):
                i = ext[int(len(ext) * fr)]
                x, y = to_px(*(P[i] + R[i] * sg * o))
                dr.text((x + 2, y - 11), str(o), fill=col)
    if '--no-wall' not in sys.argv:
        for key, vk, sg in (('WL', 'VL', -1), ('WR', 'VR', 1)):
            q = [to_px(*(P[i] + R[i] * sg * w[key][i])) for i in ext]
            dr.line(q, fill=(255, 30, 30), width=2)
    bf = os.path.join(HERE, 'barrier.tsv')
    if os.path.exists(bf):
        for l in open(bf):
            if not l.strip() or l.startswith('#'): continue
            f = l.split('\t'); s, sd, off = float(f[0]), f[1], float(f[2])
            i = int(round(s / (L / M))) % M
            if i not in ext: continue
            x, y = to_px(*(P[i] + R[i] * (1 if sd == 'R' else -1) * off))
            dr.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(60, 255, 60), width=2)
    for i in ext:
        s = S[i]
        if (s + 1e-6) % 20 < L / M * 0.999:
            a1 = to_px(*(P[i] - R[i] * 2)); a2 = to_px(*(P[i] + R[i] * 2))
            dr.line([a1, a2], fill=(255, 255, 255), width=2)
            dr.text((a2[0] + 2, a2[1]), '%d' % round(s), fill=(255, 255, 255))
    kf = os.path.join(HERE, 'onboard', 'kadry.tsv')
    for l in open(kf):
        if l.startswith('#'): continue
        f = l.split('\t'); k, s = int(f[0]), float(f[2])
        if k % 2: continue
        i = int(round(s / (L / M))) % M
        if i not in ext: continue
        x, y = to_px(*(P[i] + R[i] * 0))
        dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 140, 0)); dr.text((x - 6, y + 4), str(k), fill=(255, 140, 0))
    os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
    out = os.path.join(HERE, 'plans', 'plan_%s_%d_%d.png' % (src, s0, s1))
    im.save(out); print(out, im.size)


if __name__ == '__main__':
    main()
