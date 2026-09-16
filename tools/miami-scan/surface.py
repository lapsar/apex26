#!/usr/bin/env python3
"""ЧТО ЛЕЖИТ ЗА КРОМКОЙ МАЙАМИ: замер по спутнику + карта вида сверху.

Отвечает на вопрос владельца (09.2026): «у нас везде зелёная трава, а трасса вся
в асфальте, в зонах вылета ещё и покрашенном». Мерит по развёртке круга в ленту.

    node   tools/miami-scan/dump-cl.js            # осевая из игры
    python3 tools/miami-scan/unroll.py goog 20 60 0.25
    python3 tools/miami-scan/surface.py [goog 20] [--zones] [--map=файл.svg]

Что печатает: чем покрыты первые метры за кромкой, насколько далеко тянется
твёрдое покрытие и где лежит бирюзовая краска зон вылета. С ключом --zones
печатает готовые строки разметки `runoff` для SCENERY_MIAMI.

ТРИ ЛОВУШКИ, каждую нашёл замер:
 1. «Синее» на снимке — не всегда зона: теннисные корты Miami Open стоят вдоль
    трассы на S 1900-2100 и по цвету НЕРАЗЛИЧИМЫ с краской. Поэтому краска
    засчитывается только непрерывной ОТ КРОМКИ (не дальше 2.5 м за ней).
 2. Кромка берётся по БЕЛОЙ линии на снимке, а не по нашей полуширине: так
    заодно проверяется посадка контура. Сверка (09.2026): ширина полотна
    по снимку 14.5 м против наших 14.0, сдвиг осевой от настоящей середины
    медиана -0.1 м — то есть этап 1 сел точно.
 3. Корты примыкают к трассе ВПЛОТНУЮ (S 1900-2100 справа), поэтому одной
    непрерывности мало: синее поле шире PAINT_MAX = 22 м зоной не считается.
    Настоящие зоны Майами по замеру 2-11 м, корты дают 40-48 м подряд.
 4. Узкая (около метра) бирюзовая кайма вдоль кромки видна на Google z20
    на 24-46 % круга, а на ESRI z19 — на 5-8 %. Расхождение вчетверо: это
    ореол JPEG на границе тёмного полотна и светлого асфальта, а не краска.
    Как эталон такая кайма НЕ годится; широкие зоны оба снимка дают одинаково.
"""
import json, math, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'goog'
ZOOM = int(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else 20
ZONES = '--zones' in sys.argv
MAP = next((a.split('=')[1] for a in sys.argv if a.startswith('--map=')),
           os.path.join(HERE, 'miami-surface.svg'))

cl = json.load(open(os.path.join(HERE, 'centerline.json')))
meta = json.load(open(os.path.join(HERE, f'unrolled_{SRC}_{ZOOM}.json')))
img = np.asarray(Image.open(os.path.join(HERE, f'unrolled_{SRC}_{ZOOM}.png')).convert('RGB')).astype(np.int16)
M, ncol = img.shape[0], img.shape[1]
half_w, step = meta['half_w'], meta['step']
S = np.array(cl['S']); HALF = cl['half']
P = [(-p[0], p[1]) for p in cl['P']]          # мир игры отражён по X -> география
R = [(-r[0], r[1]) for r in cl['R']]
r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
v = img.max(2); mn = img.min(2)
off = np.arange(ncol) * step - half_w
PAINT = ((b - r) > 55) & ((g - r) > 20)       # бирюза: яркая, не тёмная вода
GRASS = ((g - r) > 6) & ((g - b) > 6) & (v < 200)
HARD  = ~GRASS & (v > 55)                     # асфальт, бетон, краска — всё твёрдое
WHITE = (v > 165) & ((v - mn) < 45)

def edge(i, sgn):
    """кромка по самой яркой белой линии в полосе 3.5..11.5 м"""
    best = None
    for k in range(ncol):
        d = sgn * off[k]
        if 3.5 <= d <= 11.5 and WHITE[i, k] and (best is None or v[i, k] > best[0]):
            best = (v[i, k], d)
    return best[1] if best else HALF

E = {'L': np.array([edge(i, -1) for i in range(M)]),
     'R': np.array([edge(i,  1) for i in range(M)])}
for side in 'LR':                       # настоящая кромка гладкая: медиана по +-5 станций
    E[side] = np.array([np.median([E[side][(i + k) % M] for k in range(-5, 6)]) for i in range(M)])

PAINT_MAX = 22.0        # зона вылета такой ширины бывает, теннисный корт — нет (см. ловушку 4)

def scan(i, side):
    sgn = -1 if side == 'L' else 1
    e = E[side][i]
    hard = 0.0; bad = 0; paint = 0.0; run = 0.0; gap = 0.0; start = None; pstart = None
    d = e + 0.25
    while d <= half_w - 0.5:
        k = int(round((sgn * d + half_w) / step))
        if not (0 <= k < ncol): break
        if HARD[i, k]: hard = d - e; bad = 0
        else:
            bad += 1
            if bad >= 6: break                 # 1.5 м подряд мягкого — конец твёрдого
        if PAINT[i, k]:
            if run == 0: start = d
            run += 0.25; gap = 0
            if run > paint: paint, pstart = run, start
        else:
            gap += 0.25
            if gap > 1.0: run = 0; start = None
        d += 0.25
    if pstart is None or pstart - e > 2.5: paint = 0.0     # оторвалась от кромки — корты, не зона
    if paint > PAINT_MAX: paint = 0.0                      # сплошное синее поле шире зоны — тоже корты
    return hard, paint

HARDW = {'L': [], 'R': []}; PAINTW = {'L': [], 'R': []}
for i in range(M):
    for side in 'LR':
        h, p = scan(i, side); HARDW[side].append(h); PAINTW[side].append(p)
for side in 'LR':
    HARDW[side] = np.array(HARDW[side]); PAINTW[side] = np.array(PAINTW[side])

print('снимок %s z%d, %d станций' % (SRC, ZOOM, M))
print('КРОМКА: слева %.1f м от осевой, справа %.1f, ширина полотна %.1f (у нас %.1f)'
      % (np.median(E['L']), np.median(E['R']), np.median(E['L'] + E['R']), 2 * HALF))
print()
print('ТВЁРДОЕ ПОКРЫТИЕ ЗА КРОМКОЙ (непрерывно от неё):')
for side, nm in (('L', 'слева '), ('R', 'справа')):
    h = HARDW[side]
    print('  %s медиана %5.1f м · не меньше 5 м на %3.0f %% круга · меньше 2 м на %3.0f %%'
          % (nm, np.median(h), 100 * (h >= 5).mean(), 100 * (h < 2).mean()))
print('БИРЮЗОВАЯ КРАСКА (примыкает к кромке):')
for side, nm in (('L', 'слева '), ('R', 'справа')):
    p = PAINTW[side]; has = p >= 1.5
    print('  %s есть на %3.0f %% круга · где есть, ширина медиана %.1f м, максимум %.1f'
          % (nm, 100 * has.mean(), np.median(p[has]) if has.any() else 0, p.max()))

def runs(side):
    """участки одного покрытия длиннее 32 м"""
    typ = ['paint' if PAINTW[side][i] >= 1.5 else ('asphalt' if HARDW[side][i] >= 1.5 else None)
           for i in range(M)]
    i = 0
    while i < M:                                            # заклеить дыры короче 32 м
        j = i
        while j + 1 < M and typ[j + 1] == typ[i]: j += 1
        if S[j] - S[i] < 32 and 0 < i and j < M - 1 and typ[i - 1] == typ[j + 1]:
            for k in range(i, j + 1): typ[k] = typ[i - 1]
        i = j + 1
    out = []; i = 0
    while i < M:
        if typ[i] is None: i += 1; continue
        j = i
        while j + 1 < M and typ[j + 1] == typ[i]: j += 1
        if S[j] - S[i] >= 32: out.append((i, j, typ[i]))
        i = j + 1
    return out

if ZONES:
    o = cl['geo']
    def deg(i, side, d):
        s = -1 if side == 'L' else 1
        x = -(P[i][0] + R[i][0] * s * d); z = P[i][1] + R[i][1] * s * d   # обратно в мир игры
        return o['lat0'] + z / 110540.0, o['lon0'] - x / o['mlon']
    print('\n  runoff: [')
    for side in 'LR':
        for a, bb, t in runs(side):
            w = PAINTW[side][a:bb + 1] if t == 'paint' else HARDW[side][a:bb + 1]
            width = int(min(14, max(3, round(float(np.median(w))))))
            la, lo = deg(a, side, E[side][a]); lb, lb2 = deg(bb, side, E[side][bb])
            print("    {fromS:%d,toS:%d,side:'%s',type:'%s',width:%d, fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},   // по снимку %.1f м"
                  % (round(S[a]), round(S[bb]), side, t, width, la, lo, lb, lb2, float(np.median(w))))
    print('  ],')

# ---------------------------------------------------------------- карта
COL = {'paint': '#1fa8d8', 'asphalt': '#8d939b', None: '#4aa84a'}
xs = [p[0] for p in P]; ys = [p[1] for p in P]
pad = 120; x0, x1 = min(xs) - pad, max(xs) + pad; y0, y1 = min(ys) - pad, max(ys) + pad
sc = 1400 / max(x1 - x0, y1 - y0); Wd = (x1 - x0) * sc; Ht = (y1 - y0) * sc
pt = lambda p: ((p[0] - x0) * sc, (y1 - p[1]) * sc)
at = lambda i, side, d: (P[i][0] + R[i][0] * (-1 if side == 'L' else 1) * d,
                         P[i][1] + R[i][1] * (-1 if side == 'L' else 1) * d)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{Wd:.0f}" height="{Ht + 60:.0f}" viewBox="0 0 {Wd:.0f} {Ht + 60:.0f}">',
       '<rect width="100%" height="100%" fill="#14171b"/>']
d = ' '.join(('M' if i == 0 else 'L') + '%.1f %.1f' % pt(P[i]) for i in range(M)) + ' Z'
svg.append(f'<path d="{d}" fill="none" stroke="#2b2f36" stroke-width="{2 * HALF * sc:.1f}"/>')
for side in 'LR':
    for i in range(M):
        j = (i + 1) % M
        t = 'paint' if PAINTW[side][i] >= 1.5 else ('asphalt' if HARDW[side][i] >= 1.5 else None)
        a = pt(at(i, side, E[side][i] + 1.2)); c = pt(at(j, side, E[side][j] + 1.2))
        svg.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{c[0]:.1f}" y2="{c[1]:.1f}" '
                   f'stroke="{COL[t]}" stroke-width="{5 * sc:.1f}" stroke-linecap="round"/>')
for s in (228, 280, 328, 2980, 3028, 3080, 4772, 4820, 4872):     # щиты торможения
    i = int(round(s / S[-1] * M)) % M
    side = 'L' if s < 400 else 'R'
    q = pt(at(i, side, E[side][i] + 3))
    svg.append(f'<circle cx="{q[0]:.1f}" cy="{q[1]:.1f}" r="4" fill="#ffd166"/>')
for s, txt in ((378, 'T1'), (3129, 'T11'), (4921, 'T17')):
    i = int(round(s / S[-1] * M)) % M; q = pt(at(i, 'L', E['L'][i] + 26))
    svg.append(f'<text x="{q[0]:.0f}" y="{q[1]:.0f}" fill="#ffd166" font-family="sans-serif" font-size="20">{txt}</text>')
for k, (t, c) in enumerate((('за кромкой асфальт', '#8d939b'), ('покрашенная зона', '#1fa8d8'),
                            ('трава', '#4aa84a'), ('щит торможения', '#ffd166'))):
    svg.append(f'<rect x="{20 + k * 260}" y="{Ht + 18:.0f}" width="26" height="12" fill="{c}"/>'
               f'<text x="{52 + k * 260}" y="{Ht + 29:.0f}" fill="#d8dde3" font-family="sans-serif" font-size="15">{t}</text>')
svg.append('</svg>')
open(MAP, 'w').write('\n'.join(svg))
print('\nкарта: %s' % MAP)
