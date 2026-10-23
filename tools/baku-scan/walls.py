#!/usr/bin/env python3
"""SCENERY_BAKU — этап 1 (стены и выезды): выезды-ловушки прямо по ходу из торможения (wallOut, как у Монако) и асфальт
под ними (runoff, tint). Земля города Монако (groundTex:'city') здесь не подошла — сверху пёстрая мозаика; земля — до этапа окружения. Места и стороны — вершины 8 тормозных поворотов (K игры, онбоард:
торможение ≥60 км/ч); глубина — по онбоарду глазом (улица прямо по ходу открыта до стены с рекламой; снимков дня гонки нет,
на Wayback 2021 барьеров ещё нет). T7 (S 2417) — без выезда: снаружи поворота главная прямая (S ~4560), стена общая;
опыт с by 10 — стена ушла к чужой ноге (`ghost`, `wallvis` красные). latLon — по az-center.geojson (S игры = дуга от линии старта).
Вставляет блок в index.html (повторный запуск заменяет) и строку Baku в SCENERY_BY_KEY.
    python3 walls.py [index.html]"""
import os, re, sys
os.environ['BK_GEOJSON'] = 'az-center.geojson'
import bk
HTML = sys.argv[1] if len(sys.argv) > 1 else '../../index.html'
# поворот, вершина S, сторона выезда, на сколько дальше стена (м), начало и конец участка (S), кадры онбоарда
OUT = [
    ('T1', 'R', 14, 160, 262, 'кадры 29–34: прямо по ходу открытая площадь Азадлыг, стена Qatar Airways вдали'),
    ('T2', 'R', 10, 505, 590, 'кадры 55–59: улица прямо, стена Formula 1 / Pirelli в конце'),
    ('T3', 'R', 8, 1385, 1455, 'кадры 108–112: короткий выезд прямо, жёлтая стена Pirelli'),
    ('T4', 'L', 10, 1600, 1680, 'кадры 130–134: улица прямо, стена crypto.com вдали'),
    ('T15', 'R', 10, 3585, 3665, 'кадры 293–297: полоса прямо, стена Formula 1 справа в конце'),
    ('T16', 'R', 16, 3935, 4032, 'кадры 328–332: площадь прямо, трибуна American Express за стеной'),
]
ll = lambda S: [round(v, 6) for v in bk.latlon(*bk.at(S)[0])]
rows_w, rows_r = [], []
for n, side, by, a, b, why in OUT:
    A, B = ll(a), ll(b); ramp = min(24, round((b - a) * 0.3))
    rows_w.append("    {corner:'%s', side:'%s', by:%d, ramp:%d, fromS:%d, toS:%d, fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},   // %s"
                  % (n, side, by, ramp, a, b, A[0], A[1], B[0], B[1], why))
    rows_r.append("    {corner:'%s', fromS:%d, toS:%d, side:'%s', type:'tint', width:60, color:'#80838a', fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},"
                  % (n, a, b, side, A[0], A[1], B[0], B[1]))
block = ("/* БАКУ, этап 1 (v1.17.1): выезды-ловушки и асфальт под ними. Строки считает tools/baku-scan/walls.py\n"
         "   (повторный запуск заменяет блок). Глубина выездов — по онбоарду поула 2026 глазом: снимков дня гонки нет. */\n"
         "const SCENERY_BAKU = {\n  wallOut: [\n" + "\n".join(rows_w) + "\n  ],\n  runoff: [   // покрытие выездов: асфальт до стены\n"
         + "\n".join(rows_r) + "\n  ],\n};\n")
s = open(HTML).read()
keep = re.search(r"\n  /\* Старый город \(v1\.17\.3\).*?\n  \],", s, flags=re.S)   # блок city.py (v1.17.3) — сохранить
if keep:
    block = block[:-len("\n};\n")] + keep.group(0) + "\n};\n"
s = re.sub(r"/\* БАКУ, этап 1 .*?\nconst SCENERY_BAKU = \{.*?\n\};\n", '', s, flags=re.S)
i = s.index('const SCENERY_BY_KEY='); s = s[:i] + block + s[i:]
s = s.replace(',Monaco:SCENERY_MONACO,Baku:SCENERY_BAKU};', ',Monaco:SCENERY_MONACO};')
s = s.replace(',Monaco:SCENERY_MONACO};', ',Monaco:SCENERY_MONACO,Baku:SCENERY_BAKU};', 1)
open(HTML, 'w').write(s); print(block)
