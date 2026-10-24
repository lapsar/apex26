#!/usr/bin/env python3
"""Земля города Баку — блок SCENERY_BAKU.ground (v1.17.8, владелец 24.10.2026: «начинай с земли города»).

    node dump-wall.js             # wall.json — осевая и ПОСТРОЕННЫЙ барьер игры
    python3 ground.py             # заменяет блок ground в SCENERY_BAKU (index.html или файл аргументом)
    python3 ground.py --map       # + plans/ground_<S>.jpg — слои поверх снимка ESRI (проверка глазом)

До v1.17.8 под всем Баку лежала трава обобщённого мира. Теперь основа — плитка тротуара (groundTex:'paving' — плита игры),
поверх неё плоскими многоугольниками (в меш домов, 0 вызовов):
  вода   — Каспий по береговой линии OSM (natural=coastline: суша слева по ходу пути, море справа) до FAR_SEA м, пруды и фонтаны;
  асфальт — проезжие части OSM (highway: ось → полоса ширины width / lanes × LANE / по классу улицы), парковки;
  газон  — landuse=grass (и мультиполигоны), leisure=garden, landuse=forest.
Порядок: вода поверх всего, асфальт поверх газона (в данных вычтено — слои не перекрываются). Коридор трассы (построенная стена
+ CLEAR м, все ноги) вычтен — внутри барьера земли нет. Дальше NEAR м от осевой — только море (город дальше закрыт домами).
Без Math.random: оттенок многоугольника — от его номера в игре.
"""
import json, math, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm
from shapely.geometry import Polygon, LineString, Point, MultiPolygon, box
from shapely.ops import unary_union, polygonize, linemerge, split

LAT0, LON0, MLON = 40.369617792, 49.842235950, 84812.690739   # SCEN_ORIGIN.Baku
NEAR, FAR_SEA, CLEAR, SIMP = 230, 2200, 0.5, 0.25
LANE = 3.3
# полная ширина проезжей части без тегов: (односторонняя, двусторонняя), м — по снимку ESRI z19 у трассы
WIDTH = {'motorway': (11, 22), 'trunk': (10.5, 20), 'primary': (10, 14), 'secondary': (7, 10), 'tertiary': (6.5, 9),
         'unclassified': (5.5, 7), 'residential': (5.5, 7), 'living_street': (5, 6), 'service': (4, 5),
         'trunk_link': (6, 8), 'primary_link': (6, 8), 'secondary_link': (6, 8), 'tertiary_link': (6, 8)}
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, R, WL, WR = W['P'], W['R'], W['WL'], W['WR']
M = len(P)


def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
def ll(x, z): return (LAT0 + z / 110540, LON0 - x / MLON)


def corridor():
    """коридор трассы: от левой стены до правой (+CLEAR) по всем станциям построенного барьера"""
    q = []
    for i in range(M):
        j = (i + 1) % M
        a = [(P[k][0] - R[k][0] * (WL[k] + CLEAR), P[k][1] - R[k][1] * (WL[k] + CLEAR)) for k in (i, j)]
        b = [(P[k][0] + R[k][0] * (WR[k] + CLEAR), P[k][1] + R[k][1] * (WR[k] + CLEAR)) for k in (i, j)]
        g = Polygon([a[0], a[1], b[1], b[0]]).buffer(0)
        if not g.is_empty and g.area < 2000:                         # шов круга (последняя станция → первая) — тоже квадрат
            q.append(g)
    for g in W.get('GAPS', []):                                      # карманы выездов по форме улиц (v1.17.9): ломаная стены + осевая участка
        if not g.get('pocket'): continue
        ks = [k % M for k in range(g['to'], g['from'] - (M if g['to'] < g['from'] else 0) - 1, -1)]
        q.append(Polygon([tuple(t) for t in g['path']] + [tuple(P[k]) for k in ks]).buffer(0).buffer(CLEAR))
    return unary_union(q).buffer(0.05)


def ring_pts(D, w):
    return [xz(*D['nodes'][n]) for n in w['nodes'] if n in D['nodes']]


def areas(D, test):
    """замкнутые пути и мультиполигоны с тегами test"""
    out = []
    for w in D['ways'].values():
        if test(w['tags']) and len(w['nodes']) > 3 and w['nodes'][0] == w['nodes'][-1]:
            g = Polygon(ring_pts(D, w)).buffer(0)
            if not g.is_empty:
                out.append(g)
    for r in D['rels'].values():
        if r['tags'].get('type') == 'multipolygon' and test(r['tags']):
            outer = [LineString(ring_pts(D, D['ways'][ref])) for t, ref, role in r['members']
                     if t == 'way' and ref in D['ways'] and role != 'inner' and len(ring_pts(D, D['ways'][ref])) > 1]
            inner = [LineString(ring_pts(D, D['ways'][ref])) for t, ref, role in r['members']
                     if t == 'way' and ref in D['ways'] and role == 'inner' and len(ring_pts(D, D['ways'][ref])) > 1]
            go = unary_union(list(polygonize(linemerge(outer)))) if outer else None
            if go is None or go.is_empty:
                continue
            gi = unary_union(list(polygonize(linemerge(inner)))) if inner else None
            out.append(go.difference(gi) if gi is not None and not gi.is_empty else go)
    return unary_union(out) if out else Polygon()


def roads(D):
    segs = []
    for w in D['ways'].values():
        t = w['tags']; h = t.get('highway')
        if h not in WIDTH or t.get('area') == 'yes' or t.get('tunnel') in ('yes', 'building_passage') or t.get('covered') == 'yes':
            continue
        pts = ring_pts(D, w)
        if len(pts) < 2:
            continue
        ow = t.get('oneway') in ('yes', '1', '-1') or t.get('junction') == 'roundabout'
        wd = None
        try:
            wd = float(t['width'].replace('m', '').strip()) if 'width' in t else None
        except ValueError:
            wd = None
        if wd is None and t.get('lanes', '').isdigit():
            wd = int(t['lanes']) * LANE + 0.6
        if wd is None:
            wd = WIDTH[h][0 if ow else 1]
        segs.append(LineString(pts).buffer(wd / 2, cap_style=2, join_style=2, mitre_limit=2.0))
    return unary_union(segs)


def sea(D):
    """Каспий: береговые линии OSM (море справа по ходу пути) внутри рамки FAR_SEA + 500 м режут рамку на куски; кусок — море,
    если его точка справа от ближайшего к ней отрезка берега"""
    lines = [LineString(ring_pts(D, w)) for w in D['ways'].values() if w['tags'].get('natural') == 'coastline']
    big = box(-FAR_SEA - 500, -FAR_SEA - 500, FAR_SEA + 500, FAR_SEA + 500)
    segs = []
    for L in lines:
        c = list(L.coords)
        segs += [(c[i], c[i + 1]) for i in range(len(c) - 1) if big.intersects(LineString([c[i], c[i + 1]]))]
    c = list(linemerge(lines).coords)                                  # в выгрузке берег обрывается у T1 (S ~ −1.7 км) — продлить концы
    def ext(a, b):
        d = math.dist(a, b) or 1
        return (b[0] + (b[0] - a[0]) / d * 9000, b[1] + (b[1] - a[1]) / d * 9000)
    c = [ext(c[min(8, len(c) - 1)], c[0])] + c + [ext(c[max(-9, -len(c))], c[-1])]
    cut = LineString(c).intersection(big.buffer(50))                  # береговая линия насквозь через рамку: split режет только сквозной линией
    out = []
    for g in split(big, cut).geoms:
        q = g.representative_point()
        a, b = min(segs, key=lambda s_: LineString(s_).distance(q))
        gx, gz = b[0] - a[0], b[1] - a[1]
        # море справа по ходу пути в географических осях; у игры x отражён (восток = −x), «справа» в осях игры — (−gz, gx)
        t = max(0, min(1, ((q.x - a[0]) * gx + (q.y - a[1]) * gz) / (gx * gx + gz * gz)))
        if (q.x - a[0] - gx * t) * -gz + (q.y - a[1] - gz * t) * gx > 0:
            out.append(g)
    return unary_union(out).intersection(Point(0, 0).buffer(FAR_SEA, 32)) if out else Polygon()


def polys(g):
    if g.is_empty:
        return []
    return [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if p.geom_type == 'Polygon' and p.area > 4]


def fmt(ring):
    pts = list(ring.coords)[:-1]
    return '[' + ','.join('%.6f,%.6f' % ll(x, z) for x, z in pts) + ']'


def main():
    D = osm.load()
    cor = corridor()
    axis = LineString([tuple(p) for p in P] + [tuple(P[0])])
    near = axis.buffer(NEAR, 16)
    water = unary_union([sea(D), areas(D, lambda t: t.get('natural') == 'water' and t.get('place') != 'sea' or t.get('amenity') == 'fountain'
                                       or t.get('leisure') == 'swimming_pool')])
    asph = unary_union([roads(D), areas(D, lambda t: t.get('amenity') == 'parking' and t.get('parking') not in ('underground', 'multi-storey'))])
    grass = areas(D, lambda t: t.get('landuse') in ('grass', 'forest', 'meadow', 'village_green') or t.get('leisure') == 'garden')
    water_n = water.difference(cor)
    asph_n = asph.intersection(near).difference(water).difference(cor)
    grass_n = grass.intersection(near).difference(water).difference(asph).difference(cor)
    L = []
    for name, g in (('water', water_n), ('asphalt', asph_n), ('grass', grass_n)):
        ps = polys(g.simplify(SIMP, preserve_topology=True).buffer(0))
        print('# %-8s многоугольников %4d, площадь %8.0f м², точек %6d' % (name, len(ps), sum(p.area for p in ps),
              sum(len(p.exterior.coords) + sum(len(i.coords) for i in p.interiors) for p in ps)), file=sys.stderr)
        L.append((name, ps))
    rows = []
    for name, ps in L:
        rows.append("    %s: [" % name)
        for p in sorted(ps, key=lambda p: -p.area):
            rows.append('      [' + ','.join([fmt(p.exterior)] + [fmt(i) for i in p.interiors]) + '],')
        rows.append('    ],')
    block = ("  /* Земля города (v1.17.8) — строку считает tools/baku-scan/ground.py: плитка тротуара (groundTex:'paving') под всем миром,\n"
             "     поверх — вода (Каспий по береговой линии OSM, пруды, фонтаны), асфальт проезжих частей и парковок OSM, газоны OSM;\n"
             "     коридор трассы (стена + %.1f м) вычтен, дальше %d м от осевой — только море. Многоугольник — [наружное кольцо, дыры…],\n"
             "     кольцо — [широта, долгота, …]. */\n  groundTex: 'paving',\n  ground: {\n" % (CLEAR, NEAR) + '\n'.join(rows) + "\n  },\n")
    html = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.join(HERE, '..', '..', 'index.html')
    s = open(html).read()
    i = s.index('const SCENERY_BAKU = {'); j = s.index('\n};', i)
    body = s[i:j]
    body = re.sub(r"  /\* Земля города \(v1\.17\.8\).*?\n  \},\n", '', body, flags=re.S)
    k = body.index('  trees: [')
    k = body.rindex('  /*', 0, k)                                     # перед комментарием к деревьям
    body = body[:k] + block + body[k:]
    s = s[:i] + body + s[j:]
    open(html, 'w').write(s)
    print('# блок ground: %.0f КБ' % (len(block) / 1024), file=sys.stderr)
    if '--map' in sys.argv:
        draw(L)


def draw(L):
    W_, M_ = W, M
    import tiles
    from PIL import Image, ImageDraw
    Z = 19
    os.makedirs(os.path.join(HERE, 'plans'), exist_ok=True)
    COL = {'water': (40, 110, 255, 120), 'asphalt': (255, 60, 60, 110), 'grass': (60, 255, 60, 110)}
    for S0 in (220, 550, 1420, 1640, 2400, 3000, 3625, 3985, 4600, 5400):
        k = min(range(M), key=lambda t: abs(W['S'][t] - S0)); la, lo = ll(*P[k]); X, Y = tiles.deg2num(la, lo, Z)
        mpp = 156543.03392 * math.cos(math.radians(la)) / 2 ** Z; rp = 120 / mpp
        x0, y0, x1, y1 = int((X * 256 - rp) // 256), int((Y * 256 - rp) // 256), int((X * 256 + rp) // 256), int((Y * 256 + rp) // 256)
        im = Image.new('RGB', ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
        for tx in range(x0, x1 + 1):
            for ty in range(y0, y1 + 1):
                tiles.tile(tx, ty, 'esri', Z); im.paste(Image.open(os.path.join(tiles.TD, 'esri_%d_%d_%d.jpg' % (Z, tx, ty))), ((tx - x0) * 256, (ty - y0) * 256))
        ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
        px = lambda p: tuple((v - o) * 256 for v, o in zip(tiles.deg2num(*ll(*p), Z), (x0, y0)))
        for name, ps in L:
            for p in ps:
                if p.distance(Point(P[k])) > 200:
                    continue
                d.polygon([px(q) for q in p.exterior.coords], fill=COL[name])
                for h in p.interiors:
                    d.polygon([px(q) for q in h.coords], fill=(0, 0, 0, 0))
        for sg, Wa in ((1, WR), (-1, WL)):                             # стена игры — белым
            d.line([px((P[t][0] + R[t][0] * sg * Wa[t], P[t][1] + R[t][1] * sg * Wa[t])) for t in range(M)
                    if math.dist(P[t], P[k]) < 260], fill=(255, 255, 255, 230), width=2)
        im = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
        c = px(P[k]); im.crop((int(c[0] - rp), int(c[1] - rp), int(c[0] + rp), int(c[1] + rp))).resize((640, 640)).save(
            os.path.join(HERE, 'plans', 'ground_%d.jpg' % S0), quality=82)


if __name__ == '__main__':
    main()
