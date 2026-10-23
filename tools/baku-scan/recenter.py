#!/usr/bin/env python3
"""Контур Баку на середину замеренной дороги (по образцу monaco-scan/recenter.py).
1) контур OSM (az-osm.geojson, 217 точек, отрезки до ~100 м) пересэмплирован через STEP м — иначе на длинном отрезке
   нельзя сдвинуть середину, меняющуюся по ходу (главная прямая: то вся ширина проспекта, то половина);
2) каждая точка сдвинута по нормали на середину кромок (L+R)/2 из edges.tsv, сдвиг сглажен по кругу σ=SIG м;
3) полуширина (L−R)/2 перенесена на новую дугу -> az-center-width.tsv (S новой линии от «Start Line», полуширина).
Пишет az-center.geojson и печатает сводку: длина, наименьший радиус, развороты кривизны, отступ ниток телеметрии.

    python3 recenter.py [--step=8] [--sig=12]
"""
import json, math, sys, numpy as np, bk
STEP = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--step=')), 8))
SIG = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--sig=')), 12))
E = np.array([[float(x) for x in l.split('\t')[:3]] for l in open('edges.tsv').read().splitlines()[1:]])
ES, EL, ER = E[:, 0], E[:, 1], E[:, 2]; T = bk.TOT


def circ(s, v, sig):
    out = np.empty_like(v)
    for i, s0 in enumerate(s):
        d = (s - s0 + T / 2) % T - T / 2; w = np.exp(-0.5 * (d / sig) ** 2); out[i] = (w * v).sum() / w.sum()
    return out


S = np.arange(0, T, STEP)
P = np.array([bk.at(s)[0] for s in S])
N = []
for s in S:
    q1, _ = bk.at(s - 4); q2, _ = bk.at(s + 4); t = np.subtract(q2, q1); t /= np.hypot(*t); N.append((-t[1], t[0]))
N = np.array(N)
C = np.interp(S, ES, (EL + ER) / 2, period=T); H = np.interp(S, ES, (EL - ER) / 2, period=T)
Cs = circ(S, C, SIG)
Q = P + N * Cs[:, None]
# новая дуга
seg = np.hypot(*np.diff(np.vstack([Q, Q[:1]]), axis=0).T); S2 = np.concatenate([[0], np.cumsum(seg)])[:-1]; L2 = seg.sum()
# кривизна: поворот на ±3 точки (~24 м), как мера в игре
def head(i): d = Q[(i + 1) % len(Q)] - Q[i]; return math.atan2(d[1], d[0])
hd = np.array([head(i) for i in range(len(Q))])
K = np.array([((hd[(i + 3) % len(Q)] - hd[i - 3] + math.pi) % (2 * math.pi)) - math.pi for i in range(len(Q))])
Rr = np.array([abs(6 * STEP / k) if abs(k) > 1e-6 else 1e9 for k in K])
flips = sum(1 for i in range(len(K)) if abs(K[i]) > 0.05 and abs(K[i - 1]) > 0.05 and K[i] * K[i - 1] < 0)
# Две ноги навстречу бок о бок (Нефтчиляр: S 2040–2400 и 4600–4920): между кромками не меньше GAP_LEGS — там общая стена.
# Игра ставит стену не ближе HW+0.6 к своей осевой и не дальше середины между осевыми (buildWallProfile), а полотно в складке
# сужает до (d−1.4)/2 (buildWidth): при HW ≤ (d−GAP_LEGS)/2 стены двух ног сходятся в одну линию, не заходя друг на друга.
GAP_LEGS = 2.4
capped = 0
for i in range(len(Q)):
    d = np.hypot(*(Q - Q[i]).T); far = np.minimum(abs(np.arange(len(Q)) - i), len(Q) - abs(np.arange(len(Q)) - i)) > 8
    j = np.argmin(np.where(far, d, 1e9)); t1 = Q[(i + 1) % len(Q)] - Q[i - 1]; t2 = Q[(j + 1) % len(Q)] - Q[j - 1]
    if d[j] < 2 * H[i] + 2 and (t1 @ t2) / (np.hypot(*t1) * np.hypot(*t2)) < -0.77 and H[i] > (d[j] - GAP_LEGS) / 2:
        H[i] = (d[j] - GAP_LEGS) / 2; capped += 1
print('ноги бок о бок: полуширина урезана на %d точках (между кромками %.1f м)' % (capped, GAP_LEGS))
co = [[round(bk.LON0 + x / bk.MPD_LON, 7), round(bk.LAT0 + y / bk.MPD_LAT, 7)] for x, y in Q]; co.append(co[0])
g = json.load(open('az-osm.geojson')); g['features'][0]['geometry']['coordinates'] = co
g['features'][0]['properties']['note'] = 'az-osm пересэмплирован через %g м и пересажен на середину кромок edges.tsv (tools/baku-scan/recenter.py)' % STEP
json.dump(g, open('az-center.geojson', 'w'))
open('az-center-width.tsv', 'w').write('S\thalf\tshift\n' + ''.join('%.1f\t%.2f\t%.2f\n' % r for r in zip(S2, H, Cs)))
print('точек %d, круг %.1f м (был %.1f); сдвиг медиана |%.2f|, наибольший %+.2f м; полуширина %.2f…%.2f' % (len(Q), L2, T, np.median(abs(Cs)), Cs[np.argmax(abs(Cs))], H.min(), H.max()))
print('наименьший радиус (мера ±3 точки): %.1f м у S %.0f; разворотов кривизны %d' % (Rr.min(), S2[np.argmin(Rr)], flips))
