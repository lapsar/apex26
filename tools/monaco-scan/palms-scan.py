#!/usr/bin/env python3
"""Кандидаты в пальмы для ручной разметки — то, из чего собран palms.tsv (v1.16.54).

    python3 palms-scan.py          # plans/palms_<квадрат>.jpg — квадраты 60 м снимка Google z20 с сеткой в метрах игры
                                   # и пронумерованными кандидатами; plans/palms_cands.json — кандидаты
    python3 palms-scan.py --tsv    # palms.tsv заново из plans/palms_cands.json и palms-review.json (решения глазом)

Где ищем: сады и скверы OSM (leisure=park/garden) ближе 70 м к трассе (SAFE) и круг 40 м у Сент-Девот — внутри 130 м
от осевой. Кандидат — пятно светлой зелени с резкой фактурой (яркость > 98, g − (r+b)/2 > 18, σ яркости > 36 в окне 9 пкс,
3–60 м²): у пальмы светлые листья-лучи на тени, у лиственной кроны фактура мягче, у газона нет. Автомат и даёт кандидатов,
и путается (кусты в кадках, светлые кроны) — каждый квадрат просмотрен глазом: palms-review.json — {квадрат: {keep: номера
верных кандидатов, add: [пиксели картинки 1100×1100] пропущенных пальм}}. Площадь Казино — отдельно: прежние звёзды
мостовой (trees.py до v1.16.54) просмотрены так же (CASINO_KEEP), плюс две пропущенные.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd
from shapely.geometry import Polygon, Point, LineString, box
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import trees as T, tiles, osm

Z = 20
MPP = 156543.03392 * math.cos(math.radians(43.737)) / 2 ** Z
SQ, PIC = 60, 1100                          # квадрат, м; картинка, пкс
PARKS = ['159170538', '447008630', '572937725', '572937726', '1388331348', '157719659', '432751852', '627162482', '157719660']
DEVOTE = (290.7, 13.6, 40)                  # сквер и склон у Сент-Девот (онбоард, кадры 300–304), м игры
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
# Площадь Казино: из 33 «звёзд мостовой» (trees.py до v1.16.54) пальмы — эти номера (по порядку строк trees в index.html
# v1.16.53, отбор по зоне площади); остальные — кусты в кадках, светлая мостовая; две пропущенные — CASINO_ADD (м игры).
CASINO_KEEP = [0, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 14, 15, 16, 17, 22, 23, 26, 27]
CASINO_ADD = [(-150 - 568 / (1100 / 75), 300 - 565 / (1100 / 75)), (-150 - 655 / (1100 / 75), 300 - 622 / (1100 / 75))]   # пиксели листа 75 м


def mosaic(x0, z0, size):
    (la1, lo1), (la2, lo2) = T.ll(x0, z0), T.ll(x0 - size, z0 - size)
    X1f, Y1f = tiles.deg2num(la1, lo1, Z); X2f, Y2f = tiles.deg2num(la2, lo2, Z)
    im = Image.new('RGB', ((int(X2f) - int(X1f) + 1) * 256, (int(Y2f) - int(Y1f) + 1) * 256))
    for X in range(int(X1f), int(X2f) + 1):
        for Y in range(int(Y1f), int(Y2f) + 1):
            tiles.tile(X, Y, 'google', Z)
            im.paste(Image.open(os.path.join(tiles.TD, 'google_%d_%d_%d.jpg' % (Z, X, Y))), ((X - int(X1f)) * 256, (Y - int(Y1f)) * 256))

    def px(x, zz):
        a, b = T.ll(x, zz); X, Y = tiles.deg2num(a, b, Z); return ((X - int(X1f)) * 256, (Y - int(Y1f)) * 256)

    def inv(px_, py_):
        n = 2 ** Z; lon = ((px_ / 256) + int(X1f)) / n * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * ((py_ / 256) + int(Y1f)) / n))))
        return T.xz(lat, lon)
    return im, px, inv


def cands(x0, z0, size):
    im, px, inv = mosaic(x0, z0, size); A = np.asarray(im).astype(float)
    r, g, b = A[..., 0], A[..., 1], A[..., 2]; L = A.mean(-1)
    m1 = nd.uniform_filter(L, 9); m2 = nd.uniform_filter(L * L, 9); tex = np.sqrt(np.maximum(m2 - m1 * m1, 0))
    m = (L > 98) & (g - (r + b) / 2 > 18) & (tex > 36)
    m = nd.binary_closing(m, np.ones((7, 7))); m = nd.binary_opening(m, np.ones((9, 9)))
    lab, n = nd.label(m); out = []
    for i, s in enumerate(nd.find_objects(lab)):
        comp = lab[s] == i + 1; Ar = comp.sum() * MPP ** 2
        if not (3 <= Ar <= 60):
            continue
        cy, cx = nd.center_of_mass(comp); X, Zz = inv(s[1].start + cx, s[0].start + cy)
        if x0 - size <= X <= x0 and z0 - size <= Zz <= z0:
            out.append((X, Zz, Ar))
    return out


def sheet(name, x0, z0, marks, polys):
    im, px, inv = mosaic(x0, z0, SQ)
    ox, oy = px(x0, z0); w, h = px(x0 - SQ, z0 - SQ)
    im = im.crop((int(ox), int(oy), int(w), int(h))).resize((PIC, PIC))
    sc = PIC / (w - ox); d = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, 22)
    P = lambda x, zz: ((px(x, zz)[0] - ox) * sc, (px(x, zz)[1] - oy) * sc)
    for k in range(0, SQ + 1, 5):
        c = (255, 255, 255) if k % 10 == 0 else (160, 160, 160)
        d.line([P(x0 - k, z0), P(x0 - k, z0 - SQ)], fill=c); d.line([P(x0, z0 - k), P(x0 - SQ, z0 - k)], fill=c)
        if k % 10 == 0:
            d.text((P(x0 - k, z0)[0] + 2, 2), '%d' % (x0 - k), fill=(255, 255, 0), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
            d.text((2, P(x0, z0 - k)[1] + 2), '%d' % (z0 - k), fill=(255, 255, 0), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
    d.line([P(*p) for p in T.P], fill=(255, 255, 0), width=2)
    for pl in polys:
        d.line([P(*p) for p in pl] + [P(*pl[0])], fill=(0, 140, 255), width=2)
    for q, m in enumerate(marks):
        X, Y = P(m[0], m[1]); d.ellipse([X - 7, Y - 7, X + 7, Y + 7], outline=(0, 255, 255), width=3)
        d.text((X + 9, Y - 12), str(q), fill=(0, 255, 255), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
    im.save(os.path.join(HERE, 'plans', 'palms_%s.jpg' % name), quality=88)


def zone():
    D = osm.load(); N = D['nodes']
    U = [Polygon([T.xz(*N[n]) for n in D['ways'][k]['nodes'] if n in N]).buffer(4) for k in PARKS]
    U.append(Point(DEVOTE[0], DEVOTE[1]).buffer(DEVOTE[2]))
    return unary_union(U).intersection(LineString(T.P + [T.P[0]]).buffer(130))


def scan():
    os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
    UU = zone(); x0, z0, x1, z1 = UU.bounds; out = {}
    polys = [list(g.exterior.coords) for g in (UU.geoms if hasattr(UU, 'geoms') else [UU])]
    for X in range(int(math.ceil(x1 / SQ)) * SQ, int(math.floor(x0 / SQ)) * SQ, -SQ):
        for Zz in range(int(math.ceil(z1 / SQ)) * SQ, int(math.floor(z0 / SQ)) * SQ, -SQ):
            if box(X - SQ, Zz - SQ, X, Zz).intersection(UU).area < 30:
                continue
            c = [q for q in cands(X, Zz, SQ) if UU.contains(Point(q[0], q[1]))]
            name = 's_%d_%d' % (X, Zz); out[name] = dict(x0=X, z0=Zz, c=c)
            sheet(name, X, Zz, c, polys)
            print(name, len(c), file=sys.stderr)
    json.dump(out, open(os.path.join(HERE, 'plans', 'palms_cands.json'), 'w'))


def tsv(casino):
    C = json.load(open(os.path.join(HERE, 'plans', 'palms_cands.json'))); R = json.load(open(os.path.join(HERE, 'palms-review.json')))
    rows, sc = [], PIC / SQ
    for k, v in C.items():
        for i in R[k]['keep']:
            rows.append((v['c'][i][0], v['c'][i][1], k, 'авто+глаз'))
        for px_, py_ in R[k]['add']:
            rows.append((v['x0'] - px_ / sc, v['z0'] - py_ / sc, k, 'глаз'))
    for i in CASINO_KEEP:
        rows.append((casino[i][0], casino[i][1], 'casino', 'звезда+глаз'))
    for x, z in CASINO_ADD:
        rows.append((x, z, 'casino', 'глаз'))
    out = []
    for r in rows:
        if all((r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 > 4 for q in out):
            out.append(r)
    with open(os.path.join(HERE, 'palms.tsv'), 'w') as f:
        f.write('# Пальмы Монако по месту (v1.16.54): снимок Google z20, каждая проверена глазом (palms-scan.py, README.md «Пальмы»).\n')
        f.write('# широта\tдолгота\tквадрат разметки\tкак найдена\n')
        for x, z, k, how in sorted(out, key=lambda r: (round(r[1]), r[0])):
            la, lo = T.ll(x, z); f.write('%.6f\t%.6f\t%s\t%s\n' % (la, lo, k, how))
    print('palms.tsv: %d' % len(out), file=sys.stderr)


if __name__ == '__main__':
    if '--tsv' in sys.argv:
        # звёзды мостовой площади Казино — из архивной сборки v1.16.53 (их больше нигде нет)
        import re
        s = open(os.path.join(HERE, '..', '..', 'archive', 'v1.16.53.html')).read(); i = s.index('  trees: [\n'); j = s.index('  ],', i)
        TR = [tuple(map(float, q)) for q in re.findall(r'\[([-\d.]+),([-\d.]+),(\d),([\d.]+),([\d.]+)\]', s[i:j])]
        Zc = Polygon([T.xz(43.739707, 7.427227), T.xz(43.739707, 7.427911), T.xz(43.739436, 7.428097), T.xz(43.739164, 7.427911),
                      T.xz(43.739191, 7.427538), T.xz(43.739409, 7.427252)]).buffer(3)
        tsv([T.xz(a, b) for a, b, k, r, h in TR if k == 2 and Zc.contains(Point(*T.xz(a, b)))])
    else:
        scan()
