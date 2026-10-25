#!/usr/bin/env python3
"""Контур Баку на середину замеренной дороги (по образцу monaco-scan/recenter.py).
1) контур OSM (az-osm.geojson, 217 точек, отрезки до ~100 м) пересэмплирован через STEP м — иначе на длинном отрезке
   нельзя сдвинуть середину, меняющуюся по ходу (главная прямая: то вся ширина проспекта, то половина);
2) каждая точка сдвинута по нормали на середину кромок (L+R)/2 из edges.tsv, сдвиг сглажен по кругу σ=SIG м;
3) полуширина (L−R)/2 перенесена на новую дугу -> az-center-width.tsv (S новой линии от «Start Line», полуширина);
4) (v1.17.14) сглаживание — владелец 25.10.2026: «довольно острые углы, пройдись по трассе на дрожание кромки». Кромка игры —
   осевая ± полуширина; в тугих поворотах улиц (T7, T8, T9, T12, T15, T16) осевая поворачивала на 30–45° в ОДНОЙ точке через 8 м,
   а полуширина менялась ступенькой до 1.2 м на 10 м — кромка и поребрик выходили ломаными (справка tools/edge-kinks.js).
   Осевая — среднее по Гауссу (σ GSIG м), только поперёк; полуширина — среднее по ±WSIG м, затем подъём
   не круче WSLOPE м на метр (только вниз: уже замера — да, шире — нет; ноги бок о бок — тот же предел GAP_LEGS). Таубин
   (tools/contour-smooth.js) с пределом сдвига здесь не годится: предел, обрезая сдвиг, сам ставит новый излом.
Пишет az-center.geojson и печатает сводку: длина, наименьший радиус, развороты кривизны, отступ ниток телеметрии.

    python3 recenter.py [--step=8] [--sig=12] [--gsig=8] [--wsig=8] [--wslope=0.06] [--out=префикс]
"""
import json, math, sys, numpy as np, bk
STEP = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--step=')), 8))
SIG = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--sig=')), 12))
opt = lambda k, d: type(d)(next((a.split('=')[1] for a in sys.argv if a.startswith('--%s=' % k)), d))
# KEEP (S0, S1 по az-osm, доля сдвига): апекс T12 — поребрик на онбоарде k244–k245 в 2–3.5 м от камеры, у нитки F1; полное сглаживание
# уводило его внутрь на ~2 м (поворот на 93° за 30 м), на краях участка — плавно по 12 м.
KEEP = [(2768, 2800, 0.25)]
GSIG, WSIG, WSLOPE, OUT = opt('gsig', 8.0), opt('wsig', 8.0), opt('wslope', 0.06), opt('out', '')
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
Q0 = Q.copy(); n = len(Q)
# Осевая: среднее по Гауссу с σ GSIG м, только ПОПЕРЁК (по нормали) — шаг 8 м и порядок точек те же. Ядро без отрицательных
# лепестков: точка уходит только к центру своего поворота (поворот «в одной точке» расходится на соседей), наружу — нет.
# Уиттекер по третьим разностям (дуги не трогает) пробовался: у подхода и выхода выброс НАРУЖУ до 0.64 м — карман T2 зашёл в дом
# на 7.6 м², стены лезли в фасады. GSIG 8 — подбор по справке edge-kinks.js: изломов кромки больше 6° — 3 (до 6.9°; Хунгароринг — 2),
# сдвиг до ~2.6 м (апекс T8), в остальных поворотах до ~1.9 м; круг короче на ~25 м (повороты срезаны, как у настоящих бордюров);
# GSIG 0 — без сглаживания (как до v1.17.14).
if GSIG > 0:
    kk = np.arange(-int(4 * GSIG / STEP) - 1, int(4 * GSIG / STEP) + 2); wk = np.exp(-0.5 * (kk * STEP / GSIG) ** 2); wk /= wk.sum()
    Qs = sum(w * np.roll(Q0, -k, 0) for k, w in zip(kk, wk))
    Tn = np.roll(Q0, -1, 0) - np.roll(Q0, 1, 0); Tn /= np.hypot(*Tn.T)[:, None]; Nn = np.stack([-Tn[:, 1], Tn[:, 0]], 1)
    off = ((Qs - Q0) * Nn).sum(1)
    for a, b, k in KEEP:                         # участки, где кромка замерена «жёстко» (поребрик апекса по онбоарду): сдвиг слабее
        u = np.clip(np.minimum(S - (a - 12), (b + 12) - S) / 12, 0, 1); off *= 1 - (1 - k) * u
    Q = Q0 + Nn * off[:, None]
else: off = np.zeros(n)
print('сглаживание осевой: σ %g м — сдвиг поперёк средний %.2f, наибольший %+.2f м у S %.0f' % (GSIG, abs(off).mean(), off[np.argmax(abs(off))], S[np.argmax(abs(off))]))
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
# полуширина: среднее по ±WSIG м, не шире замера и предела ног, затем подъём не круче WSLOPE (только вниз)
Hc = H.copy(); n = len(H)
H = circ(S, H, WSIG / 2) if WSIG > 0 else H
H = np.minimum(H, Hc + 0.15)                     # среднее не раздувает узкое место больше чем на 15 см
for i in range(n):                               # предел ног бок о бок — как выше, по сглаженной осевой
    d = np.hypot(*(Q - Q[i]).T); far = np.minimum(abs(np.arange(n) - i), n - abs(np.arange(n) - i)) > 8
    j = np.argmin(np.where(far, d, 1e9)); t1 = Q[(i + 1) % n] - Q[i - 1]; t2 = Q[(j + 1) % n] - Q[j - 1]
    if d[j] < 2 * H[i] + 2 and (t1 @ t2) / (np.hypot(*t1) * np.hypot(*t2)) < -0.77: H[i] = min(H[i], (d[j] - GAP_LEGS) / 2)
ds = np.hypot(*np.diff(np.vstack([Q, Q[:1]]), axis=0).T)
for _ in range(2):
    for k in range(2 * n): i, j = k % n, (k - 1) % n; H[i] = min(H[i], H[j] + WSLOPE * ds[j])
    for k in range(2 * n - 1, -1, -1): i, j = k % n, (k + 1) % n; H[i] = min(H[i], H[j] + WSLOPE * ds[i])
print('полуширина: среднее ±%.0f м, подъём не круче %.2f м/м — изменение наибольшее %+.2f м у S %.0f' % (WSIG, WSLOPE, (H - Hc)[np.argmax(abs(H - Hc))], S2[np.argmax(abs(H - Hc))]))
co = [[round(bk.LON0 + x / bk.MPD_LON, 7), round(bk.LAT0 + y / bk.MPD_LAT, 7)] for x, y in Q]; co.append(co[0])
g = json.load(open('az-osm.geojson')); g['features'][0]['geometry']['coordinates'] = co
g['features'][0]['properties']['note'] = 'az-osm пересэмплирован через %g м и пересажен на середину кромок edges.tsv (tools/baku-scan/recenter.py)' % STEP
json.dump(g, open(OUT + 'az-center.geojson', 'w'))
open(OUT + 'az-center-width.tsv', 'w').write('S\thalf\tshift\n' + ''.join('%.1f\t%.2f\t%.2f\n' % r for r in zip(S2, H, Cs)))
print('точек %d, круг %.1f м (был %.1f); сдвиг медиана |%.2f|, наибольший %+.2f м; полуширина %.2f…%.2f' % (len(Q), L2, T, np.median(abs(Cs)), Cs[np.argmax(abs(Cs))], H.min(), H.max()))
print('наименьший радиус (мера ±3 точки): %.1f м у S %.0f; разворотов кривизны %d' % (Rr.min(), S2[np.argmin(Rr)], flips))
