#!/usr/bin/env python3
"""Найти по развёртке крупные постройки вдоль трассы — кандидаты в трибуны.

Трибуна на снимке 0.1–0.2 м/пиксель = длинный прямоугольник светлой крыши
(или ребристого навеса) сразу за отбойником. Ищем так: пиксель считается
«постройкой», если он яркий и малонасыщенный (крыша, бетон, тент), а не
зелёный (деревья, трава) и не тёмный (вода, асфальт в тени). Дальше на каждой
станции ищем сплошные полосы таких пикселей вне полотна и склеиваем их вдоль
круга.

Печатает таблицу кандидатов: сторона, диапазон S, отступ от осевой, глубина.
Дальше каждый кандидат смотрится глазами (ribbon-view.py / corner.py) —
автомат не отличает трибуну от павильона.

  python3 find-stands.py [src] [zoom] [мин_длина_м] [мин_глубина_м]
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'goog'
    zoom = sys.argv[2] if len(sys.argv) > 2 else '20'
    min_len = float(sys.argv[3]) if len(sys.argv) > 3 else 30.0
    min_depth = float(sys.argv[4]) if len(sys.argv) > 4 else 6.0

    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = np.asarray(Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')).astype(float)
    S = np.array(meta['S']); half_w, step = meta['half_w'], meta['step']
    M, N = im.shape[0], im.shape[1]
    offs = np.array([-half_w + i * step for i in range(N)])

    mx = im.max(axis=2); mn = im.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    green = (im[:, :, 1] > im[:, :, 0] + 8) & (im[:, :, 1] > im[:, :, 2] + 8)
    build = (mx > 145) & (sat < 0.22) & (~green) & (np.abs(offs)[None, :] > 11)

    # полосы «постройки» на каждой станции, по каждой стороне
    segs = []                                   # (станция, сторона, off_от, off_до)
    for i in range(M):
        for side in (-1, 1):
            sel = np.where(offs * side > 11)[0]
            sel = sel[np.argsort(np.abs(offs[sel]))]
            run = None
            for j in sel:
                if build[i, j]:
                    if run is None:
                        run = [abs(offs[j]), abs(offs[j])]
                    else:
                        run[1] = abs(offs[j])
                else:
                    if run and run[1] - run[0] >= min_depth:
                        segs.append((i, side, run[0], run[1]))
                    run = None
            if run and run[1] - run[0] >= min_depth:
                segs.append((i, side, run[0], run[1]))

    # склейка вдоль круга: соседние станции с перекрывающимся отступом
    segs.sort()
    used = [False] * len(segs)
    by_station = {}
    for k, s in enumerate(segs):
        by_station.setdefault((s[0], s[1]), []).append(k)
    groups = []
    for k, s in enumerate(segs):
        if used[k]:
            continue
        used[k] = True
        members = [k]
        cur = s
        i = s[0]
        while True:
            nxt = None
            for k2 in by_station.get(((i + 1) % M, s[1]), []):
                if used[k2]:
                    continue
                a, b = segs[k2][2], segs[k2][3]
                if min(b, cur[3]) - max(a, cur[2]) > 3:        # перекрытие по отступу
                    nxt = k2
                    break
            if nxt is None:
                break
            used[nxt] = True
            members.append(nxt)
            cur = segs[nxt]
            i = (i + 1) % M
        if len(members) >= 2:
            groups.append(members)

    rows = []
    for g in groups:
        st = [segs[k][0] for k in g]
        s0, s1 = S[min(st)], S[max(st)]
        length = s1 - s0
        if length < min_len:
            continue
        near = np.median([segs[k][2] for k in g])
        far = np.median([segs[k][3] for k in g])
        rows.append((s0, s1, length, 'L' if segs[g[0]][1] < 0 else 'R', near, far, far - near))
    rows.sort()
    print(f"{src} z{zoom}: кандидатов {len(rows)} (длиннее {min_len:.0f} м, глубже {min_depth:.0f} м)")
    print(" сторона   S от     S до   длина   отступ_ближ  отступ_даль  глубина")
    for s0, s1, ln, side, near, far, dep in rows:
        print(f"    {side}    {s0:7.0f} {s1:7.0f} {ln:7.0f}     {near:6.1f}      {far:6.1f}   {dep:6.1f}")


if __name__ == '__main__':
    main()
