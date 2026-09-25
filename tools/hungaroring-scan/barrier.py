#!/usr/bin/env python3
"""БАРЬЕР И ЗОНЫ ВЫЛЕТА ХУНГАРОРИНГА: замер (barrier.tsv, zones.tsv) -> разметка.

    node dump-cl.js                 # осевая из игры -> centerline.json
    python3 barrier.py              # -> barrier.js: куски rail{L,R} и runoff[]
                                    #    для SCENERY_HUNGARORING (вставляются руками)
    python3 barrier.py --check      # только сводка: где барьер, сколько зон

Отступ барьера задан точками «S, сторона, off» и между ними идёт линейно; точки
ломаной ставятся через STEP м по ОСЕВОЙ ИГРЫ, так что строитель (wallFromRail)
находит каждую у своей станции и отступ читает ровно тот, что замерен.

ЗАЩИТА ОТ ЧУЖОГО ВИТКА. wallFromRail относит точку к БЛИЖАЙШЕЙ станции всего
круга. Барьер вылета в 40-60 м от осевой может оказаться ближе к другому участку
трассы, чем к своему, и тогда он «переедет» туда. Поэтому каждая точка проверяется
так же, как её прочтёт игра, и при чужой ближайшей станции отступ сокращается,
пока точка не станет своей; такие места печатаются (в жизни барьер не может стоять
дальше середины между двумя участками полотна).
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=47.582732616, lon0=19.250829443, mlon=75088.112675)   # SCEN_ORIGIN.Hungaroring
STEP = 2            # точка ломаной через каждые STEP станций (станция ~4 м)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
P = np.array(cl['P']); R = np.array(cl['R']); S = np.array(cl['S']); L = cl['len']; HALF = cl['half']
M = len(S)


def read(fn):
    rows = []
    for ln in open(os.path.join(HERE, fn), encoding='utf-8'):
        if not ln.strip() or ln.startswith('#'):
            continue
        rows.append(ln.rstrip('\n').split('\t'))
    return rows


def profile(side):
    pts = sorted((float(r[0]), float(r[2])) for r in read('barrier.tsv') if r[1] == side)
    s = np.array([p[0] for p in pts]); o = np.array([p[1] for p in pts])
    s = np.concatenate([s - L, s, s + L]); o = np.concatenate([o, o, o])   # круг замкнут
    return np.interp(S, s, o)


def latlon(x, z):
    return round(O['lat0'] + z / 110540, 6), round(O['lon0'] - x / O['mlon'], 6)


def nearest(q):
    d = ((P - q) ** 2).sum(1)
    return int(d.argmin())


def cyc(a, b):
    d = abs(S[a] - S[b]) % L
    return min(d, L - d)


def rail(side):
    sg = -1 if side == 'L' else 1
    W = profile(side)
    out, cut = [], []
    for i in range(0, M, STEP):
        off = W[i]
        while True:
            q = P[i] + R[i] * sg * off
            j = nearest(q)
            if cyc(i, j) <= 60 or off <= HALF + 1:
                break
            off -= 0.5
        if off < W[i] - 0.01:
            cut.append((round(S[i]), round(W[i], 1), round(off, 1)))
        W[i] = off
        out.append(latlon(*q))
    return out, W, cut


def zones():
    res = []
    for r in read('zones.tsv'):
        a, b, side, typ, wid = float(r[0]), float(r[1]), r[2], r[3], r[4]
        wid = 60 if wid == 'wall' else float(wid)       # «до барьера»: строитель обрежет по нему
        def ll(s):
            i = int(np.argmin([cyc_s(S[k], s) for k in range(M)]))
            return latlon(*(P[i] + R[i] * (-1 if side == 'L' else 1) * HALF))
        res.append(dict(fromS=int(a), toS=int(b), side=side, type=typ, width=wid,
                        fromLatLon=ll(a), toLatLon=ll(b), note=r[5] if len(r) > 5 else ''))
    return res


def cyc_s(a, b):
    d = abs(a - b) % L
    return min(d, L - d)


def fmt(pts, per=8):
    lines = []
    for k in range(0, len(pts), per):
        lines.append('      ' + ','.join('[%.6f,%.6f]' % p for p in pts[k:k + per]) + ',')
    return '\n'.join(lines)


def main():
    rl, Wl, cl_ = rail('L')
    rr, Wr, cr = rail('R')
    for side, W, cut in (('L', Wl, cl_), ('R', Wr, cr)):
        print('%s: отступ %.1f..%.1f м, медиана %.1f; за кромкой медиана %.1f м' %
              (side, W.min(), W.max(), np.median(W), np.median(W) - HALF))
        if cut:
            print('   сокращено из-за чужого витка:', cut[:12], '...' if len(cut) > 12 else '')
    zs = zones()
    print('зон: %d (асфальт %d, гравий %d)' % (len(zs), sum(z['type'] == 'asphalt' for z in zs),
                                               sum(z['type'] == 'gravel' for z in zs)))
    if '--check' in sys.argv:
        return
    js = ['  rail: { height:1.0,', '    L: [', fmt(rl), '    ],', '    R: [', fmt(rr), '    ],', '  },',
          '  runoff: [']
    for z in zs:
        js.append("    {fromS:%d,toS:%d,side:'%s',type:'%s',width:%g, fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},   // %s"
                  % (z['fromS'], z['toS'], z['side'], z['type'], z['width'], *z['fromLatLon'], *z['toLatLon'], z['note']))
    js.append('  ],')
    open(os.path.join(HERE, 'barrier.js'), 'w').write('\n'.join(js) + '\n')
    print('barrier.js: %d + %d точек ломаной' % (len(rl), len(rr)))


if __name__ == '__main__':
    main()
