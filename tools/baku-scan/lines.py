#!/usr/bin/env python3
"""Ширина по онбоарду: белые линии разметки на кадре и их отступ вбок от камеры.
Перспектива: линия, параллельная дороге, на кадре идёт с наклоном dx/dy = X/h (X — отступ вбок, h — высота камеры),
горизонт знать не нужно. Коэффициент K = 3.9 м на единицу наклона калиброван двумя местами: замок (пунктир под камерой,
края 0.94 и 1.02 → 7.6 м — официальная ширина) и старт (края 1.97 и 1.76 → 14.5 м; сверху 14.1 м).
Линии ищутся HoughLinesP по маске «белое» (яркое, не цветное) в полосе строк ROW0..ROW1 перед болидом.

    python3 lines.py K [K …]      # печать линий кадра: отступ (м, + вправо), длина
    python3 lines.py --all        # все кадры 13..423 -> lines.tsv
"""
import sys, cv2, numpy as np
K = 3.9; ROW0, ROW1 = 225, 500; X0 = 261


def lines(k):
    im = cv2.imread('onboard/kadr_%04d.jpg' % k)[:, X0:X0 + 2346]
    b = cv2.GaussianBlur(im, (3, 3), 0); hsv = cv2.cvtColor(b, cv2.COLOR_BGR2HSV)
    m = ((hsv[:, :, 2] > 150) & (hsv[:, :, 1] < 60)).astype(np.uint8) * 255
    m[:ROW0] = 0; m[ROW1:] = 0
    m[380:, 1190:1270] = 0                                  # антенна на носу болида — вертикальная белая полоска
    seg = cv2.HoughLinesP(m, 1, np.pi / 360, 40, minLineLength=60, maxLineGap=25)
    out = []
    if seg is None: return out
    for x1, y1, x2, y2 in seg.reshape(-1, 4).astype(float):
        if abs(y2 - y1) < 25: continue                     # почти горизонтальные (стоп-линии, тени) — не продольные
        s = (x2 - x1) / (y2 - y1); out.append((K * s, abs(y2 - y1), (x1 + x2) / 2, (y1 + y2) / 2))
    # слить близкие по отступу (одна линия — несколько отрезков)
    out.sort(); merged = []
    for X, L, xm, ym in out:
        if merged and abs(X - merged[-1][0]) < 0.35: a = merged[-1]; w = a[1] + L; merged[-1] = ((a[0] * a[1] + X * L) / w, w, a[2], a[3])
        else: merged.append((X, L, xm, ym))
    return [m_ for m_ in merged if m_[1] >= 50 and abs(m_[0]) < 25]


if __name__ == '__main__':
    if '--all' in sys.argv:
        S = {}
        for l in open('onboard/kadry.tsv'):
            if l.startswith('#'): continue
            f = l.split('\t'); S[int(f[0])] = f[2]
        rows = []
        for k in range(13, 424):
            for X, L, xm, ym in lines(k): rows.append('%d\t%s\t%.2f\t%d\n' % (k, S[k], X, L))
        open('lines.tsv', 'w').write('kadr\tS\tX_m\tlen_px\n' + ''.join(rows)); print('lines.tsv', len(rows))
    else:
        for k in map(int, sys.argv[1:]):
            print(k, ['%+.1f(%d)' % (X, L) for X, L, xm, ym in lines(k)])
