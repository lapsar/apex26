#!/usr/bin/env python3
"""Деревья вдоль круга Монако — строка SCENERY_MONACO.trees (v1.16.42).

    node dump-wall.js            # wall.json — осевая и ПОСТРОЕННЫЙ барьер игры
    python3 trees.py             # печатает строку trees:[...] для index.html (вставить вместо блока trees)
    python3 trees.py --map       # + plans/trees_<место>.jpg — кроны и пальмы поверх снимка (проверка глазом)

Источники (05.10.2026):
  * снимок Google z19 (0.22 м/пкс, tiles.py) — КРОНЫ: зелень (2g−r−b > 18, яркость < 150) с фактурой (σ яркости в окне 5 м
    ≥ 12 — газон и вода гладкие), минус дома OSM (сады на крышах), ближе ROI м к осевой; кроны — вершины карты расстояний
    до края зелени (радиус = 1.25 × расстояние + 0.4, не больше 7.5 м), затем ещё два прохода по непокрытому остатку;
  * OSM natural=tree (561 точка в рамке, тайлы API 0.6 — osm/trees.json; в osm/all.json теги узлов не хранятся) и
    natural=tree_row — ствол там, где он в OSM: крона снимка, накрывшая точку OSM, переезжает на неё;
    leaf_type=needleleaved — пиния (зонтичная крона);
  * ПАЛЬМЫ — светло-зелёные звёзды на мостовой (g − (r+b)/2 > 6, 0.6–14 м²) в зонах PALM_ZONES, сверенных по снимку,
    онбоарду 2025 и Street View; кроны лиственных их не видят (тонкие листья съедает очистка маски).
Высота — по радиусу кроны (снимок высоты не знает): лиственное 1.6r+3 (5–16 м), пиния 1.6r+6, пальма 4r (7–13 м).
Что отсеивает игра сама (treesSetup / treeGeom): ствол на полотне и у стены, в доме, в следе трибуны, над тоннелем, в воде.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm, tiles

Image.MAX_IMAGE_PIXELS = None
LAT0, LON0, MLON = 43.737145229, 7.425286371, 80430.825145   # SCEN_ORIGIN.Monaco
Z = 19
ROI = 130            # м от осевой: дальше деревья закрывают дома и гребень склона
EXG, BR, TEX = 18, 150, 12
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, S = W['P'], W['S']
MPP = 156543.03392 * math.cos(math.radians(LAT0)) / 2 ** Z
# Пальмы: зона, где светлые звёзды на мостовой — пальмы (площадь Казино, снимок z19: ~25 штук). [широта, долгота] по кругу.
PALM_ZONES = {'Place du Casino': [[43.739707, 7.427227], [43.739707, 7.427911], [43.739436, 7.428097], [43.739164, 7.427911],
                                  [43.739191, 7.427538], [43.739409, 7.427252]]}
# Сады, где среди лиственных пальмы (Street View 2021–2024, онбоард 2025 — кадры 300–304 у Сент-Девот): снимок их не отличает
# от крон — доля SHARE небольших крон (r ≤ 3.2 м) становится пальмами, выбор по координатам (без случайности).
# (широта, долгота, радиус м, доля)
PALM_MIX = {'Sainte-Devote': (43.737268, 7.421672, 40, 0.5), 'Mirabeau': (43.740466, 7.428642, 70, 0.3),
            'Casino gardens': (43.738441, 7.428071, 45, 0.4)}
PINE_NEAR = 12       # м: крона снимка ближе к пинии OSM — тоже пиния (пит-прямая, Табак, Ноге — Street View: ряды пиний)


def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
def ll(x, z): return (LAT0 + z / 110540, LON0 - x / MLON)


ll_ = [ll(*p) for p in P]
LA0, LA1 = min(a for a, b in ll_) - 0.0014, max(a for a, b in ll_) + 0.0014
LO0, LO1 = min(b for a, b in ll_) - 0.0019, max(b for a, b in ll_) + 0.0019
_x0, _y1 = tiles.deg2num(LA0, LO0, Z); _x1, _y0 = tiles.deg2num(LA1, LO1, Z)
X0, X1, Y0, Y1 = int(_x0), int(_x1), int(_y0), int(_y1)


def ll2px(lat, lon):
    xt, yt = tiles.deg2num(lat, lon, Z); return ((xt - X0) * 256, (yt - Y0) * 256)


def px2ll(px, py):
    n = 2 ** Z; lon = (px / 256 + X0) / n * 360 - 180
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (py / 256 + Y0) / n)))), lon


def xz2px(x, z): return ll2px(*ll(x, z))


def mosaic():
    im = Image.new('RGB', ((X1 - X0 + 1) * 256, (Y1 - Y0 + 1) * 256))
    for X in range(X0, X1 + 1):
        for Y in range(Y0, Y1 + 1):
            tiles.tile(X, Y, 'google', Z)
            im.paste(Image.open(os.path.join(tiles.TD, 'google_%d_%d_%d.jpg' % (Z, X, Y))), ((X - X0) * 256, (Y - Y0) * 256))
    return np.asarray(im).astype(np.int16)


def raster(polys, shape, width=0):
    m = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(m)
    for p in polys:
        if len(p) >= 3:
            d.polygon(p, fill=1)
    return np.asarray(m).astype(bool)


def roi_mask(shape):
    m = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(m)
    pts = [xz2px(*p) for p in P]; r = ROI / MPP
    d.line(pts + [pts[0]], fill=1, width=int(2 * r))
    for p in pts:
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=1)
    return np.asarray(m).astype(bool)


def crowns(m):
    """кроны: вершины карты расстояний, крупные первыми; две добавки по непокрытому остатку"""
    out, grid = [], {}

    def near(y, x, r):
        gy, gx = int(y * MPP // 10), int(x * MPP // 10)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for (yy, xx, rr) in grid.get((gy + dy, gx + dx), []):
                    if math.hypot(yy - y, xx - x) * MPP < 0.8 * (rr + r):
                        return True
        return False
    rest = m.copy()
    for rnd in range(3):
        dt = nd.distance_transform_edt(rest) * MPP
        pk = np.argwhere((dt == nd.maximum_filter(dt, size=15)) & (dt >= (1.2 if rnd == 0 else 1.0)))
        v = dt[pk[:, 0], pk[:, 1]]; o = np.argsort(-v)
        for (y, x), d in zip(pk[o], v[o]):
            r = min(1.25 * d + 0.4, 7.5)
            if near(y, x, r):
                continue
            out.append((float(x), float(y), r)); grid.setdefault((int(y * MPP // 10), int(x * MPP // 10)), []).append((y, x, r))
        cov = Image.new('L', (m.shape[1], m.shape[0]), 0); dr = ImageDraw.Draw(cov)
        for x, y, r in out:
            R = r / MPP * 0.9; dr.ellipse([x - R, y - R, x + R, y + R], fill=1)
        rest = m & ~np.asarray(cov).astype(bool)
        rest = nd.binary_opening(rest, structure=np.ones((7, 7)))
    return out


def palms(IM, zones, block):
    a = IM.astype(float); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    zm = raster([[ll2px(*q) for q in z] for z in zones.values()], IM.shape)
    m = (g - (r + b) / 2 > 6) & (g > 80) & zm & ~block
    m = nd.binary_closing(m, np.ones((3, 3)))
    lab, n = nd.label(m); out = []
    for i, s in enumerate(nd.find_objects(lab)):
        comp = lab[s] == i + 1; A = comp.sum() * MPP ** 2
        if not (0.6 <= A <= 14):
            continue
        cy, cx = nd.center_of_mass(comp)
        out.append((s[1].start + cx, s[0].start + cy, A))
    return out


def osm_trees():
    T = json.load(open(os.path.join(HERE, 'osm', 'trees.json')))
    D = osm.load(); N = D['nodes']; rows = []
    for k, (la, lo, t) in T['nodes'].items():
        rows.append((la, lo, t.get('leaf_type', '')))
    for w in D['ways'].values():                                    # ряды деревьев — ствол через 8 м
        if w['tags'].get('natural') != 'tree_row':
            continue
        pts = [xz(*N[n]) for n in w['nodes'] if n in N]
        for a, b in zip(pts, pts[1:]):
            L = math.dist(a, b); m = max(1, round(L / 8))
            for j in range(m):
                rows.append((*ll(a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m), w['tags'].get('leaf_type', '')))
    return rows


def main():
    IM = mosaic()
    r, g, b = IM[..., 0], IM[..., 1], IM[..., 2]
    L = IM.mean(-1).astype(float)
    m1 = nd.uniform_filter(L, 9); m2 = nd.uniform_filter(L * L, 9)
    tex = nd.uniform_filter(np.sqrt(np.maximum(m2 - m1 * m1, 0)), 25)
    D = osm.load(); N = D['nodes']
    blds = [[ll2px(*N[n]) for n in w['nodes'] if n in N] for w in D['ways'].values()
            if 'building' in w['tags'] and w['tags'].get('building') != 'roof']
    bm = raster(blds, IM.shape)
    roi = roi_mask(IM.shape)
    m = (2 * g - r - b > EXG) & ((r + g + b) / 3 < BR) & (tex >= TEX) & ~bm & roi
    m = nd.binary_opening(m, structure=np.ones((5, 5)))
    m = nd.binary_closing(m, structure=np.ones((9, 9)))
    m = nd.binary_fill_holes(m)
    m = nd.binary_opening(m, structure=np.ones((7, 7)))
    C = crowns(m)
    print('# кроны снимка: %d, зелень %.0f м² в %d м от осевой' % (len(C), m.sum() * MPP ** 2, ROI), file=sys.stderr)

    # OSM: ствол по OSM, крона снимка переезжает на него
    O = []
    for la, lo, lt in osm_trees():
        x, y = ll2px(la, lo)
        if not (0 <= int(y) < IM.shape[0] and 0 <= int(x) < IM.shape[1]) or not roi[int(y), int(x)]:
            continue
        O.append([x, y, lt])
    used = [[] for _ in C]
    free = []
    for i, (x, y, lt) in enumerate(O):
        best = None
        for j, (cx, cy, cr) in enumerate(C):
            d = math.hypot(cx - x, cy - y) * MPP
            if d < cr * 0.9 and (best is None or d < best[0]):
                best = (d, j)
        if best:
            used[best[1]].append(i)
        else:
            free.append(i)
    T = []                                                          # (px, py, вид, r крона, h)
    for j, (cx, cy, cr) in enumerate(C):
        if not used[j]:
            T.append([cx, cy, 0, cr])
            continue
        n = len(used[j])
        for i in used[j]:
            T.append([O[i][0], O[i][1], 1 if O[i][2] == 'needleleaved' else 0, max(2.0, cr / math.sqrt(n))])
    # пальмы по снимку; дерево OSM вне крон рядом с пальмой — та же пальма
    block = bm | m
    PL = palms(IM, PALM_ZONES, block) if PALM_ZONES else []
    for x, y, A in PL:
        T.append([x, y, 2, max(1.8, min(3.5, math.sqrt(A / math.pi) * 1.6))])
    for i in free:
        x, y, lt = O[i]
        if any(math.hypot(p[0] - x, p[1] - y) * MPP < 2.5 for p in PL):
            continue
        T.append([x, y, 1 if lt == 'needleleaved' else 0, 2.4])      # молодое уличное дерево: кроны на снимке не набралось
    pines = [(O[i][0], O[i][1]) for i in range(len(O)) if O[i][2] == 'needleleaved']
    for t in T:                                                     # ряды пиний: соседние кроны снимка — пинии
        if t[2] == 0 and t[3] >= 2.5 and any(math.hypot(px - t[0], py - t[1]) * MPP < PINE_NEAR for px, py in pines):
            t[2] = 1
    for name, (la, lo, rad, share) in PALM_MIX.items():
        cx, cy = ll2px(la, lo)
        for t in T:
            if t[2] == 0 and t[3] <= 3.2 and math.hypot(t[0] - cx, t[1] - cy) * MPP < rad:
                a, b = px2ll(t[0], t[1])
                if int(round(a * 1e6) + round(b * 1e6)) * 7919 % 100 < share * 100:
                    t[2] = 2; t[3] = max(1.8, min(3.5, t[3]))
    print('# OSM: %d в %d м, из них в кронах снимка %d, отдельно %d; пальм на площади %d; всего %d: лиственных %d, пиний %d, пальм %d'
          % (len(O), ROI, sum(len(u) for u in used), len(free), len(PL), len(T), *[sum(1 for t in T if t[2] == k) for k in range(3)]), file=sys.stderr)
    if '--map' in sys.argv:
        draw(IM, T)
    rows = []
    for x, y, k, cr in T:
        la, lo = px2ll(x, y)
        h = (min(16, max(5, 1.6 * cr + 3)) if k == 0 else min(18, max(8, 1.6 * cr + 6)) if k == 1 else min(13, max(7, 4 * cr)))
        rows.append((la, lo, k, cr, h))
    rows.sort(key=lambda t: (round(t[0], 4), t[1]))
    print("  /* Деревья (v1.16.42) — строку считает tools/monaco-scan/trees.py: кроны снимка Google z19 ближе %d м к осевой," % ROI)
    print("     стволы OSM natural=tree, пальмы — звёзды на мостовой в зонах, сверенных по онбоарду и Street View.")
    print("     [широта, долгота, вид: 0 лиственное, 1 пиния, 2 пальма, радиус кроны м, высота м]. */")
    print("  trees: [")
    line = []
    for la, lo, k, cr, h in rows:
        line.append('[%.6f,%.6f,%d,%.1f,%.1f]' % (la, lo, k, cr, h))
        if len(line) == 8:
            print('    ' + ','.join(line) + ','); line = []
    if line:
        print('    ' + ','.join(line) + ',')
    print("  ],")


def draw(IM, T):
    os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
    for name, S0 in [('pit', 100), ('devote', 220), ('massenet', 650), ('casino', 850), ('mirabeau', 1060),
                     ('portier', 1400), ('tabac', 2262), ('piscine', 2600), ('noghes', 3070)]:
        k = min(range(len(S)), key=lambda i: abs(S[i] - S0))
        cx, cy = xz2px(*P[k]); h = int(120 / MPP)
        im = Image.fromarray(IM[int(cy - h):int(cy + h), int(cx - h):int(cx + h)].astype(np.uint8)); d = ImageDraw.Draw(im)
        pts = [xz2px(*p) for p in P]
        d.line([(x - cx + h, y - cy + h) for x, y in pts], fill=(255, 255, 0), width=3)
        for x, y, kk, r in T:
            R = r / MPP; X, Y = x - cx + h, y - cy + h
            if -R < X < 2 * h + R and -R < Y < 2 * h + R:
                d.ellipse([X - R, Y - R, X + R, Y + R], outline=[(255, 0, 255), (0, 255, 255), (255, 80, 0)][kk], width=3)
        im.resize((900, 900)).save(os.path.join(HERE, 'plans', 'trees_%s.jpg' % name), quality=85)


if __name__ == '__main__':
    main()
