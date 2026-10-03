#!/usr/bin/env python3
"""Трибуны Монако из grandprixguides (gpg_monaco.json — https://grandprixguides.com/api/circuit/monaco, снято 03.10.2026)
на осевую игры: S от линии старта, сторона, ближний/дальний отступ, вид из их описания.
    node dump-wall.js && python3 gpg_stands.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
LAT0, LON0, MLON = 43.737145229, 7.425286371, 80430.825145   # SCEN_ORIGIN.Monaco
W = json.load(open(os.path.join(HERE, 'wall.json')))
P, RR, S, WL, WR, M = W['P'], W['R'], W['S'], W['WL'], W['WR'], W['M']


def xz(lat, lon):
    return (-(lon - LON0) * MLON, (lat - LAT0) * 110540)


def near(x, z):
    """ближайшая точка осевой по отрезкам: (S, отступ со знаком: + справа по ходу, k)"""
    best = None
    for k in range(M):
        k2 = (k + 1) % M
        ax, az = P[k]; bx, bz = P[k2]
        tx, tz = bx - ax, bz - az; L2 = tx * tx + tz * tz or 1
        t = max(0, min(1, ((x - ax) * tx + (z - az) * tz) / L2))
        px, pz = ax + tx * t, az + tz * t
        d = math.hypot(x - px, z - pz)
        if best is None or d < best[0]:
            seg = (S[k2] - S[k]) % W['len']
            off = (x - px) * RR[k][0] + (z - pz) * RR[k][1]
            best = (d, (S[k] + seg * t) % W['len'], off, k)
    return best[1], best[2], best[3]


def near_leg(x, z, s0, win=250):
    """как near, но только по точкам осевой в окне S0±win (своя нога трассы)"""
    best = None; L = W['len']
    for k in range(M):
        if abs((S[k] - s0 + L / 2) % L - L / 2) > win: continue
        k2 = (k + 1) % M
        ax, az = P[k]; bx, bz = P[k2]
        tx, tz = bx - ax, bz - az; L2 = tx * tx + tz * tz or 1
        t = max(0, min(1, ((x - ax) * tx + (z - az) * tz) / L2))
        px, pz = ax + tx * t, az + tz * t
        d = math.hypot(x - px, z - pz)
        if best is None or d < best[0]:
            off = (x - px) * RR[k][0] + (z - pz) * RR[k][1]
            best = (d, (S[k] + ((S[k2] - S[k]) % L) * t) % L, off, k)
    return best[1], best[2], best[3]


def stands():
    G = json.load(open(os.path.join(HERE, 'gpg_monaco.json')))
    out = []
    for g in G['grandstands']:
        pts = [xz(c['lat'], c['lng']) for c in g['coordinates']]
        if pts[0] == pts[-1]: pts = pts[:-1]
        # нога — по ближайшему к осевой углу
        s0 = min((near(*p) for p in pts), key=lambda r: abs(r[1]))[0]
        pr = [near_leg(*p, s0) for p in pts]
        L = W['len']
        rel = [((p[0] - s0 + L / 2) % L - L / 2) for p in pr]
        a = [abs(p[1]) for p in pr]
        side = 'R' if sum(p[1] for p in pr) > 0 else 'L'
        out.append(dict(name=g['name'], s0=(s0 + min(rel)) % L, s1=(s0 + max(rel)) % L, side=side, n=min(a), f=max(a),
                        view=g.get('view', ''), pts=pts))
    return out


if __name__ == '__main__':
    for r in stands():
        print('%-27s S %4.0f..%4.0f  %s  отступ %5.1f..%5.1f  | %s' % (r['name'], r['s0'], r['s1'], r['side'], r['n'], r['f'], r['view'][:120]))
