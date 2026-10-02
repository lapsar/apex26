#!/usr/bin/env python3
"""Совмещение координат F1/openf1 (дециметры, своя система) с контуром mc-1929.
Подобие: поворот + сдвиг + масштаб (и проверка зеркала), ICP от перебора углов.
Пишет openf1/fit.json; сам по себе ничего не утверждает про поперёк (см. hungaroring-scan/openf1-road.py).

    python3 f1fit.py openf1/lap_nor.json
"""
import json, math, sys, numpy as np, mc
pts = json.load(open(sys.argv[1]))
F = np.array([[r['x'], r['y']] for r in pts], float) * 0.1
F = F[np.r_[True, np.hypot(*np.diff(F, axis=0).T) > 0.3]]
R = np.array(mc.R)
A, B = R, np.vstack([R[1:], R[:1]]); V = B - A; L2 = (V ** 2).sum(1)


def nearest(P):
    out = np.empty_like(P)
    for k, p in enumerate(P):
        t = np.clip(((p - A) * V).sum(1) / L2, 0, 1); Q = A + V * t[:, None]
        out[k] = Q[np.argmin(((Q - p) ** 2).sum(1))]
    return out


def fit(P, Q):                          # подобие P->Q (Умеяма)
    mp, mq = P.mean(0), Q.mean(0); X, Y = P - mp, Q - mq
    U, S, Vt = np.linalg.svd(Y.T @ X / len(P)); D = np.eye(2)
    if np.linalg.det(U @ Vt) < 0: D[1, 1] = -1
    Rm = U @ D @ Vt; s = (S * np.diag(D)).sum() / (X ** 2).sum(1).mean()
    return Rm, s, mq - s * Rm @ mp


best = None
sub = F[::4]
for mir in (1, -1):
    G = sub * [1, mir]
    for ang in range(0, 360, 10):
        a = math.radians(ang); Rm = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]]); s = 1.0
        t = R.mean(0) - (Rm @ G.mean(0)) * s
        for it in range(15):
            P = (s * (Rm @ G.T)).T + t; Q = nearest(P)
            Rm, s, t = fit(G, Q)
        err = np.median(np.hypot(*(nearest((s * (Rm @ G.T)).T + t) - ((s * (Rm @ G.T)).T + t)).T))
        if best is None or err < best[0]: best = (err, mir, Rm, s, t, ang)
err, mir, Rm, s, t, ang = best
G = F * [1, mir]
for it in range(10):
    P = (s * (Rm @ G.T)).T + t; Rm, s, t = fit(G, nearest(P))
P = (s * (Rm @ G.T)).T + t; d = np.hypot(*(nearest(P) - P).T)
print('зеркало %d, масштаб %.4f (1 = дециметры), поворот %.2f°, ошибка медиана %.2f м, 90%% %.2f м'
      % (mir, s, math.degrees(math.atan2(Rm[1, 0], Rm[0, 0])), np.median(d), np.percentile(d, 90)))
json.dump({'mirror': mir, 'R': Rm.tolist(), 's': s, 't': t.tolist()}, open('openf1/fit.json', 'w'))
