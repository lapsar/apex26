#!/usr/bin/env python3
"""Город Баку — строки SCENERY_BAKU.buildings: крепостная стена Ичери-Шехер и дома OSM вдоль всего круга (порт monaco-scan/city.py;
у Баку рельефа нет — мир плоский, высота дома — над землёй). v1.17.3 — Старый город (участок ZONE), v1.17.4 — весь круг (CITY).

    node dump-wall.js            # wall.json — осевая и ПОСТРОЕННЫЙ барьер игры
    python3 city.py              # вставляет блок в SCENERY_BAKU (index.html; повторный запуск заменяет), сводка — в stderr

Участок — CITY (S от линии старта): с v1.17.4 весь круг (в v1.17.3 — только ZONE, Старый город: от T5 через Нефтчиляр, замок,
Истиглалият и спуск к T16 до второй ноги Нефтчиляр у Девичьей башни). На нём обобщённых серых коробок нет (boxesOff — тот же CITY).

Дома: все здания OSM ближе FAR м к осевой участка (ближайшая точка трассы — в CITY), кроме навесов, подземных
и безымянных будок меньше 60 м²; из контура вычитаются коридор трассы (построенная стена + CLEAR, все ноги — дом поперёк улицы
делится, а не выворачивается, урок Монако v1.16.39) и крепостная стена. Высота: height OSM, иначе этажи × 3.2 + 1, иначе внутри
стены — OLD_H (Старый город двух-трёхэтажный), снаружи — 12 м, будка < 300 м² — 6 м. Ближе NEAR м — окна проёмами (win).
Цвет — светлый известняк (Баку строен из него), по очереди; стеклянные башни 1-го сектора и старт-финиша (Marriott, Hilton,
Landmark) — серо-голубое стекло (онбоард, кадры 8–62, 412–418: башни за прямой и у T1), Дом правительства — песчаник.

Крепостная стена: в OSM её линии почти нет (одна короткая barrier=city_wall внутри), но граница района «İçəri Şəhər»
(w152190481, material=stone) идёт по ней с полукруглыми башнями. Стена — полоса WALL_T м внутрь от границы, высота WALL_H,
без окон (plain) и с зубцами (crenel), куски по сетке PIECE м (контур дома в игре — без дыр). Ставится только ближе FAR м к осевой.
Девичья башня (w299418016) — своя высота 29.5 м (OSM, building:part w418164347).

Стиль по району (v1.17.6; OSM вида дома не знает — sources.md): каждый дом получает стиль по месту и этажам, разброс деталей — от
номера дома OSM (crc32), без случайности. Ключи дома — index.html, «Детали фасада»; кадры KartaView 2019 (streets.tsv) — образец.
  OLD   — внутри крепостной стены: камень, этаж 3.6 м, окна мелкие и редкие, часть с арками;
  HIST  — «нефтяной бум» 1880–1914 (по умолчанию вне стены до 8 этажей): известняк, этаж 4.3 м, высокие окна, карниз, пояс,
          руст первого этажа, витрины у дороги, балконы с решётками рядами, часть окон с арками, на угловых домах у трассы — башенка с куполом;
  PUBLIC — крупные общественные (government, university, school, hospital, площадь > 2500 м² от 4 этажей): этаж 4.6 м, глубокий карниз, руст;
  TALL  — от 9 этажей или от 30 м: советские лоджии (балконы почти у всех рядов, светлее) или новый «под старину» (карниз, пояс, руст);
  стеклянные башни (OVER) — стойки стекла через 1.6 м.
Высота «нефтяного бума» и общественных — этажи OSM × свой этаж + 1.6 (по 3.2 м исторический дом выходил ниже настоящего на треть);
без этажей — 14.5 м (три этажа по 4.3). Крыша — цвет летнего снимка ESRI z19 (медиана точек внутри контура).
"""
import gzip, json, math, os, re, sys, zlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tiles
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

LAT0, LON0, MLON = 40.369617792, 49.842235950, 84812.690739   # SCEN_ORIGIN.Baku
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, RR, S, WL, WR = W['P'], W['R'], W['S'], W['WL'], W['WR']
M = W['M']
ZONE = (1990, 4620)               # S: участок «Старый город» (T5 … вторая нога Нефтчиляр у Девичьей башни) — v1.17.3
CITY = (0, 5951)                  # S: дома OSM и без серых коробок — весь круг (v1.17.4)
NEAR = 100                        # м: ближе — окна проёмами (win:1)
FAR = 160                         # м: дома и стена — до сюда от осевой участка
CLEAR = 1.0                       # м за линией стены — дома (как у Монако)
WALL_CLEAR = 0.6                  # м — крепостная стена: у замка она в жизни сразу за бортом (онбоард, кадр 232)
WALL_T, WALL_H, PIECE = 3.0, 9.0, 30.0   # толщина, высота, размер куска стены, м
WALL_COL = '#c2a47c'              # песчаный камень стены на солнце (онбоард, кадры 229–235)
OLD_CITY = '152190481'
OLD_H = 7.4                       # м: дом Старого города без этажей в OSM — два этажа
OVER = {                          # id: (имя, высота м, цвет, plain)
    'w299418016': ('Maiden Tower', 29.5, '#c8ad84', True),   # Девичья башня: 29.5 м (OSM w418164347)
    'w153128834': ('Marriott Abşeron Otel', 84.0, '#8ea3b0', False),   # стеклянная башня у T1 (OSM height 84)
    'w152192792': ('Hilton', 25 * 3.2 + 1, '#7f96a5', False),           # 25 этажей, стекло — за старт-финишем
    'w200195772': ('Landmark-III', 12 * 3.2 + 1, '#8ea3b0', False),      # офисные башни Landmark — стекло (S ~750–850)
    'w152809510': ('Hökumət Evi', 10 * 3.2 + 1, '#d6be92', False),       # Дом правительства — песчаник, площадь Азадлыг
}
# Крепостная стена, нанесённая в OSM ещё и «домом» (building=yes, 3 этажа): узкая полоса 1.2–1.4 м с башнями вдоль границы района —
# у замка (S 2640–2717, слева в 5–13 м от осевой — онбоард, кадр 232: стена у самой дороги) и на северной стороне. Как дом она
# получила бы окна (v1.17.3, первая проба) — ставится стеной: без окон, с зубцами, высота по этажам OSM, вычитается только коридор у стены.
WALL_BLD = {'w1502989778', 'w1502989779'}
GLASS = {'w153128834', 'w152192792', 'w200195772'}       # Marriott, Hilton, Landmark-III — стекло (v1.17.6: стойки, без окон проёмами)
SKIP = set()
PALETTE = ['#dccaa4', '#d2bd94', '#e2d4b4', '#cdb68c', '#d8c49c', '#c9b28a']   # известняк Баку: песочный, кремовый
OLD_PALETTE = ['#cbb187', '#c2a77c', '#d3bb92', '#bfa47a']                     # Старый город — темнее, камень


def xz(lat, lon):
    return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)


def ll_of(x, z):
    return (LAT0 + z / 110540, LON0 - x / MLON)


_q = []
for k in range(M):
    k2 = (k + 1) % M
    def side(t, sg, c):
        p, r, wl, wr = t
        w = (wl if sg < 0 else wr) + c
        return (p[0] + r[0] * sg * w, p[1] + r[1] * sg * w)
    a, b = (P[k], RR[k], WL[k], WR[k]), (P[k2], RR[k2], WL[k2], WR[k2])
    _q.append((a, b))
CORRIDOR = unary_union([Polygon([side(a, -1, CLEAR), side(b, -1, CLEAR), side(b, 1, CLEAR), side(a, 1, CLEAR)]).buffer(0.05) for a, b in _q])
CORRIDOR_W = unary_union([Polygon([side(a, -1, WALL_CLEAR), side(b, -1, WALL_CLEAR), side(b, 1, WALL_CLEAR), side(a, 1, WALL_CLEAR)]).buffer(0.05) for a, b in _q])
STANDS = unary_union([Polygon(f).buffer(0) for f in W.get('ST', [])])
ZK = [k for k in range(M) if ZONE[0] <= S[k] <= ZONE[1]]


import numpy as np
_PX, _PZ = np.array([p[0] for p in P]), np.array([p[1] for p in P])


HIST_PAL = ['#dcc9a2', '#d4bf96', '#e2d3b1', '#cfb68b', '#d9c49b', '#e6d8ba', '#c9b087']   # известняк «нефтяного бума» (KartaView 2019)
ACCENT = ['#d8b4a0', '#e2cc8e', '#d9d4c6']           # редкие крашеные фасады: розовый, жёлтый, серо-белый (S 3598, 3622 — KartaView)
SOV_PAL = ['#d9d6cf', '#cfcac0', '#e0dbd0']           # советские высотки — светлее, серее
DOMES = ['#6f7d78', '#5d6468', '#7c8580']             # купола: патина, сланец
FL_OLD, FL_HIST, FL_PUB = 3.6, 4.3, 4.6


def hsh(cid, k=0):
    """0..1 от номера дома OSM — разброс деталей без случайности"""
    return (zlib.crc32(('%s/%d' % (cid, k)).encode()) & 0xffffff) / 0xffffff


def mix(c, f, t='#ffffff'):
    a = [int(c[i:i + 2], 16) for i in (1, 3, 5)]; b = [int(t[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(a[i] + (b[i] - a[i]) * f) for i in range(3))


def roof_col(pts):
    """медиана цвета крыши по летнему снимку ESRI z19 (точки внутри контура, отступ 1 м, шаг 1.5 м)"""
    g = Polygon(pts).buffer(-1.0)
    if g.is_empty:
        g = Polygon(pts)
    x0, z0, x1, z1 = g.bounds; st = max(1.5, math.sqrt(g.area / 60)); C = []
    from shapely.geometry import Point
    z = z0
    while z <= z1:
        x = x0
        while x <= x1:
            if g.contains(Point(x, z)):
                C.append(tiles.px(*ll_of(x, z), 'esri', 19))
            x += st
        z += st
    if not C:
        return None
    C = sorted(C, key=lambda c: sum(c)); m = C[len(C) // 2]
    if sum(m) < 3 * 60:                                  # тень соседнего дома — светлее тени
        m = C[min(len(C) - 1, len(C) * 3 // 4)]
    return '#%02x%02x%02x' % tuple(min(255, int(v * 1.05)) for v in m)


def dome_vertex(pts):
    """угол дома у трассы для башенки: выпуклый, 60–120°, рёбра от 8 м, ближе 30 м к осевой — ближайший"""
    n = len(pts); ar = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)); best = None
    for i in range(n):
        p, a, b = pts[i], pts[i - 1], pts[(i + 1) % n]
        u = (a[0] - p[0], a[1] - p[1]); v = (b[0] - p[0], b[1] - p[1]); lu, lv = math.hypot(*u), math.hypot(*v)
        if lu < 8 or lv < 8:
            continue
        cr = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])
        if cr * ar <= 0:                                  # вогнутый угол
            continue
        ang = math.degrees(math.acos(max(-1, min(1, (u[0] * v[0] + u[1] * v[1]) / lu / lv))))
        if not 60 <= ang <= 120:
            continue
        d = float(np.min(np.hypot(_PX - p[0], _PZ - p[1])))
        if d <= 30 and (best is None or d < best[0]):
            best = (d, i)
    return None if best is None else best[1]


def style(cid, tags, inside, lv, hh, area_):
    """стиль дома по месту и этажам → (высота, цвет, ключи деталей)"""
    bt = tags.get('building', '')
    if inside:
        return (lv * FL_OLD + 1 if lv else hh), OLD_PALETTE[int(hsh(cid) * len(OLD_PALETTE))], dict(
            floor=FL_OLD, winW=0.45, winH=0.42, winGap=4.2, arch=1 if hsh(cid, 1) < 0.35 else 0, cornice=0.25 if hsh(cid, 2) < 0.5 else 0)
    if (lv and lv >= 9) or hh >= 30:
        if hsh(cid, 3) < 0.5:                             # советская высотка с лоджиями
            return hh, SOV_PAL[int(hsh(cid) * len(SOV_PAL))], dict(winW=0.7, winH=0.5, balc=0.85)
        c = HIST_PAL[int(hsh(cid) * len(HIST_PAL))]       # новый «под старину» (Нефтчиляр)
        return hh, c, dict(cornice=0.6, belt=0.25, rust=mix(c, 0.15, '#000000'), balc=0.3, winW=0.65, winH=0.55, trim=mix(c, 0.25))
    if bt in ('government', 'university', 'school', 'hospital', 'college') or (area_ > 2500 and (lv or 0) >= 4):
        c = HIST_PAL[int(hsh(cid) * len(HIST_PAL))]
        return (lv * FL_PUB + 1.6 if lv else max(hh, 16.0)), c, dict(
            floor=FL_PUB, winW=0.7, winH=0.6, cornice=0.85, belt=0.3, rust=mix(c, 0.18, '#000000'), trim=mix(c, 0.25),
            arch=1 if hsh(cid, 1) < 0.3 else 0)
    c = ACCENT[int(hsh(cid, 4) * len(ACCENT))] if hsh(cid, 5) < 0.08 else HIST_PAL[int(hsh(cid) * len(HIST_PAL))]
    h = lv * FL_HIST + 1.6 if lv else (6 if area_ < 300 else 14.5)
    k = dict(floor=FL_HIST, winW=0.6, winH=0.58, cornice=0.6, trim=mix(c, 0.25), shop=1, balc=round(0.25 + 0.35 * hsh(cid, 6), 2),
             arch=1 if hsh(cid, 1) < 0.4 else 0, belt=0.25 if hsh(cid, 7) < 0.8 else 0, rust=mix(c, 0.15, '#000000') if hsh(cid, 8) < 0.6 else 0)
    if h < 8:
        k = dict(floor=FL_HIST, winW=0.6, winH=0.58, cornice=0.4, trim=mix(c, 0.25))
    return h, c, k


def near_zone(pts):
    """(расстояние до ближайшей точки трассы, S её, лежит ли она в CITY)"""
    a = np.array(pts)
    d2 = (a[:, 0:1] - _PX[None, :]) ** 2 + (a[:, 1:2] - _PZ[None, :]) ** 2
    i, k = np.unravel_index(np.argmin(d2), d2.shape)
    return math.sqrt(d2[i, k]), S[k], CITY[0] <= S[k] <= CITY[1]


def area(pts):
    n = len(pts)
    return abs(sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))) / 2


def pieces(g, min_area):
    geoms = [g] if g.geom_type == 'Polygon' else list(getattr(g, 'geoms', []))
    out = []
    for q in geoms:
        if q.geom_type != 'Polygon' or q.area < min_area:
            continue
        q = q.simplify(0.15)
        if q.is_empty or q.geom_type != 'Polygon':
            continue
        c = list(q.exterior.coords)[:-1]
        if len(c) >= 3:
            out.append(c)
    return out


D = json.load(gzip.open(os.path.join(HERE, 'osm', 'all.json.gz')))
N, WY, RL = D['nodes'], D['ways'], D['rels']
oc = [xz(*N[n]) for n in WY[OLD_CITY]['nodes'] if n in N]
OLDP = Polygon(oc).buffer(0)
RING = OLDP.difference(OLDP.buffer(-WALL_T))

# --- крепостная стена: куски по сетке, только ближе FAR м к осевой участка ---
wall_rows = []
x0, z0, x1, z1 = RING.bounds
gx = x0
while gx < x1:
    gz = z0
    while gz < z1:
        cell = RING.intersection(box(gx, gz, gx + PIECE, gz + PIECE)).difference(CORRIDOR_W)
        for c in pieces(cell, 2.0):
            d, s, inz = near_zone(c)
            if d <= FAR and inz:
                wall_rows.append(dict(S=s, d=d, pts=c))
        gz += PIECE
    gx += PIECE
WALLU = unary_union([Polygon(r['pts']) for r in wall_rows]).buffer(0.05) if wall_rows else Polygon()

# --- дома ---
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
    lv = None
    if len(ll) < 4 or tags.get('building') in ('roof', 'carport') or int(tags.get('layer', '0') or 0) < 0 or cid in SKIP:
        continue
    if ll[0] == ll[-1]:
        ll = ll[:-1]
    pts = [xz(*p) for p in ll]
    d, s, inz = near_zone(pts)
    if not inz or d > FAR:
        continue
    if cid not in OVER and 'name' not in tags and area(pts) < 60:
        continue
    poly = Polygon(pts).buffer(0)
    if poly.is_empty or poly.intersects(STANDS):
        continue
    inside = OLDP.contains(poly.representative_point())
    wb = cid in WALL_BLD
    parts = pieces(poly.difference(CORRIDOR_W), 2.0) if wb else pieces(poly.difference(CORRIDOR).difference(WALLU), 30)
    if not parts:
        continue
    if wb:
        name, hh, col, plain = 'Fortress wall', float(tags['building:levels']) * 3.2 + 1, WALL_COL, True
    elif cid in OVER:
        name, hh, col, plain = OVER[cid]
    else:
        name, plain = tags.get('name', ''), False
        try:
            hh = float(tags.get('height', '').replace('m', '').strip())
        except ValueError:
            hh = None
        try:
            lv = float(tags.get('building:levels', '').replace(',', '.'))
        except ValueError:
            lv = None
        ht = hh
        if not hh:
            hh = lv * 3.2 + 1 if lv else OLD_H if inside else (6 if area(pts) < 300 else 12)
        hs, col, sk = style(cid, tags, inside, lv, hh, area(pts))
        if not ht:                                         # высота OSM (height) — как есть; по этажам — своим этажом стиля (v1.17.6)
            hh = hs
    if wb or plain:
        sk = {}
    elif cid in OVER:                                      # стеклянные башни — стойки стекла; Дом правительства — общественный
        sk = dict(glass=1.6, trim='#c9d3d8') if cid in GLASS else dict(
            floor=FL_PUB, winW=0.7, winH=0.6, cornice=0.85, belt=0.3, rust=mix(col, 0.18, '#000000'), trim=mix(col, 0.25), arch=1)
    for j, cp in enumerate(parts):
        k = dict(sk)
        if k.get('shop') and lv and lv >= 3 and hsh(cid, 9 + j) < 0.45:   # башенка с куполом на углу у трассы (KartaView S 3957–4025)
            dv = dome_vertex(cp)
            if dv is not None:
                k['dome'] = [dv]; k['domeCol'] = DOMES[int(hsh(cid, 10) * len(DOMES))]
        rc = roof_col(cp) if not wb else None
        if rc:
            k['roof'] = rc
        rows.append(dict(id=cid + ('' if len(parts) == 1 else '-%d' % (j + 1)), S=s, d=d, name=name, h=hh, col=col, plain=plain,
                         inside=inside, wb=wb, pts=cp, tags=tags, sk=k))

rows.sort(key=lambda r: r['S'])
wall_rows.sort(key=lambda r: r['S'])
poly = lambda pts: '[' + ','.join('[%.6f,%.6f]' % ll_of(x, z) for x, z in pts) + ']'
L = []
L.append("  /* Город (v1.17.3 Старый город, v1.17.4 весь круг) — строки считает tools/baku-scan/city.py (повторный запуск заменяет блок). Участок S %d–%d:" % CITY)
L.append("     крепостная стена Ичери-Шехер — по границе района OSM (w%s, полоса %.0f м, высота %.0f м, зубцы), куски ближе %d м к осевой;" % (OLD_CITY, WALL_T, WALL_H, FAR))
L.append("     дома OSM ближе %d м (из контура вычтены коридор трассы и стена); h — над землёй (рельефа нет); ближе %d м — окна проёмами. */" % (FAR, NEAR))
L.append("  boxesOff: [[%d, %d]],   // на участке с домами OSM обобщённых серых коробок нет (с v1.17.4 — весь круг)" % CITY)
L.append("  buildings: [")
for r in wall_rows:
    L.append("    {name:'Fortress wall', h:%.1f, color:'%s', band:'%s', plain:1, crenel:1, poly:%s}," % (WALL_H, WALL_COL, WALL_COL, poly(r['pts'])))
for r in rows:
    extra = ', plain:1, crenel:1' if r['wb'] else ', plain:1' if r['plain'] else (', win:1' if r['d'] <= NEAR and 'glass' not in r['sk'] else '')
    for kk, vv in r['sk'].items():                        # детали фасада (v1.17.6): окна и балконы — только у домов с окнами
        if not vv or (kk in ('winW', 'winH', 'winGap', 'balc', 'arch', 'shop', 'rust', 'belt', 'floor') and r['d'] > NEAR and kk != 'floor'):
            continue
        extra += ', %s:%s' % (kk, ("'%s'" % vv) if isinstance(vv, str) else json.dumps(vv) if isinstance(vv, list) else ('%g' % vv))
    L.append("    {name:'%s', h:%.1f, color:'%s', band:'%s'%s, poly:%s}," % ((r['name'] or r['id']).replace("'", ''), r['h'], r['col'],
             r['col'] if r['plain'] else '#5f6368', extra, poly(r['pts'])))
L.append("  ],")
block = '\n'.join(L) + '\n'

for r in rows:
    print('#', r['id'], 'S%d' % r['S'], 'd%.0f' % r['d'], 'h %.1f' % r['h'], 'внутри' if r['inside'] else '', len(r['pts']),
          {k: v for k, v in r['tags'].items() if k in ('building', 'building:levels', 'height', 'name')}, file=sys.stderr)
print('# крепостная стена: %d кусков; домов (кусков): %d, из них ближе %d м: %d, внутри стены: %d' % (
    len(wall_rows), len(rows), NEAR, sum(1 for r in rows if r['d'] <= NEAR), sum(1 for r in rows if r['inside'])), file=sys.stderr)

HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'index.html')
s = open(HTML).read()
a = s.index('const SCENERY_BAKU = {')
b = s.index('\n};', a)
body = s[a:b]
body = re.sub(r"\n  /\* (Старый город \(v1\.17\.3\)|Город \(v1\.17\.3).*?\n  \],\n?", '\n', body, flags=re.S)
body = body.rstrip('\n') + '\n' + block.rstrip('\n')
s = s[:a] + body + s[b:]
open(HTML, 'w').write(s)
print('index.html: блок «Город» — %d строк' % (len(wall_rows) + len(rows)), file=sys.stderr)
