#!/usr/bin/env python3
"""Схема НАШИХ трибун — чтобы класть рядом с официальной схемой трассы.

Рисуется в географических координатах (север сверху, восток справа), а не
в игровых: игровые отражены по X, и при сравнении с реальной схемой это
первая ловушка проекта (§7 CLAUDE.md). Трибуны берутся прямо из разметки
внутри index.html, а не из отдельного файла, — чтобы карта не разошлась
с игрой.

  python3 map-plan.py [файл.png] [ширина_пкс]
"""
import json, math, os, re, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(HERE, '..', '..', 'index.html')
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
P = np.array(cl['P']); R = np.array(cl['R']); S = np.array(cl['S']); M = len(P)


def objects():
    """Вынуть objects[] из разметки Монреаля внутри index.html."""
    src = open(GAME, encoding='utf-8').read()
    i = src.index('const SCENERY_MONTREAL')
    j = src.index('objects: [', i)
    k = src.index('  ],', j)
    out = []
    for line in src[j:k].splitlines():
        line = line.strip()
        if not line.startswith('{kind:'):
            continue
        g = lambda k_, d=None: (lambda m: float(m.group(1)) if m else d)(re.search(k_ + r':(-?[\d.]+)', line))
        out.append(dict(
            kind=re.search(r"kind:'([^']+)'", line).group(1),
            shape=re.search(r"shape:'([^']+)'", line).group(1),
            name=re.search(r"name:'([^']*)'", line).group(1),
            side=re.search(r"side:'([^']+)'", line).group(1),
            off=g('off'), d=g('d'), w=g('w'), fromS=g('fromS'), toS=g('toS'), atS=g('atS')))
    return out


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'plan-stands.png'
    W = int(sys.argv[2]) if len(sys.argv) > 2 else 1900

    # Метры «как на местности»: X на восток, Y на север. Игровой X отражён,
    # поэтому восток = -X_игры. Потом всё поворачивается так, чтобы длинная ось
    # круга легла горизонтально, шпилька слева — как на официальной схеме.
    E = -P[:, 0]; N = P[:, 1]
    i_hp = int(np.argmin(np.abs(S - 2696)))
    ang = math.atan2(N[0] - N[i_hp], E[0] - E[i_hp])     # от шпильки к линии старта
    ca, sa = math.cos(-ang), math.sin(-ang)
    rot = lambda e, n: (e * ca - n * sa, e * sa + n * ca)
    rx, ry = rot(E, N)
    pad = 70.0
    x0, x1 = rx.min() - pad, rx.max() + pad
    y0, y1 = ry.min() - pad, ry.max() + pad
    sc = W / (x1 - x0)
    H = int((y1 - y0) * sc)
    im = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    def to_xy(e, n):
        a, b = rot(e, n)
        return ((a - x0) * sc, H - (b - y0) * sc)
    to = lambda la, lo: to_xy(-(lo - O['lon0']) * O['mlon'] * -1, (la - O['lat0']) * 110540.0)
    lat = O['lat0'] + P[:, 1] / 110540.0
    lon = O['lon0'] - P[:, 0] / O['mlon']
    pt = lambda i, off, sgn: to_xy(-(P[i][0] + R[i][0] * sgn * off), P[i][1] + R[i][1] * sgn * off)

    d.line([to_xy(-P[i][0], P[i][1]) for i in range(M)] + [to_xy(-P[0][0], P[0][1])], fill=(40, 40, 40), width=5)
    i0 = 0
    a, b = pt(i0, -12, 1), pt(i0, 12, 1)
    d.line([a, b], fill=(0, 0, 0), width=6)
    d.text((a[0] + 6, a[1] - 16), 'СТАРТ/ФИНИШ', fill=(0, 0, 0))

    for o in objects():
        if o['kind'] != 'grandstand':
            continue
        sgn = 1 if o['side'] == 'R' else -1
        near, far = o['off'], o['off'] + o['d']
        if o['shape'] == 'arc':
            idx = [i for i in range(M) if (o['fromS'] <= S[i] <= o['toS'] if o['fromS'] <= o['toS']
                                           else (S[i] >= o['fromS'] or S[i] <= o['toS']))]
            idx.sort(key=lambda i: (S[i] - o['fromS']) % S[-1])
            poly = [pt(i, near, sgn) for i in idx] + [pt(i, far, sgn) for i in reversed(idx)]
        else:
            i = int(np.argmin(np.abs(S - o['atS'])))
            j = int(np.argmin(np.abs(S - (o['atS'] + o['w'] / 2))))
            k = int(np.argmin(np.abs(S - (o['atS'] - o['w'] / 2))))
            poly = [pt(k, near, sgn), pt(j, near, sgn), pt(j, far, sgn), pt(k, far, sgn)]
        d.polygon(poly, fill=(250, 205, 60), outline=(120, 90, 0))
        cx = sum(p[0] for p in poly) / len(poly); cy = sum(p[1] for p in poly) / len(poly)
        nm = o['name'].split('(')[0].strip()
        d.text((cx - 4 * len(nm) / 2, cy - 6), nm, fill=(0, 0, 0))
    im.save(os.path.join(HERE, out))
    print(f"{out}: {im.size}, север сверху — так же, как на официальной схеме")


if __name__ == '__main__':
    main()
