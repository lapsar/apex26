#!/usr/bin/env python3
"""Боксы, пит-лейн и бассейн Монако — строки SCENERY_MONACO (v1.16.43).

    node dump-wall.js            # wall.json — осевая, ПОСТРОЕННЫЙ барьер, следы трибун (ST)
    python3 pits.py              # печатает: строки домов (боксы, вышка бассейна) и ключ paddock:{lane, deck, water}

Владелец 05.10.2026: «у нас совсем нет здания боксов, забыли?». Справа от пит-прямой по снимку Google z19 и онбоарду 2025
(кадры 4, 284 — справа высокая серо-белая стена боксов, над ней кроны пиний): ряд пиний, пит-лейн (OSM «Voie des stands»,
w850261588), длинное белое здание боксов (~300 м, временное — в OSM его нет; контур обведён по белой крыше снимка),
бассейн Stade Nautique Rainier III (OSM: чаша w167625723, площадка w197170037, вышка w952067351 — 10 м).
v1.16.44 (владелец: «здание с окнами как у домов — это и есть боксы?», вариант Б): у боксов garage (v1.16.45 — {fromS,toS}: гаражи только на стороне к пит-прямой) — на стороне к трассе
проёмы гаражей с полосой цвета команды, стекло лож, козырёк; paddock.fence — ограждение за правым отбойником S 3100–70.
Из всех контуров вычитается коридор трассы (стена + CLEAR, все ноги), из пит-лейна — ещё боксы и следы трибун.
v1.16.55 (владелец 08.10.2026: «перед зданием боксов нет никакой дороги — сделай пит-лейн там, где он должен быть»): с 2004 г.
пит-лейн Монако — на набережной Quai Albert I со стороны гавани, блок гаражей стоит островом МЕЖДУ пит-прямой и пит-лейном,
ворота — к пит-лейну, к трассе — задняя стена с сигнальщиками (grandprix.com 2002/2004, Red Bull «Bull's guide to Monaco»,
gouv.mc). Белая крыша снимка, по которой обведены боксы, накрывает и гаражи, и пит-лейн: ось OSM идёт через середину контура
(16–41 м от осевой, ось на 26–29 м), но по OSM гаражи вышли бы 5–7 м глубиной и на 130 м — расходится со снимком на ~6 м.
Взято по крыше: дальние от трассы 2·LANE_HW = 12 м — пит-лейн, ближние 10–15 м — гаражи (в плане 2002 г. — 10 м); вне крыши
пит-лейн — по оси OSM (въезд у Раскасс S 2949, выезд S 24). garage:{lane:1} — ворота на стороне, за которой асфальт пит-лейна.
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union

LAT0, LON0, MLON = 43.737145229, 7.425286371, 80430.825145   # SCEN_ORIGIN.Monaco
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, RR, WL, WR, M = W['P'], W['R'], W['WL'], W['WR'], W['M']
CLEAR = 1.0                       # м за линией стены (как city.py)
LANE_HW = 6.0                     # м: пит-лейн — 12 м вокруг оси OSM «Voie des stands» (v1.16.55; до неё 8 м и под боксами)
BOX_H = 8.5                       # м: боксы — два этажа (онбоард: стена вровень с отбойником пит-уолла и выше вдвое)


def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
def ll(x, z): return (LAT0 + z / 110540, LON0 - x / MLON)


# Контур белой крыши боксов по снимку z19 (обведён по кадру 300×300 м с центром 43.7342, 7.4216; 0.3 м/пкс), по часовой.
_PX = [(460, 205), (545, 205), (548, 262), (568, 300), (578, 400), (600, 500), (622, 580), (640, 700), (638, 735), (605, 735),
       (585, 640), (545, 560), (510, 470), (483, 360), (463, 270)]
BOX_LL = [(43.7342 - (py - 500) * 0.3 / 110540, 7.4216 + (px - 500) * 0.3 / 80430.8) for px, py in _PX]

_q = []
for k in range(M):
    k2 = (k + 1) % M
    a, b = (P[k], RR[k], WL[k], WR[k]), (P[k2], RR[k2], WL[k2], WR[k2])
    side = lambda t, sg: (t[0][0] + t[1][0] * sg * ((t[2] if sg < 0 else t[3]) + CLEAR), t[0][1] + t[1][1] * sg * ((t[2] if sg < 0 else t[3]) + CLEAR))
    _q.append(Polygon([side(a, -1), side(b, -1), side(b, 1), side(a, 1)]).buffer(0.05))
CORRIDOR = unary_union(_q)
STANDS = unary_union([Polygon(f).buffer(0) for f in W.get('ST', [])])


def parts(g, min_area=4):
    gs = [g] if g.geom_type == 'Polygon' else list(getattr(g, 'geoms', []))
    return [list(p.simplify(0.15).exterior.coords)[:-1] for p in gs if p.geom_type == 'Polygon' and p.area >= min_area]


def fmt(pts):
    return '[' + ','.join('[%.6f,%.6f]' % ll(x, z) for x, z in pts) + ']'


D = osm.load(); N, WY = D['nodes'], D['ways']
way = lambda k: [xz(*N[n]) for n in WY[k]['nodes'] if n in N]

roof = Polygon([xz(*p) for p in BOX_LL]).buffer(0).difference(CORRIDOR).difference(STANDS)   # белая крыша снимка: гаражи + пит-лейн
axis = LineString(way('850261588'))
band = axis.buffer(LANE_HW, cap_style=2)
# Под крышей: дальние от трассы 2·LANE_HW м — пит-лейн, ближние — гаражи. По сечениям трассы: дальний край крыши f(k) — луч
# от осевой вправо; гаражи — от осевой до f(k) − 2·LANE_HW (дальше коридора их не пустит вычитание ниже).
PIT_S = (3050, 60)                # S пит-прямой: сечения только её (лучи от ноги у бассейна попадают в ту же крышу с другой стороны)
_far = {}
for k in range(M):
    if not (W['S'][k] >= PIT_S[0] or W['S'][k] <= PIT_S[1]):
        continue
    r = LineString([P[k], (P[k][0] + RR[k][0] * 90, P[k][1] + RR[k][1] * 90)]).intersection(roof)
    if not r.is_empty:
        _far[k] = max(Point(c).distance(Point(*P[k])) for g in getattr(r, 'geoms', [r]) for c in g.coords)
_q = []
for k in sorted(_far):
    k2 = (k + 1) % M
    if k2 not in _far:
        continue
    o1, o2 = _far[k] - 2 * LANE_HW, _far[k2] - 2 * LANE_HW
    _q.append(Polygon([P[k], P[k2], (P[k2][0] + RR[k2][0] * o2, P[k2][1] + RR[k2][1] * o2),
                       (P[k][0] + RR[k][0] * o1, P[k][1] + RR[k][1] * o1)]).buffer(0.05))
box = roof.intersection(unary_union(_q))                            # гаражи — часть крыши со стороны трассы
box = box.buffer(-2.0, join_style=2).buffer(2.0, join_style=2)       # уже 4 м гаражей нет — там крыша узкая, вся под пит-лейном
box = unary_union([g for g in getattr(box, 'geoms', [box]) if g.geom_type == 'Polygon' and g.area > 30])
tower = Polygon(way('952067351')).buffer(0).difference(CORRIDOR)
lane = band.difference(roof).union(roof.difference(box)).difference(CORRIDOR).difference(box).difference(STANDS)   # пит-лейн: под крышей за гаражами, вне её — по оси OSM
water = Polygon(way('167625723')).buffer(0).difference(CORRIDOR)
deck = Polygon(way('197170037')).buffer(0).difference(CORRIDOR).difference(box).difference(water).difference(STANDS).difference(lane)

print("    /* Боксы и вышка бассейна (v1.16.43) — строки считает tools/monaco-scan/pits.py: боксы — временное двухэтажное здание")
print("       по белой крыше снимка z19 (в OSM его нет), вышка — OSM w952067351 (10 м). */")
for i, p in enumerate(parts(box, 30)):
    print("    {name:'Pit garages%s', h:%.1f, color:'#eeeeea', band:'#3f454c', floor:4.2, roof:'#e6e6e2', garage:{lane:1}, poly:%s}," % ('' if i == 0 else ' %d' % (i + 1), BOX_H, fmt(p)))
for p in parts(tower, 4):
    print("    {name:'Diving tower', h:10, color:'#d9d6cf', band:'#5f6368', poly:%s}," % fmt(p))
print()
print("  /* Пит-лейн и бассейн (v1.16.43) — строку считает tools/monaco-scan/pits.py: lane — полотно пит-лейна по OSM «Voie des")
print("     stands» (± %.1f м — от стены до боксов), deck — площадка Stade Nautique Rainier III, water — чаша бассейна; минус коридор трассы," % LANE_HW)
print("     боксы и следы трибун. Плоские плиты на видимой земле, в меш домов (вершинный цвет). */")
print("  paddock: {")
for key, g in (('lane', lane), ('deck', deck), ('water', water)):
    print("    %s: [%s]," % (key, ','.join(fmt(p) for p in parts(g))))
print("    fence: [{fromS:3100, toS:70, side:'R'},     // ограждение за отбойником пит-прямой: онбоард 2025, кадры 276–290 (v1.16.44)")
print("            {fromS:2490, toS:2740, side:'R'}],  // и у бассейна, напротив задней стены боксов: кадры 216–226 (v1.16.45)")
print("  },")
print('# боксы %.0f м², пит-лейн %.0f м², площадка %.0f м², вода %.0f м²' % (box.area, lane.area, deck.area, water.area), file=sys.stderr)
