#!/usr/bin/env python3
"""Трибуны Монако — строки SCENERY_MONACO.objects (v1.16.35).

    node dump-wall.js && python3 stands.py      # печатает строки для index.html

Места — разметка grandprixguides (gpg_monaco.json, 16 секций контурами, снято 03.10.2026), спроецированная
на осевую игры по своей ноге трассы (gpg_stands.py); сверено с онбоардом поула 2025 (кадры ниже) и снимком
Google 2026 (plans/hpool*.png из harbour_map.py). Высоты — ОЦЕНКА по онбоарду: сверху высоту не взять.
Не берутся: General Admission Z1 (стоячая зона на склоне под Бо-Риваж), Gold/Platinum VIP Terraces
(террасы жилых домов за пит-прямой), Paddock Club (гостевой блок), C (Портье: контур поперёк улиц, на онбоарде
трибуны не видно).
Глубина режется так, чтобы задний край не дошёл до ЧУЖОЙ ноги трассы ближе её стены + 8 м — место пит-лейна (K стоит между
бассейновой улицей и пит-прямой, O — на понтоне).
"""
import json, math, os
from gpg_stands import stands, W, P, S, WL, WR, M, LAT0, LON0, MLON

RR = W['R']; L = W['len']
# имя: (высота м, глубина м или None — по контуру, кадры онбоарда, что видно)
H = {
    'Grandstand K': (14, None, 'кадры 206–214: справа за стеной MONACO — высокая трибуна во всю улицу; северный край на 8 м позже — иначе встык с A1'),
    'Grandstand M': (8, 14, 'у входа в бассейн справа, небольшая'),
    'Grandstand N': (10, 9, 'кадр 222: слева на понтоне за водой, ряды до неба'),
    'Grandstand O': (14, 30, 'на поперечном понтоне, «крутые ряды» — поперёк трассы'),
    'Grandstand P': (10, 9, 'кадры 224–226: слева на понтоне'),
    'Grandstand L': (10, 25, 'кадр 232: справа на выходе из бассейна, жёлтые ряды'),
    'Grandstand T': (12, 25, 'кадры 236–240: слева перед Раскасс, полная'),
    'Grandstand V': (5, 9, 'самая маленькая, у последней шиканы'),
    'Grandstand X1': (6, 12, 'низкая, на выходе из Антони Ноэс'),
    'Grandstand X2': (6, 9, 'низкая, ближе к линии старта'),
    'Grandstand A1': (7, 8, 'внутри Сент-Девот'),
    'Grandstand B': (8, 18, 'кадры 66–70: площадь Казино, слева в саду'),
}


def ll(x, z):
    return (LAT0 + z / 110540, LON0 - x / MLON)


def at_s(s):
    """точка осевой на дуге s: (x, z, k)"""
    s %= L
    for k in range(M):
        k2 = (k + 1) % M; seg = (S[k2] - S[k]) % L
        if (s - S[k]) % L <= seg:
            t = ((s - S[k]) % L) / (seg or 1)
            return P[k][0] + (P[k2][0] - P[k][0]) * t, P[k][1] + (P[k2][1] - P[k][1]) * t, k
    return P[0][0], P[0][1], 0


def room(s0, s1, sg, near):
    """самый дальний отступ, на котором трибуна ещё не подходит к чужой ноге ближе стены + 8 м"""
    far = 200.0
    s = s0
    while True:
        x, z, k = at_s(s)
        for o in range(int(near), 200):
            px, pz = x + RR[k][0] * sg * o, z + RR[k][1] * sg * o
            bad = False
            for j in range(M):
                if abs((S[j] - s + L / 2) % L - L / 2) < 150: continue
                d = math.hypot(px - P[j][0], pz - P[j][1])
                if d < max(WL[j], WR[j]) + 8: bad = True; break
            if bad: far = min(far, o - 1); break
        if (s1 - s) % L < 4: break
        s += 4
    return far


if __name__ == '__main__':
    print("    /* Трибуны (v1.16.35) — строки считает tools/monaco-scan/stands.py: места — grandprixguides, сверены с онбоардом 2025;")
    print("       высоты — оценка по онбоарду. Строитель отодвигает трибуну за отбойник (+2 м); на рельефе ряды начинаются")
    print("       с высоты полотна, низ — до видимой земли. */")
    rows = [r for r in stands() if r['name'] in H]
    TRIM = {'Grandstand K': (8, 0)}                    # K у Табака сходилась с A1 (прямая трибуна внутри Сент-Девот) на 1 м
    for r in rows:
        ta, tb = TRIM.get(r['name'], (0, 0))
        r['a'], r['b'] = math.floor(r['s0']) + ta, math.ceil(r['s1']) - tb
    for r in rows:                                   # соседние секции одной стороны встык (X1–X2, K–M): проход 5 м между ними
        for q in rows:
            if q is not r and q['side'] == r['side'] and -1 <= (q['a'] - r['b']) % L < 5:
                mid = (r['b'] + q['a']) / 2; r['b'] = math.floor(mid - 2.5); q['a'] = math.ceil(mid + 2.5)
    for r in rows:
        h, d, why = H[r['name']]
        s0, s1 = r['a'], r['b']
        sg = 1 if r['side'] == 'R' else -1
        near = max(r['n'], 9.0)                      # строитель всё равно отодвинет за стену + 2 м (стена ~7 м)
        dd = d if d else r['f'] - near
        lim = room(s0, s1, sg, near)
        if near + dd > lim: dd = lim - near
        a, b = ll(*at_s(s0)[:2]), ll(*at_s(s1)[:2])
        nm = r['name'].replace('Grandstand ', '')
        print("    {kind:'grandstand', shape:'arc', name:'%s', fromS:%d, toS:%d, side:'%s', off:%.0f, h:%d, d:%.0f, fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},   // %s; контур %.0f..%.0f м%s" % (
            nm, s0, s1, r['side'], near, h, dd, a[0], a[1], b[0], b[1], why, r['n'], r['f'], ('; глубина урезана до %.0f (чужая нога)' % lim) if lim < near + (d if d else r['f'] - near) else ''))
