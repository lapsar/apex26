#!/usr/bin/env python3
"""ВРЕМЯ НА КРУГЕ ↔ МЕСТО НА ТРАССЕ для кадров онбоарда Хунгароринга (09.2026).

Метры из кадра не извлекаются — они считаются из времени (docs/notes/sources.md,
«Онбоард-видео как источник»). Видео даёт секунды от начала круга, телеметрия
openf1 того же круга даёт, где болид был в эту секунду.

    node    tools/hungaroring-scan/dump-cl.js      # осевая из игры -> centerline.json
    python3 tools/hungaroring-scan/laptime.py      # -> onboard/kadry.tsv

КРУГ: поул Леклера, квалификация Венгрии 2025 (session 9924, пилот 16, круг 17),
1:15.372, сектора 27.541 / 26.453 / 21.378 — ровно те, что на таймере видео.

ВРЕМЯ КАДРА: на каждом кадре таймер круга (десятые), и он даёт привязку
без подгонки по ориентирам: кадр N — это t = (N−2)/2 − 0.03 ± 0.03 с.
Вилку задают сектора: кадр 57 (27.5) ещё без отсечки S1=27.541, кадр 58 уже
с ней; кадр 110 (54.0) ещё без отсечки S2=53.994, кадр 111 с ней; кадр 152
(1:15.0) до финиша, 153 после. Таймер идёт шагом 0.5 на ВСЕХ 162 кадрах —
склеек и повторов в видео нет (ловушка №5 из sources.md).

НОЛЬ ТАЙМЕРА — ЛИНИЯ ФИНИША, А НЕ СТАРТА: в квалификации круг меряется
по линии финиша, а она у Хунгароринга на ~39 м раньше стартовой (tracks/
hungaroring.md). Поэтому t=0 лежит не на S=0 игры, а около S = круг − 39.
"""
import json, math, os, sys, datetime, urllib.parse, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SESSION, DRIVER, LAP = 9924, 16, 17
CACHE = os.path.join(HERE, 'openf1_lap_%d_%d_%d.json' % (SESSION, DRIVER, LAP))
FRAMES = 162                                 # кадров в onboard/
T_OF_FRAME = lambda n: (n - 2) / 2.0 - 0.03
FINISH_BACK = 38.6                           # линия финиша до линии старта, снимок (tracks/hungaroring.md)


def get(path, **q):
    url = 'https://api.openf1.org/v1/' + path + '?' + urllib.parse.urlencode(q, safe='<>=')
    req = urllib.request.Request(url, headers={'User-Agent': 'apex26-dev'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def fetch():
    if os.path.exists(CACHE):
        return json.load(open(CACHE))
    lap = [l for l in get('laps', session_key=SESSION, driver_number=DRIVER) if l['lap_number'] == LAP][0]
    t0 = datetime.datetime.fromisoformat(lap['date_start'])
    win = {'date>': (t0 - datetime.timedelta(seconds=4)).isoformat(),
           'date<': (t0 + datetime.timedelta(seconds=lap['lap_duration'] + 6)).isoformat()}
    d = dict(lap=lap,
             location=get('location', session_key=SESSION, driver_number=DRIVER, **win),
             car=get('car_data', session_key=SESSION, driver_number=DRIVER, **win))
    json.dump(d, open(CACHE, 'w'))
    return d


ts = lambda x: datetime.datetime.fromisoformat(x.replace('Z', '+00:00')).timestamp()
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
R = np.array([[-p[0], p[1]] for p in cl['P']])        # игра отражает X — вернуть
S = np.array(cl['S']); TOT = cl['len']
A, B = R, np.vstack([R[1:], R[:1]]); V = B - A; L2 = (V**2).sum(1); L2[L2 == 0] = 1e-9
SEG = np.hypot(*V.T)


def proj(pt):
    t = np.clip(((pt - A) * V).sum(1) / L2, 0, 1); P = A + V * t[:, None]
    dd = np.hypot(*(pt - P).T); i = int(np.argmin(dd))
    return dd[i], (S[i] + t[i] * SEG[i]) % TOT


d = fetch(); lap = d['lap']
loc = [p for p in d['location'] if p['x'] or p['y']]
F = np.array([[p['x'], p['y']] for p in loc], float) * 0.1
Fc = F - F.mean(0); Rm = R.mean(0)


def err(deg, off, step=4):
    th = math.radians(deg); c, s = math.cos(th), math.sin(th)
    Fr = Fc @ np.array([[c, -s], [s, c]]).T + off + Rm
    return float(np.mean([proj(p)[0] for p in Fr[::step]]))


be, bd = min((err(g, np.zeros(2), 8), g) for g in np.arange(0, 360, 1.0)); bo = np.zeros(2)
be = err(bd, bo)
for it in range(5):
    ds, os_ = 0.5 / 2**it, 4.0 / 2**it; moved = True
    while moved:
        moved = False
        for dd_ in (-ds, 0, ds):
            for dx in (-os_, 0, os_):
                for dy in (-os_, 0, os_):
                    if dd_ == dx == dy == 0: continue
                    e = err(bd + dd_, bo + np.array([dx, dy]))
                    if e < be - 1e-4: be, bd, bo = e, bd + dd_, bo + np.array([dx, dy]); moved = True
th = math.radians(bd); c, s = math.cos(th), math.sin(th)
W = Fc @ np.array([[c, -s], [s, c]]).T + bo + Rm
pr = [proj(p) for p in W]
off = np.array([p[0] for p in pr]); locS = np.array([p[1] for p in pr])
t0 = ts(lap['date_start'])
lt = np.array([ts(p['date']) - t0 for p in loc])
uw = locS.copy()                                       # развернуть через линию старта
for i in range(1, len(uw)):
    while uw[i] < uw[i-1] - TOT/2: uw[i] += TOT
    while uw[i] > uw[i-1] + TOT/2: uw[i] -= TOT
if np.any(np.diff(uw) < -3):
    print('ВНИМАНИЕ: путь идёт назад в %d местах' % int((np.diff(uw) < -3).sum()))
car = d['car']; ct = np.array([ts(p['date']) - t0 for p in car]); cv = np.array([p['speed'] for p in car], float)
V_of_t = lambda t: float(np.interp(t, ct, cv))
# Точки положения идут 3.7 раза в секунду (через ~22 м на прямой) и дрожат на
# несколько метров — голая интерполяция давала шаги кадров 53 и 35 м там, где
# болид шёл ровно 315 км/ч. Поэтому ход берётся из ИНТЕГРАЛА СКОРОСТИ (гладкий),
# а положение — из точек: их расхождение с интегралом сглаживается по времени
# (σ = 2 с) и прибавляется. Интеграл идёт по гоночной линии, осевая длиннее
# или короче её — это расхождение и забирает сглаженная поправка.
D = np.concatenate([[0], np.cumsum(np.diff(ct) * (cv[1:] + cv[:-1]) / 2 / 3.6)])
res = uw - np.interp(lt, ct, D)
tg = np.arange(lt[0], lt[-1], 0.05)
rg = np.interp(tg, lt, res)
k = np.exp(-0.5 * (np.arange(-120, 121) * 0.05 / 2.0) ** 2); k /= k.sum()
rs = np.convolve(np.pad(rg, 120, mode='edge'), k, mode='valid')
S_of_t = lambda t: float(np.interp(t, ct, D) + np.interp(t, tg, rs)) % TOT
print('шум точек положения против сглаженного пути: СКО %.1f м'
      % float(np.std(res - np.interp(lt, tg, rs))))

print('Венгрия 2025, квалификация, Леклер, круг %d: %.3f с (S1 %.3f, S2 %.3f, S3 %.3f)'
      % (LAP, lap['lap_duration'], lap['duration_sector_1'], lap['duration_sector_2'], lap['duration_sector_3']))
print('совмещение с осевой игры: угол %.2f°, средняя ошибка %.2f м (90 %% точек ближе %.1f м), точек %d'
      % (bd, be, float(np.percentile(off, 90)), len(loc)))
Tl = lap['lap_duration']
sf, ff = S_of_t(0), S_of_t(Tl)
print('БЕЗ ПОПРАВКИ: t=0 на S = %.1f м (%.1f м до линии старта), t=%.3f на S = %.1f м'
      % (sf, (TOT - sf) % TOT, Tl, ff))
# Поправка времени: ноль таймера — линия ФИНИША (на кадрах 2-3 болид проходит
# сперва её, потом клетку поула и линию старта), а она на FINISH_BACK м раньше
# линии старта игры. Сдвиг ищется так, чтобы на неё легли ОБА конца круга.
dist = lambda a, b: ((a - b + TOT/2) % TOT) - TOT/2
FIN = TOT - FINISH_BACK
cand = np.arange(-1.5, 1.5, 0.001)
res = [abs(dist(S_of_t(x), FIN)) + abs(dist(S_of_t(Tl + x), FIN)) for x in cand]
DT = float(cand[int(np.argmin(res))])
print('ПОПРАВКА openf1: %+.3f с; тогда t=0 на S = %.1f, t=%.3f на S = %.1f (линия финиша %.1f)'
      % (DT, S_of_t(DT), Tl, S_of_t(Tl + DT), FIN))
S_raw = S_of_t
S_of_t = lambda t: S_raw(t + DT)
V_raw = V_of_t
V_of_t = lambda t: V_raw(t + DT)
s1 = lap['duration_sector_1']; s2 = s1 + lap['duration_sector_2']
print('отсечки секторов: S1 на S = %.0f м, S2 на S = %.0f м' % (S_of_t(s1), S_of_t(s2)))

out = os.path.join(HERE, 'onboard', 'kadry.tsv')
with open(out, 'w') as f:
    f.write('# кадр\tt_круга_с\tS_игры_м\tскорость_кмч   (laptime.py; S — от линии старта игры, t ±0.03 с)\n')
    for n in range(1, FRAMES + 1):
        t = T_OF_FRAME(n)
        f.write('%d\t%.2f\t%.0f\t%.0f\n' % (n, t, S_of_t(t), V_of_t(t)))
print('таблица кадр -> место: %s (%d кадров)' % (os.path.relpath(out, HERE), FRAMES))
