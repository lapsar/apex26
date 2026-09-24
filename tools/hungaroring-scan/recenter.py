#!/usr/bin/env python3
"""Пересадка контура Хунгароринга на середину дороги (§10 п.27 а, v1.16.4).

ЧТО ДЕЛАЕТ. `bacinger/hu-1986` гуляет от середины полотна на ±5 м. Середину
дают два независимых источника: снимок (`halfwidth.py` → edges.json, станции
через 10 м) и контур OSM (way 231328650 + 1333262244 → osm_way.json). Скрипт
сводит их в один отступ «середина минус контур» вдоль круга, сглаживает его
и сдвигает КАЖДУЮ ТОЧКУ контура вбок на этот отступ. Число точек и их порядок
не меняются — форма та же, сдвиг только боковой.

    python3 recenter.py          # три прохода, в конце hu-1986-center.geojson

ПОЧЕМУ ПРОХОДОВ НЕСКОЛЬКО. В шикане 6-7 (S≈2360 от линии старта) проекция
на ломаную вырождается: у вершины точки обоих источников не находят «своего»
отрезка, станции пустеют, и первый проход оставил там 3-4 м недосдвига — это
сказали ОБА источника, промеренные уже по новому контуру. Поэтому проход
повторяется: каждый следующий меряет снимок и OSM по контуру предыдущего
и досдвигает остаток. Каждый проход сам качает снимок заново через
`halfwidth.py` (тайлы в кэше на диске).

КАК СВОДИТСЯ. На станции берётся медиана доступных источников (снимок, OSM).
Снимок местами ловит не ту полосу (худший выброс 13.9 м) — поэтому сначала
скользящая медиана по 7 станциям (70 м) и отбраковка точек дальше 2 м от неё,
потом гауссово сглаживание σ=20 м.

ЛИНИЯ СТАРТА на каждом проходе переносится ГЕОГРАФИЧЕСКИ: точка старой линии
(S=4119.1 на исходной ломаной, проверена снимком, арифметикой дистанции
и решёткой openf1) проецируется на новый контур. В игре sfShift меряется
по сплайну, а не по ломаной, — его подбирает проверка в node (журнал v1.16.4).

ПРОВЕРКА ПОСЛЕ. `python3 halfwidth.py` (prof.py по умолчанию смотрит на новый
файл) — остаток сдвига обязан лечь в разброс Майами (±1.5 м).
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ORIG, SF0 = os.path.join(HERE, 'hu-1986.geojson'), 4119.1
FINAL = os.path.join(HERE, 'hu-1986-center.geojson')
PASSES = 3

if '--pass' not in sys.argv:
    # ведущий: проход = замер снимка по текущему контуру + досдвиг
    import subprocess
    cur, sf = ORIG, SF0
    for k in range(1, PASSES + 1):
        out = FINAL if k == PASSES else os.path.join(HERE, 'hu-1986-pass%d.geojson' % k)
        env = dict(os.environ, HUNGARO_GEOJSON=cur, HUNGARO_SF=str(sf))
        print('=== проход %d: %s, линия старта S=%.1f' % (k, os.path.basename(cur), sf))
        subprocess.run([sys.executable, os.path.join(HERE, 'halfwidth.py')], env=env,
                       cwd=HERE, check=True, stdout=subprocess.DEVNULL)
        r = subprocess.run([sys.executable, __file__, '--pass', out], env=env, cwd=HERE,
                           check=True, capture_output=True, text=True).stdout
        print(r, end='')
        cur, sf = out, float(r.strip().split('SF=')[-1])
    sys.exit(0)

SRC = os.environ['HUNGARO_GEOJSON']
OUT = sys.argv[sys.argv.index('--pass') + 1]
sys.path.insert(0, HERE)
from prof import R, CUM, TOT, SF, LAT0, LON0, MPD_LON, MPD_LAT   # noqa: E402

P = np.array(R)
A = P; V = np.roll(P, -1, 0) - P
L = np.hypot(V[:, 0], V[:, 1]); CU = np.array(CUM)


def project(q):
    """точка -> (S от начала контура, отступ влево по ходу, невязка)"""
    t = np.clip(((q - A) * V).sum(1) / L ** 2, 0, 1)
    W = q - (A + V * t[:, None])
    d = np.hypot(W[:, 0], W[:, 1]); i = d.argmin()
    n = V[i] / L[i]
    return CU[i] + t[i] * L[i], n[0] * W[i, 1] - n[1] * W[i, 0], d[i]


N = int(round(TOT / 10))
ST = np.arange(N) * TOT / N                      # станции от НАЧАЛА контура, шаг ~10 м


def to_grid(S, O):
    """точки (S, O) -> массив на станциях, NaN где данных нет"""
    g = [[] for _ in range(N)]
    for s, o in zip(S, O):
        g[int(round((s % TOT) / TOT * N)) % N].append(o)
    return np.array([np.median(x) if x else np.nan for x in g])


# --- снимок: edges.json хранит (S от линии старта, левая, правая кромка)
ed = json.load(open(os.path.join(HERE, 'edges.json')))
img = to_grid([SF + r[0] for r in ed], [(r[1] + r[2]) / 2 for r in ed])

# --- OSM: точки пути, отступ от контура
OSMF = os.path.join(HERE, 'osm_way.json')
if not os.path.exists(OSMF):                     # кэш, в репозиторий не кладётся
    import urllib.parse, urllib.request
    q = urllib.parse.urlencode({'data': '[out:json];(way(231328650);way(1333262244););out geom;'}).encode()
    for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
        try:
            with urllib.request.urlopen(url, q, timeout=120) as r:
                open(OSMF, 'wb').write(r.read()); break
        except Exception:
            pass
osm = json.load(open(OSMF))
S_o, O_o = [], []
for el in osm['elements']:
    g = el['geometry']
    for a, b in zip(g, g[1:]):                   # точки через ~2 м, чтобы станции были все
        k = max(1, int(math.hypot((b['lon'] - a['lon']) * MPD_LON, (b['lat'] - a['lat']) * MPD_LAT) / 2))
        for j in range(k):
            la = a['lat'] + (b['lat'] - a['lat']) * j / k
            lo = a['lon'] + (b['lon'] - a['lon']) * j / k
            s, o, d = project(np.array([(lo - LON0) * MPD_LON, (la - LAT0) * MPD_LAT]))
            if d < 15:
                S_o.append(s); O_o.append(o)
osmg = to_grid(S_o, O_o)


def circ_med(x, w):
    h = w // 2; out = np.full(N, np.nan)
    for i in range(N):
        v = x[[(i + d) % N for d in range(-h, h + 1)]]
        v = v[~np.isnan(v)]
        if len(v):
            out[i] = np.median(v)
    return out


def clean(x):
    m = circ_med(x, 7)
    y = x.copy(); y[np.abs(x - m) > 2.0] = np.nan
    return y


img_c, osm_c = clean(img), clean(osmg)
both = ~np.isnan(img_c) & ~np.isnan(osm_c)
print('станций %d (шаг %.2f м); снимок %d, OSM %d, оба %d'
      % (N, TOT / N, (~np.isnan(img_c)).sum(), (~np.isnan(osm_c)).sum(), both.sum()))
print('снимок против OSM: корреляция %+.3f, медиана |разности| %.2f м'
      % (np.corrcoef(img_c[both], osm_c[both])[0, 1], np.median(np.abs(img_c - osm_c)[both])))

with np.errstate(all='ignore'):
    import warnings; warnings.simplefilter('ignore')
    comb = np.nanmedian(np.vstack([img_c, osm_c]), axis=0)
# гауссово сглаживание по кругу, пропуски не участвуют
sig = 2.0                                          # в станциях, то есть 20 м
ker = np.exp(-0.5 * (np.arange(-8, 9) / sig) ** 2)
off = np.empty(N)
for i in range(N):
    idx = [(i + d) % N for d in range(-8, 9)]
    v = comb[idx]; ok = ~np.isnan(v)
    off[i] = (v[ok] * ker[ok]).sum() / ker[ok].sum()
print('отступ середины от контура (+ влево): медиана %+.2f, 10%%=%+.2f 90%%=%+.2f, '
      'крайние %+.2f / %+.2f м; быстрее всего меняется на %.2f м за 10 м'
      % (np.median(off), np.percentile(off, 10), np.percentile(off, 90), off.min(), off.max(),
         np.abs(np.diff(np.append(off, off[0]))).max()))

# --- сдвиг точек контура: нормаль в точке — биссектриса соседних отрезков
geo = json.load(open(SRC))
gc = geo['features'][0]['geometry']['coordinates']
closed = gc[0] == gc[-1]
new = []
for i in range(len(P)):
    t0 = V[i - 1] / L[i - 1]; t1 = V[i] / L[i]
    t = t0 + t1; t /= np.hypot(*t)
    n = np.array([-t[1], t[0]])
    o = np.interp(CU[i], np.append(ST, TOT), np.append(off, off[0]))
    x, y = P[i] + n * o
    new.append([round(LON0 + x / MPD_LON, 7), round(LAT0 + y / MPD_LAT, 7)])
if closed:
    new.append(new[0])
geo['features'][0]['geometry']['coordinates'] = new
geo['features'][0]['properties']['recentered'] = (
    'bacinger hu-1986, точки сдвинуты вбок на середину полотна по снимку и OSM, tools/hungaroring-scan/recenter.py')
json.dump(geo, open(OUT, 'w'), ensure_ascii=False)
print('записан', os.path.basename(OUT))

# линия старта: точка ИСХОДНОЙ линии старта, спроецированная на новый контур
Q = np.array([[(p[0] - LON0) * MPD_LON, (p[1] - LAT0) * MPD_LAT] for p in new[:len(P)]])
Vq = np.roll(Q, -1, 0) - Q; Lq = np.hypot(*Vq.T); cq = np.concatenate([[0], np.cumsum(Lq)])
os.environ['HUNGARO_GEOJSON'] = ORIG
import importlib, prof                                      # noqa: E402
importlib.reload(prof)
la, lo = prof.latlon(*prof.at(SF0)[0])
p0 = np.array([(lo - LON0) * MPD_LON, (la - LAT0) * MPD_LAT])
t = np.clip(((p0 - Q) * Vq).sum(1) / Lq ** 2, 0, 1)
d = np.hypot(*(p0 - (Q + Vq * t[:, None])).T); i = d.argmin()
print('новый контур (ломаная) %.1f м против %.1f; линия старта вбок %.2f м, SF=%.1f'
      % (cq[-1], TOT, d[i], cq[i] + t[i] * Lq[i]))
