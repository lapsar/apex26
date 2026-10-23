#!/usr/bin/env python3
"""Наши кромки (edges.tsv), нарисованные на кадре онбоарда. Точка схода — пересечение длинных линий разметки кадра (Hough),
линия на отступе X от камеры идёт из неё с наклоном dx/dy = X/K (K = 3.9, как lines.py). Отступ камеры от контура — нитка
телеметрии (thread.tsv). Пурпур — наши кромки, жёлтый пунктир — наша СТЕНА (кромка + 1 м, как ставит игра) для сравнения.
    python3 edgecheck.py K [K …]  -> plans/edge_K.jpg"""
import sys, cv2, numpy as np
K = 1.28; X0 = 261   # 23.10.2026: по промежутку между полосами главной прямой (3.5 м); прежние 3.9 завышали втрое
S = {int(l.split('\t')[0]): float(l.split('\t')[2]) for l in open('onboard/kadry.tsv') if not l.startswith('#')}
TH = np.array([[float(x) for x in l.split('\t')] for l in open('thread.tsv').read().splitlines()[1:] if 'nan' not in l])
E = np.array([[float(x) for x in l.split('\t')[:3]] for l in open('edges.tsv').read().splitlines()[1:]])
def vp(im):
    b = cv2.GaussianBlur(im, (3, 3), 0); hsv = cv2.cvtColor(b, cv2.COLOR_BGR2HSV)
    m = ((hsv[:, :, 2] > 150) & (hsv[:, :, 1] < 60)).astype(np.uint8) * 255; m[:225] = 0; m[500:] = 0; m[380:, 1190:1270] = 0
    seg = cv2.HoughLinesP(m, 1, np.pi / 360, 40, minLineLength=80, maxLineGap=25)
    L = [s for s in (seg.reshape(-1, 4).astype(float) if seg is not None else []) if abs(s[3] - s[1]) > 30]
    pts = []
    for i in range(len(L)):
        for j in range(i + 1, len(L)):
            x1, y1, x2, y2 = L[i]; x3, y3, x4, y4 = L[j]
            d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(d) < 1e-6: continue
            px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d; py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d
            if 0 < px < 2346 and 100 < py < 320: pts.append((px, py))
    return np.median(np.array(pts), axis=0) if len(pts) >= 3 else (1173.0, 215.0)
for k in map(int, sys.argv[1:]):
    im = cv2.imread('onboard/kadr_%04d.jpg' % k)[:, X0:X0 + 2346]; s = S[k]
    o = np.interp(s, TH[:, 0], TH[:, 1], period=5958); l = np.interp(s, E[:, 0], E[:, 1], period=5958); r = np.interp(s, E[:, 0], E[:, 2], period=5958)
    vx, vy = vp(im)
    for X, col, th in (((o - l), (255, 0, 255), 4), ((o - r), (255, 0, 255), 4), ((o - l - 1), (0, 255, 255), 2), ((o - r + 1), (0, 255, 255), 2)):
        for y in range(int(vy) + 20, 700, 14):
            x = vx + X / K * (y - vy); x2 = vx + X / K * (y + 7 - vy); cv2.line(im, (int(x), y), (int(x2), y + 7), col, th)
    cv2.putText(im, 'k%d S%d: nashi kromki %.1f / %.1f m ot kamery' % (k, s, o - l, o - r), (20, 1250), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 255, 255), 3)
    cv2.imwrite('plans/edge_%d.jpg' % k, cv2.resize(im, (1173, 660)))
    print(k, int(s), 'камера %+.1f от контура; наши кромки от камеры: слева %.1f, справа %.1f; точка схода %.0f,%.0f' % (o, o - l, o - r, vx, vy))
