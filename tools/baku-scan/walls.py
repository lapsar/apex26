#!/usr/bin/env python3
"""SCENERY_BAKU — этап 1 (стены и выезды): выезды-ловушки прямо по ходу из торможения (wallOut, как у Монако) и асфальт
под ними (runoff, tint). Земля города Монако (groundTex:'city') здесь не подошла — сверху пёстрая мозаика; земля — до этапа окружения. Места и стороны — вершины 8 тормозных поворотов (K игры, онбоард:
торможение ≥60 км/ч); глубина — по онбоарду глазом (улица прямо по ходу открыта до стены с рекламой; снимков дня гонки нет,
на Wayback 2021 барьеров ещё нет). T7 (S 2417) — до v1.17.15 без выезда: снаружи поворота главная прямая (S ~4560), стена общая;
опыт с by 10 — стена ушла к чужой ноге (`ghost`, `wallvis` красные); v1.17.15 — карман по стене главной прямой (pockets.py). latLon — по az-center.geojson (S игры = дуга от линии старта).
Вставляет блок в index.html (повторный запуск заменяет) и строку Baku в SCENERY_BY_KEY.
    python3 walls.py [index.html]"""
import os, re, sys
os.environ['BK_GEOJSON'] = 'az-center.geojson'
import bk
HTML = sys.argv[1] if len(sys.argv) > 1 else '../../index.html'
import pockets
ll = lambda S: [round(v, 6) for v in bk.latlon(*bk.at(S)[0])]
rows_w, rows_r = [], []
for p in pockets.POCKETS:
    n, side, by, a, b, why = p['corner'], p['side'], p['by'], p['fromS'], p['toS'], p['why']
    A, B = ll(a), ll(b); ramp = min(24, round((b - a) * 0.3))
    if p.get('path'):                                  # v1.17.9: карман по форме улицы — ломаная стены (точки x, z игры → широта, долгота)
        pts = ','.join('[%.6f,%.6f]' % pockets.ll(*q) for q in p['path'])
        rows_w.append("    {corner:'%s', side:'%s', fromS:%d, toS:%d, fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f], path:[%s]},   // %s"
                      % (n, side, a, b, A[0], A[1], B[0], B[1], pts, why))
    else:
        rows_w.append("    {corner:'%s', side:'%s', by:%g, ramp:%d, fromS:%d, toS:%d, fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},   // %s"
                      % (n, side, by, ramp, a, b, A[0], A[1], B[0], B[1], why))
    rows_r.append("    {corner:'%s', fromS:%d, toS:%d, side:'%s', type:'tint', width:60, color:'#80838a', fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},"
                  % (n, a, b, side, A[0], A[1], B[0], B[1]))
block = ("/* БАКУ, этап 1 (v1.17.1): выезды-ловушки и асфальт под ними. Строки считает tools/baku-scan/walls.py\n"
         "   (повторный запуск заменяет блок). Глубина выездов — по онбоарду поула 2026 глазом: снимков дня гонки нет.\n"
         "   v1.17.9: выезды по форме улиц — ключ path (точки — tools/baku-scan/pockets.py); обочина асфальтом — ключ vergeAsphalt.\n"
         "   v1.17.10: площадь T16 — карман изнутри (T16i) и барьер у кольца Азнефть. */\n"
         "const SCENERY_BAKU = {\n  vergeAsphalt: true,   // полоса от кромки до стены — асфальт улицы (v1.17.9)\n  wallOut: [\n" + "\n".join(rows_w) + "\n  ],\n  runoff: [   // покрытие выездов: асфальт до стены\n"
         + "\n".join(rows_r) + "\n  ],\n};\n")
s = open(HTML).read()
m0 = re.search(r"\nconst SCENERY_BAKU = \{.*?\n  runoff: \[.*?\n  \],(.*?)\n\};\n", s, flags=re.S)   # всё после runoff (город, деревья, земля) — сохранить
keep = m0 and m0.group(1).strip() and m0
if keep:
    block = block[:-len("\n};\n")] + keep.group(1) + "\n};\n"
s = re.sub(r"/\* БАКУ, этап 1 .*?\nconst SCENERY_BAKU = \{.*?\n\};\n", '', s, flags=re.S)
i = s.index('const SCENERY_BY_KEY='); s = s[:i] + block + s[i:]
s = s.replace(',Monaco:SCENERY_MONACO,Baku:SCENERY_BAKU};', ',Monaco:SCENERY_MONACO};')
s = s.replace(',Monaco:SCENERY_MONACO};', ',Monaco:SCENERY_MONACO,Baku:SCENERY_BAKU};', 1)
open(HTML, 'w').write(s); print(block[:block.index('  runoff:')])
