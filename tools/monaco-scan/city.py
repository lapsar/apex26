#!/usr/bin/env python3
"""Город вдоль всего круга Монако — строки SCENERY_MONACO.buildings (v1.16.39), вместо обобщённых серых коробок.

    node dump-wall.js            # wall.json — осевая и ПОСТРОЕННЫЙ барьер игры, HY — высота полотна
    python3 city.py              # печатает строки для index.html (дописать в buildings после блока Казино)

Тот же способ, что casino.py (v1.16.33): все здания OSM (osm/all.json.gz) ближе NEAR м к осевой, кроме навесов
(building=roof), подземных (layer<0) и безымянных будок меньше 60 м²; без участка площади Казино (его строки —
casino.py) и без трёх домов тоннеля. Крыша абсолютная: полотно у ближайшей точки трассы + этажи OSM × 3.2 + 1
(без этажей — 12 м, будка < 300 м² — 6 м, есть height — она); above:4 — крыша не ниже земли под домом + 4 м.
Контур подрезан по ПОСТРОЕННОЙ стене + CLEAR. Проверка — casino-check.js и ground-gap.js по построенному миру.
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm

LAT0, LON0, MLON = 43.737145229, 7.425286371, 80430.825145   # SCEN_ORIGIN.Monaco
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, RR, S, WL, WR, HY = W['P'], W['R'], W['S'], W['WL'], W['WR'], W['HY']
M = W['M']
CASINO = (540, 1130)              # уже построено casino.py
TUNNEL = {'r2093796', 'w112689159', 'w176722821'}   # Fairmont, Auditorium, Monte Carlo Star — строки тоннеля (v1.16.31)
NEAR = 100
# Между подъёмом Бо-Риваж и пит-прямой (справа от Бо-Риваж, S 150–560): дома на склоне — у пит-прямой высокий
# фасад, крыша вровень с Бо-Риваж (онбоард 2025, кадры 26–42: справа над отбойником деревья и небо). Этажи OSM
# считаются от нижней улицы, поэтому крыша — полотно Бо-Риваж рядом + LOW_OVER, без above.
LOW, LOW_OVER = (150, 560), 0.5
SKIP = {'w112681614'}   # будка внутри петли Раскасс (265 м²): с дороги не читается, у внутренней стены петли
CLEAR = 1.0                       # м за линией стены (отбойник 0.3 м + зазор; у шпильки и шиканы стена отодвинута и спрямлена — запас больше, чем у casino.py)

# id: (имя, над улицей м | None — по этажам OSM, цвет стен, цвет полос окон, этаж м, крыша)
OVER = {}    # id: (имя, над улицей м | None — по этажам OSM, цвет стен, цвет окон, этаж м, крыша) — заполняется ниже
PALETTE = ['#e8d6b8', '#e6c9a8', '#efe3cc', '#e2bfa6', '#dcd2bf', '#ead9c0']   # охра, розовый, кремовый — улица Монако


def xz(lat, lon):
    return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)


def ll_of(x, z):
    return (LAT0 + z / 110540, LON0 - x / MLON)


def station(x, z):
    """ближайшая станция по перпендикуляру: (k, off, |вдоль|) или None"""
    best = None
    for k in range(M):
        dx, dz = x - P[k][0], z - P[k][1]
        if dx * dx + dz * dz > 80 * 80:
            continue
        rx, rz = RR[k]
        k2 = (k + 1) % M
        tx, tz = P[k2][0] - P[k][0], P[k2][1] - P[k][1]; tl = math.hypot(tx, tz) or 1
        al = (dx * tx + dz * tz) / tl
        if al < -0.5 or al > tl + 0.5:
            continue
        off = dx * rx + dz * rz
        if best is None or abs(off) < abs(best[1]):
            best = (k, off, al)
    return best


def clip(pts):
    out = []
    n = len(pts)
    for e in range(n):
        a, b = pts[e], pts[(e + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1]); m = max(1, math.ceil(L))
        for j in range(m):
            x, z = a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m
            st = station(x, z)
            moved = False
            if st:
                k, off, _ = st
                lim = (WR[k] if off >= 0 else WL[k]) + CLEAR
                if abs(off) < lim:
                    sg = 1 if off >= 0 else -1
                    d = sg * lim - off
                    x, z = x + RR[k][0] * d, z + RR[k][1] * d
                    moved = True
            out.append((x, z, moved, j == 0))
    # оставить вершины OSM и сдвинутые точки; из сдвинутых подряд — прореживание по прямой (0.15 м)
    keep = [p for p in out if p[2] or p[3]]
    res = []
    for i, p in enumerate(keep):
        if res and len(res) >= 2 and p[2] and res[-1][2]:
            (x0, z0, *_), (x1, z1, *_) = res[-2], res[-1]
            dx, dz = p[0] - x0, p[1] - z0; dl = math.hypot(dx, dz) or 1
            if abs((x1 - x0) * dz - (z1 - z0) * dx) / dl < 0.15:
                res[-1] = p
                continue
        res.append(p)
    return [(p[0], p[1]) for p in res], sum(1 for p in out if p[2])


from shapely.geometry import Polygon
from shapely.ops import unary_union
_q = []
for k in range(M):
    k2 = (k + 1) % M
    a, b = (P[k], RR[k], WL[k], WR[k]), (P[k2], RR[k2], WL[k2], WR[k2])
    side = lambda t, sg: (t[0][0] + t[1][0] * sg * ((t[2] if sg < 0 else t[3]) + CLEAR), t[0][1] + t[1][1] * sg * ((t[2] if sg < 0 else t[3]) + CLEAR))
    _q.append(Polygon([side(a, -1), side(b, -1), side(b, 1), side(a, 1)]).buffer(0.05))
CORRIDOR = unary_union(_q)


def cut(pts):
    """контур минус коридор трассы (стена + CLEAR, все ноги): [(точки, сколько вершин срезано)], куски больше 30 м².
    Дом, перекрывший улицу (Neuehouse у Портье), делится на куски по обе стороны; прежняя подрезка сдвигала точки
    наружу по нормали и такой дом выворачивала поперёк дороги (пробник clear, v1.16.39)."""
    poly = Polygon(pts).buffer(0)
    d = poly.difference(CORRIDOR)
    geoms = [d] if d.geom_type == 'Polygon' else list(getattr(d, 'geoms', []))
    out = []
    for g in geoms:
        if g.geom_type != 'Polygon' or g.area < 30:
            continue
        g = g.simplify(0.15)
        c = list(g.exterior.coords)[:-1]
        if len(c) >= 3:
            out.append((c, 0 if g.area > poly.area - 0.5 else 1))
    return out


def low_road(pts):
    """высота полотна Бо-Риваж у дома, если дом справа от него (S LOW), иначе None"""
    cx, cz = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    best = None
    for k in range(M):
        if not (LOW[0] < S[k] < LOW[1]):
            continue
        d = math.hypot(cx - P[k][0], cz - P[k][1])
        if best is None or d < best[0]:
            best = (d, k)
    if best is None or best[0] > 60:                                # дальше — уже другой берег гавани (Quai Kennedy)
        return None
    k = best[1]
    off = (cx - P[k][0]) * RR[k][0] + (cz - P[k][1]) * RR[k][1]
    return HY[k] if off > 0 else None


def area(pts):
    n = len(pts)
    return abs(sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))) / 2


def road_at(pts):
    best = (1e9, 0)
    for x, z in pts:
        for k in range(M):
            d = math.hypot(x - P[k][0], z - P[k][1])
            if d < best[0]:
                best = (d, k)
    return best[1]


D = osm.load()
N, WY, RL = D['nodes'], D['ways'], D['rels']
cands = []
for k, w in WY.items():
    if 'building' in w['tags']:
        cands.append(('w' + k, w['tags'], [N[n] for n in w['nodes'] if n in N]))
for k, r in RL.items():
    if 'building' in r['tags'] and r['tags'].get('type') == 'multipolygon':
        outs = [ref for t, ref, role in r['members'] if t == 'way' and role == 'outer' and ref in WY]
        if len(outs) == 1:
            cands.append(('r' + k, r['tags'], [N[n] for n in WY[outs[0]]['nodes'] if n in N]))

rows = []
for cid, tags, ll in cands:
    if len(ll) < 4 or tags.get('building') == 'roof' or int(tags.get('layer', '0') or 0) < 0:
        continue
    if ll[0] == ll[-1]:
        ll = ll[:-1]
    pts = [xz(*p) for p in ll]
    k = road_at(pts)
    d = min(math.hypot(x - P[k][0], z - P[k][1]) for x, z in pts)
    if CASINO[0] < S[k] < CASINO[1] or cid in TUNNEL or d > NEAR:
        continue
    if cid not in OVER and 'name' not in tags and area(pts) < 60:
        continue                                                    # будки меньше 60 м² без имени — с дороги не читаются
    try:
        parts = cut(pts)
    except Exception:
        parts = []
    if not parts:
        continue
    if cid in SKIP:
        continue
    lo = low_road(pts)                                              # между Бо-Риваж и пит-прямой: крыша вровень с Бо-Риваж
    if cid in OVER:
        name, over, col, band, fl, roof = OVER[cid]
    else:
        name, over, col, band, fl, roof = tags.get('name', ''), None, PALETTE[len(rows) % len(PALETTE)], '#5f6368', 3.2, None
    if lo is not None:
        over = LOW_OVER
    if over is None:
        lv = tags.get('building:levels')
        try:
            hh = float(tags.get('height', '').replace('m', '').strip())
        except ValueError:
            hh = None
        over = hh if hh else float(lv) * (fl if fl else 3.2) + 1 if lv else (6 if area(pts) < 300 else 12)
    for j, (cp, nmoved) in enumerate(parts):
        rows.append(dict(low=lo is not None, id=cid + ('' if len(parts) == 1 else '-%d' % (j + 1)), S=S[k], name=name or tags.get('name', ''),
                         road=HY[k] if lo is None else lo, over=over, col=col, band=band, fl=fl, roof=roof, pts=cp, moved=nmoved, tags=tags))

rows.sort(key=lambda r: r['S'])
print("    /* Город вдоль круга (v1.16.39) — строки считает tools/monaco-scan/city.py: все дома OSM ближе %d м к осевой," % NEAR)
print("       кроме площади Казино и тоннеля; контуры подрезаны по построенной стене, top — полотно у дома + высота над улицей. */")
for r in rows:
    top = r['road'] + r['over']
    extra = ''
    if r['fl'] and abs(r['fl'] - 3.2) > 1e-6:
        extra += ', floor:%.1f' % r['fl']
    if r['roof']:
        extra += ", roof:'%s'" % r['roof']
    poly = '[' + ','.join('[%.6f,%.6f]' % ll_of(x, z) for x, z in r['pts']) + ']'
    print("    {name:'%s', top:%.1f, color:'%s', band:'%s'%s, win:1%s, poly:%s}," % (
        (r['name'] or r['id']).replace("'", ''), top, r['col'], r['band'], extra, '' if r['low'] else ', above:4', poly))
    print('#', r['id'], 'S%d' % r['S'], 'полотно %.1f +%.1f' % (r['road'], r['over']), 'точек', len(r['pts']),
          'сдвинуто', r['moved'], {k: v for k, v in r['tags'].items() if k in ('building', 'building:levels', 'height', 'name')},
          file=sys.stderr)
