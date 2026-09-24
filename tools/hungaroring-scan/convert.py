#!/usr/bin/env python3
"""Перевод контура geojson в метры тем же методом, что у шести старых трасс (CLAUDE.md §7).

    lat0, lon0 = среднее арифметическое точек контура (замыкающая точка-дубль отброшена)
    x = (lon - lon0) * 111320 * cos(lat0)
    y = (lat - lat0) * 110540
    округление до 0.1 м

СКРИПТ САМ СЕБЯ ПРОВЕРЯЕТ и падает, если метод разошёлся: он пересчитывает шесть
трасс, УЖЕ вшитых в index.html, и требует совпадения ДО ПОСЛЕДНЕЙ ЦИФРЫ.
Без этой сверки новая трасса встанет по «похожему» методу, а не по тому же.

Использование:
    python3 convert.py --check                 только сверка шести старых трасс
    python3 convert.py hu-1986.geojson         сверка + печать pts/len новой трассы
"""
import json, math, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.environ.get('APEX_INDEX', os.path.join(HERE, '..', '..', 'index.html'))

# какой geojson какой трассе соответствует
SOURCES = {'Monza': 'it-1922', 'Silverstone': 'gb-1948', 'Suzuka': 'jp-1962',
           'Monaco': 'mc-1929', 'Montreal': 'ca-1978', 'Miami': 'us-2022',
           'Hungaroring': 'hu-1986-center'}


def coords(path):
    d = json.load(open(path))
    c = d['features'][0]['geometry']['coordinates']
    # замыкающая точка-дубль отбрасывается
    if c[0] == c[-1]:
        c = c[:-1]
    return c


def to_metres(c):
    lat0 = sum(p[1] for p in c) / len(c)
    lon0 = sum(p[0] for p in c) / len(c)
    k = math.cos(math.radians(lat0))
    return [[round((p[0] - lon0) * 111320 * k, 1), round((p[1] - lat0) * 110540, 1)] for p in c]


def length(pts):
    """Длина замкнутого контура в метрах, округлённая как в TRACKDATA (вниз до целого)."""
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += math.hypot(b[0] - a[0], b[1] - a[1])
    return s


def trackdata():
    src = open(INDEX, encoding='utf-8').read()
    m = re.search(r'const TRACKDATA=(\{.*?\});\n', src, re.S)
    return json.loads(m.group(1))


def check(dirpath):
    td = trackdata()
    ok = True
    for name, gid in SOURCES.items():
        path = os.path.join(dirpath, gid + '.geojson')
        if not os.path.exists(path):
            print('  %-12s пропущена — нет %s' % (name, gid + '.geojson'))
            continue
        mine = to_metres(coords(path))
        theirs = td[name]['pts']
        if len(mine) != len(theirs):
            print('  %-12s ТОЧЕК %d против %d' % (name, len(mine), len(theirs)))
            ok = False
            continue
        bad = [i for i in range(len(mine)) if mine[i] != theirs[i]]
        print('  %-12s %4d точек, расхождений %d%s' % (name, len(mine), len(bad),
              '' if not bad else '  ПЕРВОЕ: i=%d %s против %s' % (bad[0], mine[bad[0]], theirs[bad[0]])))
        if bad:
            ok = False
    return ok


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    print('Сверка метода на трассах, уже вшитых в игру:')
    ok = check(args and os.path.dirname(os.path.abspath(args[0])) or HERE)
    if not ok:
        print('\nМЕТОД РАЗОШЁЛСЯ — дальше идти нельзя.')
        sys.exit(1)
    print('Метод совпал до последней цифры.\n')
    for path in args:
        pts = to_metres(coords(path))
        L = length(pts)
        print('%s: %d точек, контур %.1f м' % (os.path.basename(path), len(pts), L))
        print('  медиана отрезка %.1f м' % sorted(
            math.hypot(pts[(i+1) % len(pts)][0]-pts[i][0], pts[(i+1) % len(pts)][1]-pts[i][1])
            for i in range(len(pts)))[len(pts)//2])
        print(json.dumps({'pts': pts, 'len': int(L)}, separators=(',', ':')))
