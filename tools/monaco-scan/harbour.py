#!/usr/bin/env python3
"""Гавань Монако (Порт Эркюль) — данные SCENERY_MONACO.harbour (v1.16.36).

    node dump-wall.js && python3 harbour.py [--yachts]     # печатает строку harbour:{...} для index.html
    python3 harbour.py --map                                # plans/harbour_plan.png — проверка глазом

Вода — по береговой линии OSM (natural=coastline, osm/all.json.gz, 01.10.2026): одна длинная линия через всё поле
+ островок; грань «вода» — та, где середина гавани. Зона гавани Z — вода гавани и суша в 70 м от неё, но только
со стороны гавани от отбойника трассы (левая сторона по ходу S 1890–2935: набережная, бассейн, Раскасс), и не дальше
рамки гавани. В зоне игра опускает землю под воду, сушу Z закрывает плитой набережной (deck), у воды — стенка.
Понтоны — man_made=pier, которых береговая линия не знает (на воде). Яхты — белые пятна на воде на снимке Google z19
(--yachts; plans/yachts.png — проверка глазом).
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import LineString, Point, Polygon, MultiPolygon, box
from shapely.ops import linemerge, polygonize, unary_union
import osm
HERE = os.path.dirname(os.path.abspath(__file__))
LAT0, LON0, MLON = 43.737145229, 7.425286371, 80430.825145   # SCEN_ORIGIN.Monaco
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, RR, S, WL, WR, M, L = W['P'], W['R'], W['S'], W['WL'], W['WR'], W['M'], W['len']
S_A, S_B = 1890, 2935                      # трасса вдоль гавани: выезд из тоннеля → Раскасс (гавань слева)
QUAY = 70                                   # суша зоны: до 70 м от воды
FRAME = (43.7300, 43.7392, 7.4192, 7.4335)  # рамка снимка (lat0, lat1, lon0, lon1)
# рамка зоны: юг — по подножию скалы Монако-Вилль (за набережной Антуана I — сад и обрыв, а не причал)
ZFRAME = [(43.7392, 7.4192), (43.7392, 7.4335), (43.7340, 7.4335), (43.7322, 7.4300), (43.7322, 7.4192)]


def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
def ll(x, z): return (LAT0 + z / 110540, LON0 - x / MLON)


def water():
    D = osm.load(); N, WY = D['nodes'], D['ways']
    lines = [LineString([xz(*N[n]) for n in w['nodes'] if n in N]) for w in WY.values() if w['tags'].get('natural') == 'coastline']
    m = linemerge(lines); B = box(-900, -1100, 700, 800)
    rings = [g for g in getattr(m, 'geoms', [m]) if g.is_ring]
    faces = list(polygonize(unary_union([m.intersection(B), B.boundary])))
    w = [f for f in faces if f.contains(Point(*xz(43.7345, 7.4235)))][0]
    for r in rings: w = w.difference(Polygon(r))
    return w, D


def zone(Wt):
    """Z: вода и суша до QUAY м от воды, по эту сторону отбойника (слева по ходу S_A..S_B), в рамке гавани"""
    wall = []
    for k in range(M):
        if S_A <= S[k] <= S_B:
            o = -(WL[k] + 0.3)
            wall.append((P[k][0] + RR[k][0] * o, P[k][1] + RR[k][1] * o))
    la0, la1, lo0, lo1 = FRAME
    far = [xz(la0, lo1 + 0.002), xz(la1 + 0.002, lo1 + 0.002)]
    H = Polygon(wall + [xz(la0, wall and ll(*wall[-1])[1] or lo0)] + far).buffer(0)
    fr = Polygon([xz(*p) for p in ZFRAME])
    Wh = Wt.intersection(fr)
    Z = H.intersection(Wh.buffer(QUAY)).intersection(fr)
    # коридор трассы целиком (все ноги, стена + 0.3 м): у выезда из тоннеля замыкание зоны иначе резало полотно (S 1841)
    cor = unary_union([Polygon([(P[k][0] + RR[k][0] * o * (WR[k] + 0.3), P[k][1] + RR[k][1] * o * (WR[k] + 0.3)) if o > 0 else
                                 (P[k][0] - RR[k][0] * (WL[k] + 0.3), P[k][1] - RR[k][1] * (WL[k] + 0.3)) for k, o in
                                 [(k, -1), ((k + 1) % M, -1), ((k + 1) % M, 1), (k, 1)]]).buffer(0.05) for k in range(M)])
    Z = Z.difference(cor)
    return Z, Wh, H


def piers(Wt, Z, D):
    """понтоны OSM (man_made=pier, контуром) на воде зоны"""
    N, WY = D['nodes'], D['ways']; out = []
    for k, w in WY.items():
        if w['tags'].get('man_made') != 'pier': continue
        pts = [xz(*N[n]) for n in w['nodes'] if n in N]
        if len(pts) < 4 or w['nodes'][0] != w['nodes'][-1]: continue
        g = Polygon(pts).buffer(0)
        if not Z.intersects(g) or Wt.intersection(g).area < 0.9 * g.area: continue
        out.append(g)
    return out


def foot(y):
    x, z, Lm, Bm, hd = y; th = math.radians(hd); cs, sn = math.cos(th), math.sin(th)
    return Polygon([(x + cs * sx * Lm / 2 - sn * sy * Bm / 2, z + sn * sx * Lm / 2 + cs * sy * Bm / 2) for sx, sy in [(1, 1), (1, -1), (-1, -1), (-1, 1)]])


def yachts(Wt, Z, D, pr, debug=None):
    """яхты по снимку Google z19 (2026, обычный день). Два прохода:
    1) вдоль каждого понтона OSM — места стоянки через ширину лодки по обе стороны: на снимке ищется белый отрезок,
       начинающийся у кромки понтона (лодки стоят кормой к понтону) — его длина и есть лодка;
    2) остальные белые пятна на воде: яхта целиком (длина и курс — по главной оси пятна); пятно вдоль кромки причала
       шириной с длину лодки — это РЯД лодок кормой к причалу, делится поперёк.
    Белое — светлое и не тёплое: доски понтонов светлые, но R−B ≈ 30. Возвращает [(x, z, длина, ширина, курс°)]."""
    from PIL import ImageDraw, Image
    from scipy import ndimage
    im, px, mpp = satellite(*FRAME, z=19)
    a = np.asarray(im).astype(np.int16)
    br = a.mean(axis=2)
    wh = (br > 120) & ((a[:, :, 0] - a[:, :, 2]) < 18)
    W_, H_ = im.size
    x0, z0 = xz(FRAME[1], FRAME[2]); x1, z1 = xz(FRAME[0], FRAME[3])
    to_xz = lambda u, v: (x0 + (x1 - x0) * u / W_, z0 + (z1 - z0) * v / H_)
    inv = lambda x, z: ((x - x0) / (x1 - x0) * W_, (z - z0) / (z1 - z0) * H_)
    def white(x, z):
        u, v = inv(x, z); u, v = int(u), int(v)
        if not (0 <= u < W_ and 0 <= v < H_): return False
        return wh[max(0, v - 1):v + 2, max(0, u - 1):u + 2].mean() > 0.5
    pu = unary_union(pr)
    out = []
    for g in pr:                                                   # 1) места стоянки вдоль понтонов
        r = g.minimum_rotated_rectangle; c = list(r.exterior.coords)[:4]
        e1 = (c[1][0] - c[0][0], c[1][1] - c[0][1]); e2 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
        l1, l2 = math.hypot(*e1), math.hypot(*e2)
        ax, wp = (e1, l2) if l1 >= l2 else (e2, l1)
        lp = max(l1, l2); ux, uz = ax[0] / lp, ax[1] / lp; nx, nz = -uz, ux
        cx, cz = r.centroid.x, r.centroid.y
        if lp < 12: continue
        for sg in (1, -1):
            t = -lp / 2 + 1.0
            while t < lp / 2 - 1.0:
                bx, bz = cx + ux * t + nx * sg * (wp / 2 + 0.6), cz + uz * t + nz * sg * (wp / 2 + 0.6)
                run = 0.0; gap = 0.0; d = 0.0
                while d < 40:                                      # белый отрезок от кромки наружу
                    px_, pz_ = bx + nx * sg * d, bz + nz * sg * d
                    if pu.contains(Point(px_, pz_)) and d > 1.5: break   # дошли до соседнего понтона
                    if white(px_, pz_): run = d + 0.5; gap = 0
                    else:
                        gap += 0.5
                        if gap > 1.6 or (run == 0 and d > 4.0): break
                    d += 0.5
                if run >= 5:
                    Lb = run; Bb = min(7.0, max(2.8, 0.3 * Lb))
                    mx, mz = bx + nx * sg * Lb / 2 + ux * Bb / 2, bz + nz * sg * Lb / 2 + uz * Bb / 2
                    out.append((mx, mz, Lb, Bb * 0.92, math.degrees(math.atan2(nz * sg, nx * sg)) % 360))
                    t += Bb + 0.6
                else:
                    t += 1.2
    near = pu.buffer(3.0)
    mask = Image.new('L', im.size, 0); md = ImageDraw.Draw(mask)   # 2) пятна
    wz = Wt.intersection(Z)
    for p in getattr(wz, 'geoms', [wz]):
        md.polygon([px(*c) for c in p.exterior.coords], fill=255)
        for rr in p.interiors: md.polygon([px(*c) for c in rr.coords], fill=0)
    for g in pr: md.polygon([px(*c) for c in g.buffer(2.5).exterior.coords], fill=0)   # OSM и снимок местами расходятся на 3 м
    m = ndimage.binary_erosion(np.asarray(mask) > 0, iterations=3)
    boat = wh & m
    boat = ndimage.binary_closing(ndimage.binary_opening(boat, iterations=1), iterations=2)
    lab, n = ndimage.label(boat)
    edges = Wt.intersection(Z.buffer(5)).boundary
    taken = unary_union([foot(y) for y in out]) if out else None
    for i, sl in enumerate(ndimage.find_objects(lab)):
        ys, xs = np.nonzero(lab[sl] == i + 1)
        if len(xs) * mpp * mpp < 6: continue
        xs = xs + sl[1].start; ys = ys + sl[0].start
        pts = np.array([to_xz(u, v) for u, v in zip(xs, ys)])
        c = pts.mean(axis=0); ev, evec = np.linalg.eigh(np.cov((pts - c).T))
        v = evec[:, 1]; u = np.array([-v[1], v[0]])
        pl = (pts - c) @ v; pw = (pts - c) @ u
        Lm, Wm = pl.max() - pl.min() + mpp, pw.max() - pw.min() + mpp
        fill = len(xs) * mpp * mpp / (Lm * Wm)
        if fill < 0.3 or Wm < 1.8: continue
        cx, cz = c + v * (pl.max() + pl.min()) / 2 + u * (pw.max() + pw.min()) / 2
        if taken is not None and taken.contains(Point(cx, cz)): continue      # уже стоит у понтона
        if Lm < 25 and near.distance(Point(cx, cz)) < Wm / 2 + 4: continue   # мелкие у понтона — первый проход
        hd = math.degrees(math.atan2(v[1], v[0]))
        pt = Point(cx, cz); d = edges.distance(pt); e_dir = None
        if d < Wm / 2 + 6:
            q = edges.interpolate(edges.project(pt)); q2 = edges.interpolate(edges.project(pt) + 1.0)
            e_dir = math.degrees(math.atan2(q2.y - q.y, q2.x - q.x))
        par = e_dir is not None and abs(((hd - e_dir + 90) % 180) - 90) < 30
        if par and 4 <= Wm <= 16 and Lm > 1.5 * Wm:          # ряд лодок кормой к причалу
            beam = min(6.0, max(2.8, 0.34 * Wm)); k = max(1, int(round(Lm / (beam + 0.7))))
            for j in range(k):
                t = (j + 0.5) / k - 0.5
                out.append((cx + v[0] * t * Lm, cz + v[1] * t * Lm, Wm, beam * 0.95, (hd + 90) % 360))
        elif 6 <= Lm <= 110 and 2 <= Wm <= 20 and Lm >= 2.2 * Wm:
            out.append((cx, cz, Lm, Wm, hd % 360))
    out = [y for y in out if foot(y).intersection(pu).area < 0.25 * foot(y).area and Wt.contains(Point(y[0], y[1]))]
    if debug:
        dr = ImageDraw.Draw(im)
        for y in out:
            dr.line([inv(*c) for c in foot(y).exterior.coords], fill=(0, 255, 0), width=2)
        im.save(debug)
    return out


def bow_out(y, edges):
    """нос — от ближней кромки (лодка стоит кормой к причалу/понтону)"""
    x, z, Lm, Bm, hd = y; th = math.radians(hd); cs, sn = math.cos(th), math.sin(th)
    a = Point(x + cs * Lm / 2, z + sn * Lm / 2); b = Point(x - cs * Lm / 2, z - sn * Lm / 2)
    return y if edges.distance(a) >= edges.distance(b) else (x, z, Lm, Bm, (hd + 180) % 360)


def fmt_poly(g, tol):
    g = g.simplify(tol)
    return '[' + ','.join('[%.6f,%.6f]' % ll(*c) for c in list(g.exterior.coords)[:-1]) + ']'


def satellite(la0, la1, lo0, lo1, z=19, src='google'):
    """снимок рамки: (картинка PIL, функция x,z игры → пиксель, м/пкс)"""
    from PIL import Image
    from concurrent.futures import ThreadPoolExecutor
    from plan import fetch, tile_path
    n = 256 * 2 ** z
    gx = lambda lon: (lon + 180) / 360 * n
    gy = lambda lat: (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    X0, X1, Y0, Y1 = gx(lo0), gx(lo1), gy(la1), gy(la0)
    need = [(src, z, X, Y) for X in range(int(X0 // 256), int(X1 // 256) + 1) for Y in range(int(Y0 // 256), int(Y1 // 256) + 1)]
    with ThreadPoolExecutor(8) as ex: list(ex.map(fetch, need))
    im = Image.new('RGB', (int(X1 - X0), int(Y1 - Y0)))
    for s, zz, X, Y in need:
        try: im.paste(Image.open(tile_path(s, zz, X, Y)).convert('RGB'), (int(X * 256 - X0), int(Y * 256 - Y0)))
        except Exception: pass
    def px(x, zz):
        la, lo = ll(x, zz); return (gx(lo) - X0, gy(la) - Y0)
    return im, px, 156543.03 * math.cos(math.radians(la0)) / 2 ** z


def draw_geom(dr, px, g, **kw):
    for p in getattr(g, 'geoms', [g]):
        if p.is_empty: continue
        rings = [p.exterior] + list(p.interiors) if hasattr(p, 'exterior') else [p]
        for r in rings: dr.line([px(*c) for c in r.coords], **kw)


if __name__ == '__main__':
    Wt, D = water()
    Z, Wh, H = zone(Wt)
    deck = Z.difference(Wt)
    pr = piers(Wt, Z, D)
    if '--map' in sys.argv:
        from PIL import ImageDraw
        im, px, mpp = satellite(*FRAME, z=18); dr = ImageDraw.Draw(im, 'RGBA')
        for p in getattr(deck, 'geoms', [deck]): dr.polygon([px(*c) for c in p.exterior.coords], fill=(255, 140, 0, 90))
        for g in pr: dr.polygon([px(*c) for c in g.exterior.coords], fill=(255, 0, 255, 120))
        draw_geom(dr, px, Z, fill=(255, 255, 0), width=2)
        dr.line([px(*P[k]) for k in range(M)] + [px(*P[0])], fill=(255, 0, 0), width=2)
        im.save(os.path.join(HERE, 'plans', 'harbour_plan.png')); print('plans/harbour_plan.png'); sys.exit()
    Y = yachts(Wt, Z, D, pr, debug=os.path.join(HERE, 'plans', 'yachts.png'))
    edges = unary_union([g.boundary for g in pr] + [Wt.intersection(Z.buffer(5)).boundary])
    Y = [bow_out(y, edges) for y in Y]
    Y.sort(key=lambda y: (round(y[1] / 20), y[0]))
    zs = [Z] if Z.geom_type == 'Polygon' else sorted(Z.geoms, key=lambda g: -g.area)
    dk = [p for p in getattr(deck, 'geoms', [deck]) if p.area > 20]
    print("  /* Гавань (v1.16.36) — строку считает tools/monaco-scan/harbour.py: зона (вода гавани и суша до 70 м от неё по эту")
    print("     сторону отбойника) — земля в ней опускается под воду; deck — суша зоны (набережная, молы) плитой, у воды стенка;")
    print("     piers — понтоны OSM на воде; yachts — [широта, долгота, длина, ширина, курс° в осях игры] по снимку Google z19. */")
    print("  harbour: {")
    print("    zone: [" + ','.join(fmt_poly(g, 0.5) for g in zs) + "],")
    print("    deck: [" + ','.join(fmt_poly(g, 0.3) for g in dk) + "],")
    print("    piers: [" + ','.join(fmt_poly(g, 0.2) for g in pr) + "],")
    rows = ['[%.6f,%.6f,%.1f,%.1f,%d]' % (*ll(y[0], y[1]), y[2], y[3], round(y[4]) % 360) for y in Y]
    print("    yachts: [")
    for k in range(0, len(rows), 6): print("      " + ','.join(rows[k:k + 6]) + ',')
    print("    ]},")
    sys.stderr.write('зона %d м², суша %d м² (%d кусков), понтонов %d, яхт %d\n' % (Z.area, deck.area, len(dk), len(pr), len(Y)))
