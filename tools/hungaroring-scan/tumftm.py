#!/usr/bin/env python3
"""ТРЕТИЙ источник середины дороги: база TUMFTM/racetrack-database.

Зачем она здесь. Вопрос «идёт ли контур `bacinger` по середине полотна» (§10 п.27 а)
закрывали снимок и OSM; телеметрия openf1 его закрыть НЕ смогла — она не несёт
положения поперёк дороги (§7). А у TUMFTM осевая идёт с ДВУМЯ ширинами, слева
и справа по отдельности, то есть она по построению лежит на середине полотна.
Значит её отступ от нашего контура — прямой замер того самого сдвига.

    python3 tumftm.py Budapest            # Хунгароринг (там он так и называется)
    python3 tumftm.py Monza --geo=it-1922.geojson
    python3 tumftm.py --check             # сверка на трассах, где ответ известен

ЧТО ПОМНИТЬ О ДАННЫХ:
  * это НЕ официальные обмеры, а сводная база для расчёта траекторий; Монако
    и Майами в ней нет вовсе, Хунгароринг лежит под именем `Budapest`;
  * система координат своя (метры, свой поворот и начало) — совмещается
    поворотом и сдвигом, как круг телеметрии в `fit-openf1.py`;
  * ширина у них РАБОЧАЯ (между белыми линиями), и она заметно уже того,
    что даёт наш замер по снимку: см. вывод `--check`.
"""
import math, os, sys, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from convert import coords, to_metres   # noqa: E402

RAW = 'https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks/%s.csv'
CACHE = os.path.join(HERE, 'tum_%s.csv')
# наши трассы, которые в базе есть, и их файл контура
PAIRS = [('Budapest', 'hu-1986'), ('Monza', 'it-1922'), ('Silverstone', 'gb-1948'),
         ('Suzuka', 'jp-1962'), ('Montreal', 'ca-1978')]


def load(name):
    f = CACHE % name
    if not os.path.exists(f):
        with urllib.request.urlopen(RAW % name, timeout=120) as r:
            open(f, 'wb').write(r.read())
    rows = [l for l in open(f) if l.strip() and not l.startswith('#')]
    return np.array([[float(x) for x in l.split(',')] for l in rows])


def geom(P):
    A = P
    B = np.vstack([P[1:], P[:1]])
    V = B - A
    L = np.hypot(V[:, 0], V[:, 1])
    return A, V, L, np.maximum(L ** 2, 1e-9), np.concatenate([[0], np.cumsum(L)])


def project(Q, A, V, L, L2, CUM):
    """Q -> (S вдоль контура, отступ со знаком «влево по ходу», невязка)."""
    S = np.empty(len(Q)); O = np.empty(len(Q)); D = np.empty(len(Q))
    for k in range(0, len(Q), 1500):
        q = Q[k:k + 1500]
        t = np.clip(((q[:, None, :] - A[None]) * V[None]).sum(2) / L2[None], 0, 1)
        W = q[:, None, :] - (A[None] + V[None] * t[..., None])
        d = np.hypot(W[..., 0], W[..., 1])
        i = d.argmin(1); r = np.arange(len(q))
        S[k:k + 1500] = CUM[i] + t[r, i] * L[i]
        D[k:k + 1500] = d[r, i]
        n = V[i] / L[i][:, None]
        O[k:k + 1500] = n[:, 0] * W[r, i, 1] - n[:, 1] * W[r, i, 0]
    return S, O, D


def fit(T, ref):
    """Поворот и сдвиг TUMFTM на наш контур. Отражение проверяется отдельно."""
    A, V, L, L2, CUM = geom(ref)
    Tc = T - T.mean(0)
    sub = Tc[::max(1, len(Tc) // 900)]
    best = None
    for mir in (1, -1):
        M = sub * np.array([mir, 1.0])

        def err(deg, off):
            th = math.radians(deg); c, s = math.cos(th), math.sin(th)
            W = M @ np.array([[c, -s], [s, c]]).T + off + ref.mean(0)
            return float(project(W, A, V, L, L2, CUM)[2].mean())

        bd = min(((err(g, np.zeros(2)), g) for g in np.arange(0, 360, 1.0)))[1]
        bo = np.zeros(2); be = err(bd, bo)
        for it in range(6):
            ds, dl = 1.0 / 2 ** it, 16.0 / 2 ** it
            moved = True
            while moved:
                moved = False
                for dd in (-ds, 0, ds):
                    for dx in (-dl, 0, dl):
                        for dy in (-dl, 0, dl):
                            if dd == dx == dy == 0:
                                continue
                            e = err(bd + dd, bo + np.array([dx, dy]))
                            if e < be - 1e-4:
                                be, bd, bo = e, bd + dd, bo + np.array([dx, dy]); moved = True
        if best is None or be < best[0]:
            best = (be, bd, bo, mir)
    be, bd, bo, mir = best
    th = math.radians(bd); c, s = math.cos(th), math.sin(th)
    W = (T - T.mean(0)) * np.array([mir, 1.0]) @ np.array([[c, -s], [s, c]]).T + bo + ref.mean(0)
    return W, be, bd, mir


def run(name, geo, quiet=False):
    d = load(name)
    ref = np.array(to_metres(coords(os.path.join(HERE, geo + '.geojson'))))
    A, V, L, L2, CUM = geom(ref)
    W, be, bd, mir = fit(d[:, :2], ref)
    S, O, D = project(W, A, V, L, L2, CUM)
    wr, wl = d[:, 2], d[:, 3]
    lap_t = np.hypot(*np.diff(np.vstack([d[:, :2], d[:1, :2]]), axis=0).T).sum()
    lap_o = CUM[-1]
    print('%-12s TUMFTM %d точек, круг %.1f м; наш контур %.1f м' % (name, len(d), lap_t, lap_o))
    print('  совмещение: угол %.2f°%s, средняя невязка %.2f м'
          % (bd, ', ОТРАЖЕНИЕ' if mir < 0 else '', be))
    print('  ширина у них: медиана %.1f м, 10%%=%.1f 90%%=%.1f, %.1f..%.1f'
          % (np.median(wr + wl), np.percentile(wr + wl, 10), np.percentile(wr + wl, 90),
             (wr + wl).min(), (wr + wl).max()))
    print('  их осевая против нашей: медиана %+.2f м, 10/90 %% %+.2f/%+.2f, худший |%.1f|'
          % (np.median(O), np.percentile(O, 10), np.percentile(O, 90), np.abs(O).max()))
    return S, O, d


def main():
    if '--check' in sys.argv:
        for n, g in PAIRS:
            run(n, g)
            print()
        return
    name = sys.argv[1] if len(sys.argv) > 1 else 'Budapest'
    geo = next((a.split('=')[1].replace('.geojson', '') for a in sys.argv
                if a.startswith('--geo=')), dict(PAIRS).get(name, 'hu-1986'))
    S, O, d = run(name, geo)
    print()
    print('  S, м   их отступ   ширина (лево/право)')
    idx = np.argsort(S)
    for k in idx[::40]:
        print('  %5.0f   %+6.2f      %4.1f / %4.1f' % (S[k], O[k], d[k, 3], d[k, 2]))


main()
