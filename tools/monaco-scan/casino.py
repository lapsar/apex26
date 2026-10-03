#!/usr/bin/env python3
"""Площадь Казино и подъём к ней — строки SCENERY_MONACO.buildings, этап «Казино» (v1.16.33).

    node dump-wall.js            # wall.json — осевая и ПОСТРОЕННЫЙ барьер игры, HY — высота полотна
    python3 casino.py            # печатает строки для index.html (дописать в buildings)

Участок S 540–1130: Бо-Риваж (авеню д'Остенд) → Массне → площадь Казино → спуск к Мирабо.
Дома — контуры OSM (osm/all.json.gz, 01.10.2026): все здания, ближе 85 м к осевой (все шесть павильонов One Monte-Carlo), кроме навесов
(building=roof) и подземных (layer<0). Узнаны по снимку и онбоарду 2025 (кадры 50–80):
слева — Отель де Пари (отношение 8280869, wikidata Q1279896; в Массне его ротонда — внутри поворота)
и павильоны One Monte-Carlo (отношения 16248281–86, A–F); справа — Казино (путь 161769674, адрес
Place du Casino) и Кафе де Пари (157719654).

Высота: у OSM этажи есть не у всех, и «2 этажа» у Отеля де Пари и Казино — явно не про фасад на площадь.
Поэтому крыша — АБСОЛЮТНАЯ (top, метры рельефа игры) = высота полотна у ближайшей точки трассы +
«над улицей» (таблица OVER ниже: по фото и этажам; иначе этажи OSM × 3.2 + 1, без этажей — 12 м, а будка меньше 300 м² — 6 м).
Дом выше по склону, чем улица, иначе утонул бы крышей в горе: above:4 — крыша не ниже самой высокой
земли под домом + 4 м (считает игра по своему рельефу). Проверка — casino-check.js по построенному миру.

Контур подрезается по ПОСТРОЕННОЙ стене: наше полотно шире настоящего (на 1–2 м), и угол Казино,
ротонда Отеля де Пари и Кафе де Пари иначе встали бы за отбойником на асфальте. Ребро нарезается
по 1 м, точка ближе стены + CLEAR м к осевой сдвигается наружу по нормали трассы; лишние точки
на прямых убираются.
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm

LAT0, LON0, MLON = 43.737145229, 7.425286371, 80430.825145   # SCEN_ORIGIN.Monaco
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, RR, S, WL, WR, HY = W['P'], W['R'], W['S'], W['WL'], W['WR'], W['HY']
M = W['M']
S_FROM, S_TO, NEAR = 540, 1130, 85
CLEAR = 0.6                       # м за линией стены (отбойник 0.3 м толщиной + зазор)

# id: (имя, над улицей м | None — по этажам OSM, цвет стен, цвет полос окон, этаж м, крыша)
OVER = {
    'r8280869':  ('Hotel de Paris', 22, '#ece2cc', '#6c6a64', 3.6, '#7d7a72'),
    'w161769674': ('Casino de Monte-Carlo', 18, '#e6d2a8', '#8c7a5e', 6.0, '#6f8a7c'),   # медно-зелёные кровли
    'w157719654': ('Cafe de Paris', 12, '#efe8d8', '#5e646c', 4.0, '#8a857c'),
    'w572939161': ('', 5, '#e9e2d2', '#6f6a62', 3.2, None),
}
for k, nm in zip('123456', 'FEDCBA'):
    OVER['r1624828' + k] = ('One Monte-Carlo ' + nm, None, '#eeeeea', '#56636c', 3.6, '#8c8c88')
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
    if not (S_FROM < S[k] < S_TO) or d > NEAR:
        continue
    if cid not in OVER and 'name' not in tags and area(pts) < 60:
        continue                                                    # будки меньше 60 м² без имени — с дороги не читаются
    cp, nmoved = clip(pts)
    if cid in OVER:
        name, over, col, band, fl, roof = OVER[cid]
    else:
        name, over, col, band, fl, roof = tags.get('name', ''), None, PALETTE[len(rows) % len(PALETTE)], '#5f6368', 3.2, None
    if over is None:
        lv = tags.get('building:levels')
        over = float(lv) * (fl if fl else 3.2) + 1 if lv else (6 if area(pts) < 300 else 12)
    rows.append(dict(id=cid, S=S[k], name=name or tags.get('name', ''), road=HY[k], over=over, col=col, band=band, fl=fl,
                     roof=roof, pts=cp, moved=nmoved, tags=tags))

rows.sort(key=lambda r: r['S'])
print("    /* Площадь Казино и подъём к ней (v1.16.33) — строки считает tools/monaco-scan/casino.py: контуры OSM,")
print("       подрезанные по построенной стене; top — полотно у дома + высота над улицей. */")
for r in rows:
    top = r['road'] + r['over']
    extra = ''
    if r['fl'] and abs(r['fl'] - 3.2) > 1e-6:
        extra += ', floor:%.1f' % r['fl']
    if r['roof']:
        extra += ", roof:'%s'" % r['roof']
    poly = '[' + ','.join('[%.6f,%.6f]' % ll_of(x, z) for x, z in r['pts']) + ']'
    print("    {name:'%s', top:%.1f, color:'%s', band:'%s'%s, win:1, above:4, poly:%s}," % (
        (r['name'] or r['id']).replace("'", ''), top, r['col'], r['band'], extra, poly))
    print('#', r['id'], 'S%d' % r['S'], 'полотно %.1f +%.1f' % (r['road'], r['over']), 'точек', len(r['pts']),
          'сдвинуто', r['moved'], {k: v for k, v in r['tags'].items() if k in ('building', 'building:levels', 'height', 'name')},
          file=sys.stderr)
