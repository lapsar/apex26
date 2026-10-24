#!/usr/bin/env python3
"""Деревья вдоль круга Баку — строка SCENERY_BAKU.trees (v1.17.5, порт monaco-scan/trees.py).

    node dump-wall.js             # wall.json — осевая и ПОСТРОЕННЫЙ барьер игры
    python3 osm-trees.py          # osm/trees.json — natural=tree (352 точки в рамке, тегов вида нет)
    python3 trees.py              # заменяет блок trees в SCENERY_BAKU (index.html или файл аргументом)
    python3 trees.py --map        # + plans/trees_<S>.jpg — кроны поверх снимка (проверка глазом)

Кроны — снимок ESRI z19 (0.23 м/пкс; летний — у Google зимний, лиственные голые, серые): зелень (2g−r−b > EXG, яркость < BR) с фактурой (σ яркости в окне 5 м ≥ TEX — газон
гладкий), минус дома OSM, ближе ROI м к осевой; кроны — вершины карты расстояний до края зелени, ещё два прохода по остатку.
Стволы OSM natural=tree: крона снимка, накрывшая точку, переезжает на неё; точка вне крон — молодое дерево r 2.4.
Вид — всё лиственное (пиний и пальм OSM у Баку не знает; на онбоарде у трассы — лиственные кроны). Высота 2r+1.5 (4.5–16 м).
Двор (v1.17.5): дерево, к которому с трассы не пробиться взглядом — отрезки до ближайшей точки осевой и до точек в ±40 м
от неё все пересекают дом игры (SCENERY_BAKU.buildings) выше дерева, — не ставится: дворы кварталов с дороги не видны.
Что отсеивает игра сама (treeGeom): ствол на полотне и у стены (дальше TREE_SHIFT), в доме, в следе трибуны.
"""
import json, math, os, re, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm, tiles

Image.MAX_IMAGE_PIXELS = None
LAT0, LON0, MLON = 40.369617792, 49.842235950, 84812.690739   # SCEN_ORIGIN.Baku
Z = 19
SRC = 'esri'
ROI = 130
EXG, BR, TEX = 18, 150, 12
CROWN_K, CROWN_B, CROWN_GAP = 1.35, 0.6, 0.72                 # как у Монако v1.16.43
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, S = W['P'], W['S']
MPP = 156543.03392 * math.cos(math.radians(LAT0)) / 2 ** Z


def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
def ll(x, z): return (LAT0 + z / 110540, LON0 - x / MLON)


ll_ = [ll(*p) for p in P]
LA0, LA1 = min(a for a, b in ll_) - 0.0014, max(a for a, b in ll_) + 0.0014
LO0, LO1 = min(b for a, b in ll_) - 0.0018, max(b for a, b in ll_) + 0.0018
_x0, _y1 = tiles.deg2num(LA0, LO0, Z); _x1, _y0 = tiles.deg2num(LA1, LO1, Z)
X0, X1, Y0, Y1 = int(_x0), int(_x1), int(_y0), int(_y1)


def ll2px(lat, lon):
    xt, yt = tiles.deg2num(lat, lon, Z); return ((xt - X0) * 256, (yt - Y0) * 256)


def px2ll(px, py):
    n = 2 ** Z; lon = (px / 256 + X0) / n * 360 - 180
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (py / 256 + Y0) / n)))), lon


def xz2px(x, z): return ll2px(*ll(x, z))


def need(X, Y):
    """тайл нужен, если ближе ROI+80 м к осевой (рамка круга — в основном город, дальние тайлы не качаем)"""
    la, lo = px2ll((X - X0 + 0.5) * 256, (Y - Y0 + 0.5) * 256); x, z = xz(la, lo)
    return min((x - p[0]) ** 2 + (z - p[1]) ** 2 for p in P[::4]) < (ROI + 80) ** 2


def mosaic():
    T = [(X, Y) for X in range(X0, X1 + 1) for Y in range(Y0, Y1 + 1) if need(X, Y)]
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda t: tiles.tile(t[0], t[1], SRC, Z), T))
    im = Image.new('RGB', ((X1 - X0 + 1) * 256, (Y1 - Y0 + 1) * 256))
    for X, Y in T:
        im.paste(Image.open(os.path.join(tiles.TD, '%s_%d_%d_%d.jpg' % (SRC, Z, X, Y))), ((X - X0) * 256, (Y - Y0) * 256))
    print('# тайлов z%d: %d' % (Z, len(T)), file=sys.stderr)
    return np.asarray(im)


def raster(polys, shape):
    m = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(m)
    for p in polys:
        if len(p) >= 3:
            d.polygon(p, fill=1)
    return np.asarray(m).astype(bool)


def roi_mask(shape):
    m = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(m)
    pts = [xz2px(*p) for p in P]; r = ROI / MPP
    d.line(pts + [pts[0]], fill=1, width=int(2 * r))
    for p in pts[::4]:
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=1)
    return np.asarray(m).astype(bool)


def green(IM, roi, bm):
    """маска зелени по полосам (фильтры по окну 25 пкс — перекрытие 64)"""
    H = IM.shape[0]; out = np.zeros(IM.shape[:2], bool); step = 2048
    for y0 in range(0, H, step):
        a, b = max(0, y0 - 64), min(H, y0 + step + 64)
        Q = IM[a:b].astype(np.float32); r, g, bl = Q[..., 0], Q[..., 1], Q[..., 2]
        L = Q.mean(-1)
        m1 = nd.uniform_filter(L, 9); m2 = nd.uniform_filter(L * L, 9)
        tex = nd.uniform_filter(np.sqrt(np.maximum(m2 - m1 * m1, 0)), 25)
        m = (2 * g - r - bl > EXG) & (L < BR) & (tex >= TEX)
        out[y0:min(H, y0 + step)] = m[y0 - a:y0 - a + min(step, H - y0)]
    m = out & ~bm & roi
    m = nd.binary_opening(m, structure=np.ones((5, 5)))
    m = nd.binary_closing(m, structure=np.ones((9, 9)))
    m = nd.binary_fill_holes(m)
    return nd.binary_opening(m, structure=np.ones((7, 7)))


def crowns(m):
    out, grid = [], {}

    def near(y, x, r):
        gy, gx = int(y * MPP // 10), int(x * MPP // 10)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for (yy, xx, rr) in grid.get((gy + dy, gx + dx), []):
                    if math.hypot(yy - y, xx - x) * MPP < CROWN_GAP * (rr + r):
                        return True
        return False
    rest = m.copy()
    for rnd in range(3):
        dt = nd.distance_transform_edt(rest).astype(np.float32) * MPP
        pk = np.argwhere((dt == nd.maximum_filter(dt, size=15)) & (dt >= (1.2 if rnd == 0 else 1.0)))
        v = dt[pk[:, 0], pk[:, 1]]; o = np.argsort(-v)
        for (y, x), d in zip(pk[o], v[o]):
            r = min(CROWN_K * float(d) + CROWN_B, 7.5)
            if near(y, x, r):
                continue
            out.append((float(x), float(y), r)); grid.setdefault((int(y * MPP // 10), int(x * MPP // 10)), []).append((y, x, r))
        del dt
        cov = Image.new('L', (m.shape[1], m.shape[0]), 0); dr = ImageDraw.Draw(cov)
        for x, y, r in out:
            R = r / MPP * 0.9; dr.ellipse([x - R, y - R, x + R, y + R], fill=1)
        rest = m & ~np.asarray(cov).astype(bool)
        rest = nd.binary_opening(rest, structure=np.ones((7, 7)))
    return out


def hidden_filter(T, html):
    """дерево во дворе: все три взгляда с трассы упираются в дом выше дерева"""
    from shapely.geometry import Polygon, LineString
    from shapely.strtree import STRtree
    s = open(html).read(); i = s.index('const SCENERY_BAKU'); j = s.index('\n};', i)
    G, H = [], []
    for m in re.finditer(r"\{name:[^\n]*?h:([\d.]+)[^\n]*?poly:\[(.*?)\]\}", s[i:j]):
        pts = [xz(float(a), float(b)) for a, b in re.findall(r'\[([\d.]+),([\d.]+)\]', m.group(2))]
        if len(pts) >= 3:
            g = Polygon(pts).buffer(0)
            if not g.is_empty:
                G.append(g); H.append(float(m.group(1)))
    tree = STRtree(G); out = []; hid = 0
    for t in T:
        la, lo = px2ll(t[0], t[1]); x, z = xz(la, lo); h = min(16, max(4.5, 2 * t[2] + 1.5))
        k = min(range(0, len(P)), key=lambda q: (P[q][0] - x) ** 2 + (P[q][1] - z) ** 2)
        blocked = 0
        for dk in (0, -10, 10):                                    # станции wall.json — через 4 м
            q = P[(k + dk) % len(P)]; ln = LineString([(x, z), (q[0], q[1])])
            if any(H[n] > h + 1 and G[n].intersects(ln) for n in tree.query(ln)):
                blocked += 1
        if blocked == 3:
            hid += 1; continue
        out.append(t)
    print('# во дворах (с трассы не видны): %d' % hid, file=sys.stderr)
    return out


def main():
    IM = mosaic()
    D = osm.load(); N = D['nodes']
    blds = [[ll2px(*N[n]) for n in w['nodes'] if n in N] for w in D['ways'].values()
            if 'building' in w['tags'] and w['tags'].get('building') not in ('roof', 'carport')]
    bm = raster(blds, IM.shape)
    roi = roi_mask(IM.shape)
    m = green(IM, roi, bm)
    C = crowns(m)
    print('# кроны снимка: %d, зелень %.0f м² в %d м от осевой' % (len(C), m.sum() * MPP ** 2, ROI), file=sys.stderr)
    O = []
    for la, lo, t in json.load(open(os.path.join(HERE, 'osm', 'trees.json')))['nodes'].values():
        x, y = ll2px(la, lo)
        if 0 <= int(y) < IM.shape[0] and 0 <= int(x) < IM.shape[1] and roi[int(y), int(x)]:
            O.append((x, y))
    for w in D['ways'].values():                                    # ряды деревьев — ствол через 8 м
        if w['tags'].get('natural') != 'tree_row':
            continue
        pts = [xz(*N[n]) for n in w['nodes'] if n in N]
        for a, b in zip(pts, pts[1:]):
            L = math.dist(a, b); k = max(1, round(L / 8))
            for j in range(k):
                x, y = xz2px(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k)
                if 0 <= int(y) < IM.shape[0] and 0 <= int(x) < IM.shape[1] and roi[int(y), int(x)]:
                    O.append((x, y))
    used = [[] for _ in C]; free = []
    for i, (x, y) in enumerate(O):
        best = None
        for j, (cx, cy, cr) in enumerate(C):
            if abs(cx - x) > 40 or abs(cy - y) > 40:
                continue
            d = math.hypot(cx - x, cy - y) * MPP
            if d < cr * 0.9 and (best is None or d < best[0]):
                best = (d, j)
        (used[best[1]].append(i) if best else free.append(i))
    T = []
    for j, (cx, cy, cr) in enumerate(C):
        if not used[j]:
            T.append([cx, cy, cr]); continue
        for i in used[j]:
            T.append([O[i][0], O[i][1], max(2.0, cr / math.sqrt(len(used[j])))])
    for i in free:
        T.append([O[i][0], O[i][1], 2.4])
    print('# OSM: %d в %d м, в кронах снимка %d, отдельно %d; всего деревьев %d'
          % (len(O), ROI, sum(len(u) for u in used), len(free), len(T)), file=sys.stderr)
    html = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(HERE, '..', '..', 'index.html'))
    T = hidden_filter(T, html)
    if '--map' in sys.argv:
        draw(IM, T)
    rows = []
    for x, y, cr in T:
        la, lo = px2ll(x, y)
        rows.append((la, lo, 0, cr, min(16, max(4.5, 2 * cr + 1.5))))
    rows.sort(key=lambda t: (round(t[0], 4), t[1]))
    out = ["  /* Деревья (v1.17.5) — строку считает tools/baku-scan/trees.py: кроны снимка ESRI z19 ближе %d м к осевой, стволы OSM natural=tree." % ROI,
           "     [широта, долгота, вид: 0 лиственное, радиус кроны м, высота м]. */", "  trees: ["]
    line = []
    for la, lo, k, cr, h in rows:
        line.append('[%.6f,%.6f,%d,%.1f,%.1f]' % (la, lo, k, cr, h))
        if len(line) == 8:
            out.append('    ' + ','.join(line) + ','); line = []
    if line:
        out.append('    ' + ','.join(line) + ',')
    out.append("  ],")
    s = open(html).read()
    i = s.index('const SCENERY_BAKU')
    blk = '\n'.join(out) + '\n'
    mm = re.compile(r'  /\* Деревья \(v1\.17\.5\).*?\n  \],\n', re.S).search(s, i)
    if mm and mm.start() < s.index('\n};', i):
        s = s[:mm.start()] + blk + s[mm.end():]
    else:
        j = s.index('\n};', i) + 1
        s = s[:j] + blk + s[j:]
    open(html, 'w').write(s)
    print('# записано деревьев: %d → %s' % (len(rows), html), file=sys.stderr)


def draw(IM, T):
    os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
    for S0 in (100, 800, 1300, 1900, 2600, 3000, 3300, 3700, 4300, 4700, 5300, 5850):
        k = min(range(len(S)), key=lambda i: abs(S[i] - S0))
        cx, cy = xz2px(*P[k]); h = int(140 / MPP)
        im = Image.fromarray(IM[max(0, int(cy - h)):int(cy + h), max(0, int(cx - h)):int(cx + h)]); d = ImageDraw.Draw(im)
        ox, oy = max(0, int(cx - h)), max(0, int(cy - h))
        d.line([(x - ox, y - oy) for x, y in (xz2px(*p) for p in P)], fill=(255, 255, 0), width=3)
        for x, y, r in T:
            R = r / MPP; X, Y = x - ox, y - oy
            if -R < X < im.width + R and -R < Y < im.height + R:
                d.ellipse([X - R, Y - R, X + R, Y + R], outline=(255, 0, 255), width=3)
        im.resize((800, 800)).save(os.path.join(HERE, 'plans', 'trees_%d.jpg' % S0), quality=85)


if __name__ == '__main__':
    main()
