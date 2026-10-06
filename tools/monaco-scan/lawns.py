#!/usr/bin/env python3
"""Газоны и кусты вдоль круга Монако — ключ SCENERY_MONACO.lawns (v1.16.54).

    node dump-wall.js            # wall.json — осевая и ПОСТРОЕННЫЙ барьер игры
    python3 lawns.py             # печатает строку lawns:{...} для index.html (вставить вместо блока lawns)
    python3 lawns.py --map       # + plans/lawns_<место>.jpg — газон и кусты поверх снимка (проверка глазом)

Источники (06.10.2026): снимок Google z19 (та же мозаика, что у trees.py) и OSM (osm/all.json.gz).
  * ГАЗОН: в садах и скверах OSM (leisure=park/garden, landuse=grass/meadow/flowerbed) — вся зелень снимка
    (2g−r−b > 18, зелёный канал выше красного и синего), и под кронами тоже: в саду под деревом трава; тени
    закрываются заливкой; вне садов — только гладкая зелень (σ яркости < 14: газон гладкий, кроны и кусты — нет);
    газоны OSM целиком. Минус дома, вода, бассейны и фонтаны, дорожки и дороги OSM (по ширине), площади-пешеходки,
    коридор трассы (построенная стена + 0.5 м, все ноги). Куски меньше LAWN_MIN м² отбрасываются.
    Контур — cv2.findContours (внешний и дыры), упрощение Дугласа–Пекера LAWN_SIMPL м.
  * КУСТЫ: зелень с фактурой (σ ≥ 14) вне крон деревьев (trees из index.html, радиус × BUSH_FREE), вне домов, дорог
    и коридора трассы; кусты — вершины карты расстояний до края такой зелени, радиус 0.6–BUSH_R1 м; плюс живые
    изгороди OSM (barrier=hedge) — куст через 1.2 м. Куст целиком за стеной (от центра до коридора ≥ r + 0.3 м — урок
    v1.16.53, деревья перед стеной) и не дальше BUSH_FAR м от неё.
Что отсеивает игра сама (lawnGeom): над тоннелем, в воде гавани и в море.
"""
import json, math, os, re, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from shapely.geometry import Polygon
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm, trees as T

EXG, EXG_SMOOTH, TEX_SMOOTH = 18, 35, 14
LAWN_MIN, LAWN_SIMPL, HOLE_MIN = 8.0, 0.35, 6.0
BUSH_FREE, BUSH_R1, BUSH_MIN, BUSH_FAR = 0.85, 2.0, 0.6, 60.0
ROADW = {'footway': 1.6, 'path': 1.4, 'steps': 1.8, 'pedestrian': 4, 'service': 4, 'residential': 7, 'tertiary': 8,
         'secondary': 9, 'primary': 10, 'unclassified': 6, 'living_street': 5, 'primary_link': 7, 'secondary_link': 7,
         'raceway': 12, 'platform': 2, 'corridor': 2}


def features(IM):
    r, g, b = [IM[..., i].astype(np.float32) for i in range(3)]
    L = (r + g + b) / 3
    m1 = nd.uniform_filter(L, 9); m2 = nd.uniform_filter(L * L, 9)
    tex = nd.uniform_filter(np.sqrt(np.maximum(m2 - m1 * m1, 0)), 9)
    return r, g, b, L, 2 * g - r - b, tex


def lines(items, sh):
    im = Image.new('L', (sh[1], sh[0]), 0); d = ImageDraw.Draw(im)
    for pts, wd in items:
        if len(pts) > 1:
            W = max(1, int(round(wd / T.MPP))); d.line(pts, fill=1, width=W)
            for p in pts:
                d.ellipse([p[0] - W / 2, p[1] - W / 2, p[0] + W / 2, p[1] + W / 2], fill=1)
    return np.asarray(im).astype(bool)


def corridor(sh, extra=0.5):
    """коридор трассы: построенная стена + extra, все ноги (wall.json)"""
    im = Image.new('L', (sh[1], sh[0]), 0); d = ImageDraw.Draw(im)
    P, R, WL, WR = T.W['P'], T.W['R'], T.W['WL'], T.W['WR']; M = len(P)
    for k in range(M):
        k2 = (k + 1) % M; q = []
        for kk, sg in ((k, -1), (k2, -1), (k2, 1), (k, 1)):
            w = (WL[kk] if sg < 0 else WR[kk]) + extra
            q.append(T.xz2px(P[kk][0] + R[kk][0] * sg * w, P[kk][1] + R[kk][1] * sg * w))
        d.polygon(q, fill=1)
    return np.asarray(im).astype(bool)


def masks(IM):
    r, g, b, L, exg, tex = features(IM); sh = L.shape
    D = osm.load(); N = D['nodes']; W = list(D['ways'].values())
    poly = lambda w: [T.ll2px(*N[n]) for n in w['nodes'] if n in N]
    tg = lambda w, k: w['tags'].get(k)
    blds = T.raster([poly(w) for w in W if 'building' in w['tags'] and tg(w, 'building') != 'roof'], sh)
    isgrass = lambda w: tg(w, 'landuse') in ('grass', 'meadow', 'flowerbed', 'village_green') or tg(w, 'surface') == 'grass'
    parks = T.raster([poly(w) for w in W if tg(w, 'leisure') in ('park', 'garden') or isgrass(w)], sh)
    grass = T.raster([poly(w) for w in W if isgrass(w)], sh)
    water = T.raster([poly(w) for w in W if tg(w, 'leisure') == 'swimming_pool' or tg(w, 'natural') == 'water'
                      or tg(w, 'amenity') == 'fountain'], sh)
    pav = T.raster([poly(w) for w in W if tg(w, 'area') == 'yes' and tg(w, 'highway')], sh)
    roads = lines([(poly(w), ROADW[tg(w, 'highway')]) for w in W if tg(w, 'highway') in ROADW and tg(w, 'area') != 'yes'], sh)
    cor = corridor(sh)
    no = blds | water | roads | pav | cor | ~T.roi_mask(sh)
    green = (exg > EXG) & (g > r) & (g >= b) & (L > 35) & (L < 215)
    smooth = (exg > EXG_SMOOTH) & (tex < TEX_SMOOTH) & (g > r) & (g > b)
    inpark = nd.binary_closing(green & parks, np.ones((15, 15))) & parks          # тени деревьев в саду — тоже газон
    lawn = (inpark | smooth | grass) & ~no
    lawn = nd.binary_opening(lawn, np.ones((5, 5))); lawn = nd.binary_closing(lawn, np.ones((7, 7))) & ~no
    lab, n = nd.label(lawn); sz = nd.sum(lawn, lab, range(1, n + 1)) * T.MPP ** 2
    keep = np.zeros(n + 1, bool); keep[1:] = sz >= LAWN_MIN; lawn = keep[lab]
    # кусты: зелень с фактурой вне крон деревьев
    s = open(os.path.join(HERE, '..', '..', 'index.html')).read(); i = s.index('  trees: [\n'); j = s.index('  ],', i)
    TR = [tuple(map(float, q)) for q in re.findall(r'\[([-\d.]+),([-\d.]+),(\d),([\d.]+),([\d.]+)\]', s[i:j])]
    cm = Image.new('L', (sh[1], sh[0]), 0); d = ImageDraw.Draw(cm)
    for a, bb, k, rr, h in TR:
        x, y = T.ll2px(a, bb); R_ = rr * BUSH_FREE / T.MPP; d.ellipse([x - R_, y - R_, x + R_, y + R_], fill=1)
    crowns = np.asarray(cm).astype(bool)
    shrub = green & (tex >= TEX_SMOOTH) & ~crowns & ~no
    shrub = nd.binary_opening(shrub, np.ones((3, 3)))
    cdt = nd.distance_transform_edt(~cor) * T.MPP                     # до коридора трассы, м
    return lawn, shrub, D, cdt


def bushes(shrub, D, cdt):
    dt = nd.distance_transform_edt(shrub) * T.MPP
    pk = np.argwhere((dt == nd.maximum_filter(dt, size=9)) & (dt >= BUSH_MIN * 0.7))
    v = dt[pk[:, 0], pk[:, 1]]; o = np.argsort(-v); out = []; grid = {}
    for (y, x), d in zip(pk[o], v[o]):
        r = min(BUSH_R1, max(BUSH_MIN, 1.3 * d)); gk = (int(y * T.MPP // 6), int(x * T.MPP // 6)); hit = False
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for (yy, xx, rr) in grid.get((gk[0] + dy, gk[1] + dx), []):
                    if math.hypot(yy - y, xx - x) * T.MPP < 0.8 * (rr + r):
                        hit = True
        if hit:
            continue
        if not (r + 0.3 <= cdt[y, x] <= BUSH_FAR):                    # куст целиком за стеной и не дальше BUSH_FAR
            continue
        out.append((float(x), float(y), r)); grid.setdefault(gk, []).append((y, x, r))
    N = D['nodes']
    for w in D['ways'].values():                                     # живые изгороди OSM — куст через 1.2 м
        if w['tags'].get('barrier') != 'hedge':
            continue
        pts = [T.xz(*N[n]) for n in w['nodes'] if n in N]
        for a, b in zip(pts, pts[1:]):
            Lg = math.dist(a, b); m = max(1, round(Lg / 1.2))
            for j in range(m):
                x, z = a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m
                px, py = T.xz2px(x, z)
                if 0 <= int(py) < shrub.shape[0] and 0 <= int(px) < shrub.shape[1] and 1.0 <= cdt[int(py), int(px)] <= BUSH_FAR:
                    out.append((px, py, 0.7))
    return out


def contours(lawn):
    cs, hier = cv2.findContours(lawn.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    if hier is None:
        return out
    hier = hier[0]
    tom = lambda c: [T.xz(*T.px2ll(float(p[0][0]) + 0.5, float(p[0][1]) + 0.5)) for p in c]
    for i, c in enumerate(cs):
        if hier[i][3] != -1 or len(c) < 3:
            continue
        holes = []; j = hier[i][2]
        while j != -1:
            if len(cs[j]) >= 3:
                holes.append(tom(cs[j]))
            j = hier[j][0]
        g = Polygon(tom(c), [h for h in holes if Polygon(h).area >= HOLE_MIN]).buffer(0).simplify(LAWN_SIMPL)
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p.area >= LAWN_MIN:
                out.append(p)
    return out


def fmt(pts):
    return '[' + ','.join('%.6f,%.6f' % T.ll(x, z) for x, z in pts) + ']'


def main():
    IM = T.mosaic()
    lawn, shrub, D, cdt = masks(IM)
    P = contours(lawn); B = bushes(shrub, D, cdt)
    A = sum(p.area for p in P); nv = sum(len(p.exterior.coords) + sum(len(h.coords) for h in p.interiors) for p in P)
    print('# газон: %d кусков, %.0f м², %d вершин; кустов %d' % (len(P), A, nv, len(B)), file=sys.stderr)
    if '--map' in sys.argv:
        draw(IM, lawn, B)
    print("  /* Газоны и кусты (v1.16.54) — строку считает tools/monaco-scan/lawns.py: снимок Google z19 и OSM. grass — газоны:")
    print("     [внешний контур, дыра, дыра…], контур — плоский список широта,долгота; bush — [широта, долгота, радиус м]. */")
    print("  lawns: {")
    print("    grass: [")
    for p in sorted(P, key=lambda p: (round(p.centroid.y), p.centroid.x)):
        ext = list(p.exterior.coords)[:-1]
        if p.exterior.is_ccw:
            ext = ext[::-1]
        print('      [' + ','.join([fmt(ext)] + [fmt(list(h.coords)[:-1]) for h in p.interiors]) + '],')
    print("    ],")
    print("    bush: [")
    rows = sorted([(*T.px2ll(x, y), r) for x, y, r in B], key=lambda t: (round(t[0], 4), t[1])); line = []
    for la, lo, r in rows:
        line.append('[%.6f,%.6f,%.1f]' % (la, lo, r))
        if len(line) == 10:
            print('      ' + ','.join(line) + ','); line = []
    if line:
        print('      ' + ','.join(line) + ',')
    print("    ],")
    print("  },")


def draw(IM, lawn, B):
    os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
    IM8 = IM.astype(np.uint8)
    for name, (x, z, h) in {'spelugues': (-285, 390, 70), 'boulingrins': (-100, 360, 80), 'tabac': (95, 35, 50),
                            'casino': (-200, 200, 80), 'acclim': (-230, 250, 90), 'devote': (300, 20, 60), 'pit': (150, -300, 90)}.items():
        cx, cy = T.xz2px(x, z); H = int(h / T.MPP); x0, y0 = int(cx - H), int(cy - H)
        a = IM8[y0:y0 + 2 * H, x0:x0 + 2 * H].copy(); mm = lawn[y0:y0 + 2 * H, x0:x0 + 2 * H]
        o = a.copy(); o[mm] = (o[mm] * 0.45 + np.array([255, 0, 255]) * 0.55).astype(np.uint8)
        im = Image.fromarray(o); d = ImageDraw.Draw(im)
        for bx, by, r in B:
            R = r / T.MPP; X, Y = bx - x0, by - y0
            if 0 <= X < 2 * H and 0 <= Y < 2 * H:
                d.ellipse([X - R, Y - R, X + R, Y + R], outline=(0, 255, 255), width=2)
        Image.fromarray(np.concatenate([a, np.asarray(im)], 1)).resize((1400, 700)).save(
            os.path.join(HERE, 'plans', 'lawns_%s.jpg' % name), quality=85)


if __name__ == '__main__':
    main()
