#!/usr/bin/env python3
"""Привязка кадров онбоарда Баку к месту на трассе (по образцу Монако, onboard/kadry.tsv).
Видео — поул Расселла 2026 (1:42.526), нарезка владельца fps=4, 452 кадра. Таймер круга на кадрах:
кадр 12 — 0.0, 32 — 4.8, 312 — 1:14.8, 412 — 1:39.8: ровно 5.0 с на 20 кадров, t = 0.25·N − 3.2 с (±0.1).
Время → положение и скорость openf1 этого же круга (сессия 11373, №63, openf1/lap_rus_2026_wide.json —
с запасом 5 с до и после; поправка времени DT) → совмещение fit.json → S по контуру (от линии старта, az-osm.geojson).

    python3 kadry.py      -> onboard/kadry.tsv
"""
import datetime, json, numpy as np, bk
T_OF = lambda n: 0.25 * n - 3.2
DT = -0.425    # сдвиг времени openf1 (как у Хунгароринга −0.42): на узел OSM «Finish Line» ложатся оба конца круга —
               # ноль таймера (−0.43 с, остаток 0.0 м) и 1:42.526 (−0.42 с, остаток 0.4 м)
D = json.load(open('openf1/lap_rus_2026_wide.json'))
t0 = datetime.datetime.fromisoformat(D['date_start'])
sec = lambda r: (datetime.datetime.fromisoformat(r['date']) - t0).total_seconds()
L = sorted(D['location'], key=sec); C = sorted(D['car'], key=sec)
tl = np.array([sec(r) for r in L]); xs = np.array([r['x'] for r in L], float); ys = np.array([r['y'] for r in L], float); zs = np.array([r['z'] for r in L], float)
tc = np.array([sec(r) for r in C]); vs = np.array([r['speed'] for r in C], float)
fit = json.load(open('openf1/fit.json')); Rm = np.array(fit['R']); s = fit['s']; tr = np.array(fit['t']); mir = fit['mirror']
rows = []; prev = None
import glob
N = len(glob.glob('onboard/kadr_*.jpg'))
for n in range(1, N + 1):
    t = T_OF(n); tt = t + DT
    if tt < tl[0] or tt > tl[-1]: rows.append((n, t, None, None, None)); continue
    p = np.array([np.interp(tt, tl, xs), np.interp(tt, tl, ys)]) * 0.1 * [1, mir]
    q = s * (Rm @ p) + tr
    S = bk.proj(tuple(q))[0]
    rows.append((n, t, S, np.interp(tt, tc, vs), np.interp(tt, tl, zs) / 10))
open('onboard/kadry.tsv', 'w').write(
    '# кадр\tt_круга_с\tS_м\tскорость_кмч\tвысота_м   (t = 0.25*кадр - 3.2 по таймеру видео, openf1 — на 0.425 с раньше; S — от линии старта (узел OSM «Start Line»)\n'
    '# по контуру az-osm.geojson, положения openf1 круга 25 квалификации 2026 (№63); высота — z openf1/10)\n' +
    ''.join('%d\t%.2f\t%s\t%s\t%s\n' % (n, t, '' if S is None else '%.0f' % S, '' if v is None else '%.0f' % v, '' if z is None else '%.1f' % z) for n, t, S, v, z in rows))
ok = [r for r in rows if r[2] is not None]
print('кадров %d, привязано %d; t=0 (таймер) — S %.0f; конец круга t=102.526 — кадр %.1f' % (N, len(ok), [r for r in ok if abs(r[1]) < 0.13][0][2], (102.526 + 3.2) / 0.25))
