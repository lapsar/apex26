#!/usr/bin/env python3
"""Боксы, пит-лейн и бассейн Монако — строки SCENERY_MONACO (v1.16.43; v1.16.56 — по построению, см. ниже).

    node dump-wall.js            # wall.json — осевая, ПОСТРОЕННЫЙ барьер, следы трибун (ST)
    python3 pits.py              # печатает: строки домов (боксы, вышка бассейна) и ключ paddock:{lane, deck, water, wall, fence}

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
v1.16.56 — крыша снимка больше не используется (её контур обведён от руки: излом фасада, пит-лейн из-под торца); числа v1.16.55
(фасад на 29 м, пит-лейн 12 м) взяты за основу, прямоугольник и полосы строятся геометрией ниже (комментарий у FACADE).
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
BOX_H = 8.5                       # м: боксы — два этажа (онбоард: стена вровень с отбойником пит-уолла и выше вдвое)


def xz(lat, lon): return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)
def ll(x, z): return (LAT0 + z / 110540, LON0 - x / MLON)



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

axis = LineString(way('850261588'))   # ось OSM «Voie des stands»: въезд у Раскасс S 2953, выезд — сходится с осевой у S 24
# v1.16.56 (владелец 08.10.2026: «здание боксов с изломом — так не бывает»; «дорога к боксам висит в воздухе»; «асфальт пит-лейна
# вылезает из-под здания боксов»; «боксы должны быть отделены стеной от бассейна»). До неё гаражи — часть белой крыши снимка между
# трассой и дальними 12 м: фасад шёл по контуру крыши, обведённому от руки, и по следу трибуны — излом посередине; ось OSM у выезда
# пересекает крышу наискось, и пит-лейн выходил к стене трассы из-под торца здания. Теперь — по построению:
#  * здание — прямой прямоугольник: фасад к пит-лейну — прямая через точки FACADE м от осевой на S_A и S_B (крыша снимка — 29 м,
#    взято 23.5: так пит-лейн проходит за трибуной L у бассейна, не врезаясь в неё), глубина BOX_D к трассе (гаражи 12 м; между
#    отбойником и зданием 3.5 м — ряд пиний и пит-уолл, как в жизни);
#  * пит-лейн — полоса LANE_W за фасадом; до S_BLEND — по оси OSM, затем плавно к фасаду; за торцом здания — плавной дугой
#    (кривая Безье) к стене трассы у выезда S_EXIT: выезд обходит здание, а не выходит из-под него;
#  * со стороны бассейна — стена пит-лейна WALL_H по его дальнему краю, от S_WALL до выезда: из гавани ворота гаражей не видны.
FACADE, BOX_D, LANE_W = 23.5, 12.0, 11.0
S_A, S_B, S_BLEND, S_EXIT, S_WALL = 3160, 3262, 3110, 24, 3140
WALL_H, WALL_RAMP = 7.5, 20.0      # м: высота над пит-лейном; у южного конца стена поднимается от 2 м на этой длине (иначе — плита в поле)


def st(s): return min(range(M), key=lambda k: abs(W['S'][k] - s))
def at(s, off): k = st(s); return (P[k][0] + RR[k][0] * off, P[k][1] + RR[k][1] * off)


def bez(p0, p1, p2, p3, n=24):
    return [tuple((1 - t) ** 3 * p0[i] + 3 * (1 - t) ** 2 * t * p1[i] + 3 * (1 - t) * t * t * p2[i] + t ** 3 * p3[i] for i in (0, 1))
            for t in (j / n for j in range(n + 1))]


A, B = at(S_A, FACADE), at(S_B, FACADE)
_L = math.hypot(B[0] - A[0], B[1] - A[1]); U = ((B[0] - A[0]) / _L, (B[1] - A[1]) / _L)
kM = st((S_A + S_B) / 2); Nn = (-U[1], U[0])
if Nn[0] * RR[kM][0] + Nn[1] * RR[kM][1] > 0: Nn = (-Nn[0], -Nn[1])    # Nn — от фасада к трассе
off = lambda p, d: (p[0] + Nn[0] * d, p[1] + Nn[1] * d)
box = Polygon([A, B, off(B, BOX_D), off(A, BOX_D)]).difference(CORRIDOR)
# осевая пит-лейна: ось OSM до S_BLEND → вдоль фасада (середина полосы) → дуга к выезду
ka = st(S_BLEND); qa = axis.interpolate(axis.project(Point(*P[ka])))
a_part = [c for c in axis.coords if axis.project(Point(c)) < axis.project(qa)] + [(qa.x, qa.y)]
c0, c1 = off(A, -LANE_W / 2), off(B, -LANE_W / 2)
ta = (a_part[-1][0] - a_part[-2][0], a_part[-1][1] - a_part[-2][1]); la = math.hypot(*ta); ta = (ta[0] / la, ta[1] / la)
d0 = math.hypot(c0[0] - qa.x, c0[1] - qa.y) / 3
blend = bez((qa.x, qa.y), (qa.x + ta[0] * d0, qa.y + ta[1] * d0), (c0[0] - U[0] * d0, c0[1] - U[1] * d0), c0, 12)
kx = st(S_EXIT); E = at(S_EXIT, 6.0); FX = (-RR[kx][1], RR[kx][0])
if FX[0] * U[0] + FX[1] * U[1] < 0: FX = (-FX[0], -FX[1])               # по ходу трассы
d1 = math.hypot(E[0] - c1[0], E[1] - c1[1]) / 2.5
exitc = bez(c1, (c1[0] + U[0] * d1, c1[1] + U[1] * d1), (E[0] - FX[0] * d1, E[1] - FX[1] * d1), E)
lane_c = LineString(a_part[:-1] + blend + exitc[1:] + [(E[0] + FX[0] * 8, E[1] + FX[1] * 8)])
lane_full = lane_c.buffer(LANE_W / 2, cap_style=2, join_style=1)
# стена со стороны бассейна — дальний от трассы край пит-лейна, от S_WALL до выезда (кончается у коридора трассы)
_s0 = lane_c.project(Point(*at(S_WALL, FACADE + LANE_W / 2)))
_sub = LineString([lane_c.interpolate(lane_c.project(Point(c))).coords[0] for c in lane_c.coords if lane_c.project(Point(c)) >= _s0])
_side = _sub.offset_curve(LANE_W / 2 + 0.15, join_style=1); _other = _sub.offset_curve(-(LANE_W / 2 + 0.15), join_style=1)
_far = lambda g: g.interpolate(0.5, normalized=True).distance(Point(*P[kM]))
wall_line = max((_side, _other), key=_far)
wall_line = wall_line.difference(CORRIDOR.buffer(0.3))
wall_line = max(getattr(wall_line, 'geoms', [wall_line]), key=lambda g: g.length)
tower = Polygon(way('952067351')).buffer(0).difference(CORRIDOR)
STANDS_REAL = unary_union([Polygon(f).buffer(0).buffer(-2.5) for f in W.get('ST', [])])   # след трибуны без запаса 3 м (+0.5)
lane = lane_full.difference(CORRIDOR).difference(box).difference(STANDS_REAL)
water = Polygon(way('167625723')).buffer(0).difference(CORRIDOR)
deck = Polygon(way('197170037')).buffer(0).difference(CORRIDOR).difference(box).difference(water).difference(STANDS).difference(lane_full.buffer(0.4))

print("    /* Боксы и вышка бассейна (v1.16.43) — строки считает tools/monaco-scan/pits.py: боксы — временное двухэтажное здание")
print("       (в OSM его нет); с v1.16.56 — прямой прямоугольник между пит-прямой и пит-лейном (был контур крыши снимка z19 с изломом),")
print("       вышка — OSM w952067351 (10 м). */")
for i, p in enumerate(parts(box, 30)):
    print("    {name:'Pit garages%s', h:%.1f, color:'#eeeeea', band:'#3f454c', floor:4.2, roof:'#e6e6e2', garage:{lane:1}, poly:%s}," % ('' if i == 0 else ' %d' % (i + 1), BOX_H, fmt(p)))
for p in parts(tower, 4):
    print("    {name:'Diving tower', h:10, color:'#d9d6cf', band:'#5f6368', poly:%s}," % fmt(p))
print()
print("  /* Пит-лейн и бассейн (v1.16.43) — строку считает tools/monaco-scan/pits.py: lane — полотно пит-лейна (v1.16.56: %.0f м за" % LANE_W)
print("     фасадом боксов; до них — по оси OSM «Voie des stands» от въезда у Раскасс, за торцом — дугой к стене трассы у выезда S %d)," % S_EXIT)
print("     deck — площадка Stade Nautique Rainier III, water — чаша бассейна; минус коридор трассы, боксы и следы трибун. Плиты на видимой")
print("     земле, в меш домов (вершинный цвет). wall — стена пит-лейна со стороны бассейна (v1.16.56, владелец: «боксы должны быть отделены")
print("     стеной от бассейна»): [широта, долгота] по дальнему краю пит-лейна, h м над ним. */")
print("  paddock: {")
for key, g in (('lane', lane), ('deck', deck), ('water', water)):
    print("    %s: [%s]," % (key, ','.join(fmt(p) for p in parts(g))))
print("    wall: {h:%.1f, ramp:%.0f, line:%s}," % (WALL_H, WALL_RAMP, fmt(list(wall_line.simplify(0.1).coords))))
print("""    /* Ограждение за отбойником — там, где на онбоарде 2025 видна сетка (v1.16.48, вариант 2 владельца; разметка по кадрам через 3,
       tracks/monaco.md). Нет её у Казино, на спуске к Мирабо, в шпильке, у Портье, в тоннеле, у шиканы и Табака. */
    fence: [{fromS:3060, toS:170, side:'R'},    // пит-прямая: кадры 272–296 (v1.16.44 — 3100–70)
            {fromS:130, toS:235, side:'L'},     // Сент-Девот, снаружи, вдоль выезда-ловушки: кадры 14–20, 299
            {fromS:280, toS:770, side:'R'},     // Бо-Риваж и Массне, сторона моря: кадры 29–56, 311–314
            {fromS:2480, toS:2740, side:'R'},   // бассейн, напротив задней стены боксов: кадры 215–227 (v1.16.45 — с 2490)
            {fromS:2760, toS:2890, side:'L'}],  // выход бассейна и подъезд к Раскасс: кадры 236–245""")
print("  },")
print('# боксы %.0f м², пит-лейн %.0f м², площадка %.0f м², вода %.0f м², стена %.0f м' % (box.area, lane.area, deck.area, water.area, wall_line.length), file=sys.stderr)
