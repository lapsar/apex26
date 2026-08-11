#!/usr/bin/env python3
"""Что лежит за кромкой: классификация покрытия по развёртке круга.

Этап 3 часть 2 — зоны вылета. Мерить надо не «где стена» (это уже сделано,
trace2.py/final_rail.py), а ЧТО за кромкой лежит: трава, асфальт или гравий.
Работа идёт по той же ленте unrolled_<src>_<zoom>.png.

Ключевое решение — ОТКУДА отсчитывать полосу. Своя кромка тут не годится:
ДП-трассировщик из trace.py уводит линию на паддок и на набережную (проверено:
на прямой Casino он давал 18-21 м от осевой вместо 7). Поэтому опорой служит
уже принятый отбойник (wall.json, снят по блокам на снимке):

  • стена ДАЛЕКО (зазор > 3 м) — там настоящий вылет, он существует в жизни,
    и его видно; меряем полосу МЕЖДУ кромкой и стеной;
  • стена НА МИНИМУМЕ (2 м) — этой полосы в жизни нет, в жизни стена стоит
    у самой кромки; меряем землю СРАЗУ ЗА стеной и красим полосу под неё.

Оговорки (проверено на этом снимке):
  • красно-белый поребрик — часть трассы, а не «не покрытие»;
  • вода тёмная и малонасыщенная; без отдельной проверки читается как асфальт.
    Где за стеной вода (прямая Casino вдоль гребного канала) — по решению
    владельца кладётся асфальт: это «умолчание», а не замер;
  • осевая расходится с реальной дорогой до 4.2 м — отсюда полосы берутся
    широкими, решение принимается по большинству пикселей, а не по одному.
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def classify(r, g, b):
    """Один пиксель -> 'grass' | 'asphalt' | 'gravel' | 'water'."""
    v = 0.299 * r + 0.587 * g + 0.114 * b
    mx, mn = max(r, g, b), min(r, g, b)
    s = 0.0 if mx == 0 else (mx - mn) / mx
    if v < 45:
        return 'water'
    if g > r + 8 and g > b + 6:
        return 'grass'
    if r > g + 14 and g > b + 6 and v > 105 and s > 0.16:
        return 'gravel'
    return 'asphalt'


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'esri'
    zoom = int(sys.argv[2]) if len(sys.argv) > 2 else 19
    meta = json.load(open(os.path.join(HERE, f'unrolled_{src}_{zoom}.json')))
    im = Image.open(os.path.join(HERE, f'unrolled_{src}_{zoom}.png')).convert('RGB')
    wall = json.load(open(os.path.join(HERE, 'wall.json')))
    step, half_w, S = meta['step'], meta['half_w'], meta['S']
    W, H = im.size
    px = im.load()
    col = lambda off: int(round((off + half_w) / step))

    out = {'S': S, 'step': step}
    for side, sgn in (('L', -1), ('R', 1)):
        woff = wall['WL'] if side == 'L' else wall['WR']
        rec = []
        for i in range(H):
            hw, w = wall['HW'][i], woff[i]
            gap = w - hw
            if gap > 3.0:                       # настоящий вылет: меряем ВНУТРИ стены
                a, b = hw + 1.5, w - 0.5
                where = 'inside'
            else:                               # полосы в жизни нет: меряем ЗА стеной
                a, b = w + 1.0, w + 6.0
                where = 'outside'
            cnt = {'grass': 0, 'asphalt': 0, 'gravel': 0, 'water': 0}
            for c in range(col(a), col(b) + 1):
                k = col(0) + sgn * (c - col(0))
                if 0 <= k < W:
                    cnt[classify(*px[k, i])] += 1
            n = max(1, sum(cnt.values()))
            # докуда за кромкой тянется сплошное покрытие — настоящая ширина вылета
            solid = 0.0
            for d in range(int(1.0 / step), int(20.0 / step)):
                k = col(0) + sgn * d
                if not (0 <= k < W):
                    break
                if classify(*px[k, i]) != 'asphalt':
                    break
                solid = d * step
            rec.append(dict(gap=round(gap, 2), where=where, solid=round(solid, 2),
                            grass=round(cnt['grass'] / n, 3), asphalt=round(cnt['asphalt'] / n, 3),
                            gravel=round(cnt['gravel'] / n, 3), water=round(cnt['water'] / n, 3)))
        out[side] = rec

    json.dump(out, open(os.path.join(HERE, 'surface.json'), 'w'))
    for side in 'LR':
        rec = out[side]
        lab = ['grass' if r['grass'] > 0.5 else ('gravel' if r['gravel'] > 0.4 else 'asphalt') for r in rec]
        sh = {k: 100.0 * lab.count(k) / len(lab) for k in ('grass', 'asphalt', 'gravel')}
        wat = 100.0 * sum(1 for r in rec if r['water'] > 0.5) / len(rec)
        ins = 100.0 * sum(1 for r in rec if r['where'] == 'inside') / len(rec)
        print(f"{side}: трава {sh['grass']:.0f} %, асфальт {sh['asphalt']:.0f} %, гравий {sh['gravel']:.0f} % "
              f"(из них вода-умолчание {wat:.0f} %) · стена далеко на {ins:.0f} % круга")


if __name__ == '__main__':
    main()
