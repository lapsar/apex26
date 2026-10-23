# Баку — исходные данные (снято 22.10.2026)

Проверка «есть ли данные» перед работой над трассой — `docs/notes/tracks/baku.md`.

| Файл | Откуда |
|---|---|
| `osm_relation_11266687.osm` | `https://api.openstreetmap.org/api/0.6/relation/11266687/full` — отношение «Baku City Circuit» с пит-лейном |
| `gpg_baku.json` | `https://grandprixguides.com/api/circuit/azerbaijan` — 19 трибун полигонами |
| `multiviewer_2026.json` | `https://api.multiviewer.app/api/v1/circuits/144/2026` — 20 поворотов, сектора маршалов, круг-образец |
| `../baku_lap.json` | `python3 openf1-lap.py Baku --year=2026` (из `tools/`) — поул 2026, №63, 1:42.526; для 2025 openf1 кругов не отдаёт |
| `onboard/` | кадры онбоарда от владельца (`kadr_%04d.jpg`, `fps=4`) + `README.txt` |

Контур `bacinger/f1-circuits/circuits/az-2016.geojson` — 86 точек, копия — `az-2016.geojson`.
Дома OSM — 40 тайлов 0.004° в рамке 49.829–49.857, 40.361–40.378 (склейка `osm/all.json.gz`, сырые тайлы не хранятся).

## Этап 0 (22.10.2026)

| Файл | Что делает |
|---|---|
| `osm.py` | склейка тайлов `osm/t_*.osm` (API 0.6 `/map`, 40 тайлов 0.004°) → `osm/all.json(.gz)`; `python3 osm.py` — сводка |
| `mkloop.py` | контур из путей отношения 11266687 по ходу гонки, начало — узел «Start Line» → `az-osm.geojson` |
| `bk.py` | контур в метрах (перевод игры), `at`, `proj`, `xy/latlon`; файл — `BK_GEOJSON` (по умолчанию `az-osm.geojson`) |
| `f1fit.py lap.json [fit.json]` | совмещение openf1 с контуром + ход и ошибка по участкам (порт monaco-scan) |
| `thread.py` | нитка телеметрии (8 кругов квалы 2026, `openf1/quali_top8.json`) против оси OSM → `thread.tsv` |
| `band.py` | поиск полотна по снимку (порт `halfwidth.py`) → `band.tsv`; на улицах Баку шумит — не замер |
| `view.py S [радиус] [--src=google\|esri\|wbNNNNN] [--bld=1] [--extra=xy.tsv:RRGGBB]` | снимок сверху с контуром, OSM, узлами старта/финиша; `--bld` — дома, стены, тротуары OSM |
| `unroll.py S0 S1` | развёрнутая лента: снимок вдоль контура, поперёк — метры от осевой (у тугих поворотов искажает) |
| `tiles.py` | кэш тайлов (Google, ESRI, Wayback `wbNNNNN`), запись атомарная |

`openf1/`: `lap_rus_2026.json` (поул), `quali_top8.json`, `grid_raw.json` (решётка 2026, 11:03:40–11:03:51 UTC — все стоят), `fit.json`.

## Онбоард (23.10.2026)

| Файл | Что делает |
|---|---|
| `kadry.py` | кадр → t (таймер: t = 0.25·N − 3.2) → положение openf1 с поправкой −0.425 с → S → `onboard/kadry.tsv` |
| `sheet.py K0 K1 шаг` | листы онбоарда 3×3 с подписью «кадр / S / км/ч» → `plans/` (поля записи iPhone обрезаются) |

`openf1/lap_rus_2026_wide.json` — тот же круг с запасом 5 с до и после (кадры до нуля таймера и после финиша).

## Ширина (23.10.2026)

| Файл | Что делает |
|---|---|
| `corridor.py [S0 S1]` | от контура влево/вправо до стены дома или крепостной стены и до линии тротуара OSM → `corridor.tsv` |
| `edges.py` | черновик кромок из `corridor.tsv` + ручные поправки `edges_fix.tsv` (S0, S1, L, R или «x:y» — плавно, чем подтверждено) → `edges.tsv` |
| `xsec.py S [S …] [--half=]` | поперечные срезы снимка с линейкой через 1 м (трасса слева направо) → `plans/` |
| `plan.py S0 S1` | снимок вдоль участка: контур, линии отступа через 2 м, кромки из `edges.tsv` (пурпур) и середина (зелёный), нитки телеметрии, кадры |
| `combo.py S0 S1` | `plan.py` + 6 кадров онбоарда участка в одном листе |
| `lines.py K…` / `--all` | белые линии на кадре онбоарда и их отступ вбок по наклону (K = 1.28 — по промежутку между полосами; до 23.10.2026 стояло ошибочное 3.9); на прямых шумит |
| `widthplot.py` | график ширины по кругу → `views/width.png` |
| `recenter.py [--step=8] [--sig=12]` | контур на середину кромок → `az-center.geojson` + полуширина по новой дуге `az-center-width.tsv` |
| `checkthread.py` | доля точек телеметрии у кромки и за ней для `az-center` |

`tv/` — кадры трансляции 2026 от владельца (вид сверху на старт-финиш и боксы; 2-й сектор на 1-м круге).

## Игра (v1.17.0)

| Файл | Что делает |
|---|---|
| `mkgame.py [index.html] [--visible]` | Баку в игру: `TRACKDATA` из `az-center.geojson`, spec с `widths` (через 10 м) и `sectors` (`sectors.json`), `SCEN_ORIGIN`, `STAGE`; повторный запуск заменяет строки Баку |
| `castle-trials.js [S0 S1 EX]` | замок в физике игры: автопилот по осевой на скоростях 45–100 км/ч, 15 попыток на скорость; EX — опыт «шире на EX м» |
| `lapmap.py` | карта круга сверху с кромками → `views/lapmap.jpg` |

Порядок после правки кромок: `python3 edges.py && python3 recenter.py && python3 checkthread.py && python3 mkgame.py --visible`,
затем `node tools/run-all.js --only=pole,print,ghost,wall,solid,stage` (эталоны Баку в пробниках — с v1.17.0).

## Проверка ширины по онбоарду (23.10.2026)

| Файл | Что делает |
|---|---|
| `edgecheck.py K…` | наши кромки и стена игры, нарисованные на кадре онбоарда (K = 1.28) → `plans/edge_K.jpg` |
| `povcmp.py K…` + `povcmp.js [DY] [метка] [угол°]` | кадр из кокпита игры в позе болида онбоарда (опыты: высота камеры, горизонтальный угол) → `plans/game_K*.png` |

`views/fovcmp.jpg` — онбоард / игра сейчас / игра с углом 64° в трёх местах круга.
