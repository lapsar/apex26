#!/usr/bin/env python3
"""СНИМОК ВИДА СВЕРХУ С КОЛЬЦАМИ ОТСТУПА — для поворотов, где полоса strip.py
складывается (отступ больше радиуса поворота).

Кадр повёрнут так, что участок S0..S1 идёт слева направо (левая сторона по ходу
сверху), масштаб одинаковый по обеим осям. Поверх снимка:
  жёлтое      — кромка полотна игры (±half);
  голубое     — линии отступа СЛЕВА через 5 м (5, 10, 15 ... от кромки? нет —
                от ОСЕВОЙ: 10, 15, 20, 25, 30 м), подписаны числом;
  розовое     — то же СПРАВА;
  белые метки — S через 20 м по осевой.

    python3 plan.py 560 720                 # goog z20, 0.12 м/пкс
    python3 plan.py 560 720 esri 19 0.2 30  # снимок, зум, м/пкс, поле вокруг, м
    -> plan_<src>_<S0>_<S1>.png (в .gitignore)
"""
import json, math, os, sys
from PIL import Image, ImageDraw
import numpy as np
from unroll import Mosaic, game2deg, deg2px

HERE = os.path.dirname(os.path.abspath(__file__))
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
P = np.array(cl['P']); R = np.array(cl['R']); S = np.array(cl['S']); L = cl['len']; HALF = cl['half']
M = len(S)
OFFS = (8, 10, 12, 15, 20, 25, 30, 40)


def idx_range(s0, s1):
    i0 = int(np.searchsorted(S, s0 % L)); n = int(round(((s1 - s0) % L or L) / (L / M)))
    return [(i0 + k) % M for k in range(n + 1)]


def main():
    a = sys.argv[1:]
    s0, s1 = float(a[0]), float(a[1])
    src = a[2] if len(a) > 2 else 'goog'
    z = int(a[3]) if len(a) > 3 else (20 if src == 'goog' else 19)
    st = float(a[4]) if len(a) > 4 else 0.12
    marg = float(a[5]) if len(a) > 5 else 35.0
    ids = idx_range(s0, s1)
    pts = P[ids]
    d = pts[-1] - pts[0]; ang = math.atan2(d[1], d[0])
    ca, sa = math.cos(ang), math.sin(ang)
    # локальные оси кадра: u вдоль участка, v — «влево по ходу» вверх
    # R — вправо по ходу; ищем, какой знак перпендикуляра смотрит влево
    mid = ids[len(ids) // 2]
    perp = np.array([-sa, ca])
    vsign = -1.0 if np.dot(perp, R[mid]) > 0 else 1.0      # v растёт ВЛЕВО по ходу
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
    mo = Mosaic(src, z)
    need = set()
    for gu in np.linspace(u0, u1, 12):
        for gv in np.linspace(v0, v1, 12):
            fx, fy = deg2px(*game2deg(*from_uv(gu, gv)), z)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    need.add((int(fx // 256) + dx, int(fy // 256) + dy))
    mo.need(sorted(need))
    im = Image.new('RGB', (W, Hh)); px = im.load()
    for c in range(W):
        for r in range(Hh):
            fx, fy = deg2px(*game2deg(*from_uv(u0 + c * st, v1 - r * st)), z)
            px[c, r] = mo.pixel(fx, fy)
    dr = ImageDraw.Draw(im)
    ext = idx_range(s0 - 40, s1 + 40)
    def line_at(off, col, w=1):
        q = [to_px(*(P[i] + R[i] * off)) for i in ext]
        dr.line(q, fill=col, width=w)
    for sg in (-1, 1):
        line_at(sg * HALF, (255, 220, 0), 1)
        for o in OFFS:
            line_at(sg * o, (0, 200, 255) if sg < 0 else (255, 80, 200), 1)
            for fr in (0.2, 0.5, 0.8):
                i = ext[int(len(ext) * fr)]
                x, y = to_px(*(P[i] + R[i] * sg * o))
                dr.text((x + 2, y - 11), str(o), fill=(0, 200, 255) if sg < 0 else (255, 80, 200))
    wf = os.path.join(HERE, 'wall.json')                    # построенный барьер (dump-wall.js) — красным
    if os.path.exists(wf) and '--no-wall' not in sys.argv:
        w = json.load(open(wf))
        for key, sg in (('WL', -1), ('WR', 1)):
            q = [to_px(*(P[i] + R[i] * sg * w[key][i])) for i in ext]
            dr.line(q, fill=(255, 30, 30), width=3)
    for i in ext:
        s = S[i]
        if abs((s + 1e-6) % 20) < L / M * 0.51 or abs(s % 20 - 20) < L / M * 0.51:
            a1 = to_px(*(P[i] - R[i] * 2)); a2 = to_px(*(P[i] + R[i] * 2))
            dr.line([a1, a2], fill=(255, 255, 255), width=2)
            dr.text((a2[0] + 2, a2[1]), '%d' % round(s), fill=(255, 255, 255))
    out = os.path.join(HERE, 'plan_%s_%d_%d.png' % (src, s0, s1))
    im.save(out)
    print(out, im.size)


if __name__ == '__main__':
    main()
