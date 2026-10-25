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

## Этап 1 (v1.17.1)

| Файл | Что делает |
|---|---|
| `walls.py [index.html]` | блок `SCENERY_BAKU` (выезды `wallOut` и асфальт `runoff`) в игру, повторный запуск заменяет; строка `Baku` в `SCENERY_BY_KEY` |
| `plan.py … --out=plans/c_Tn.jpg` + лист кадров | листы поворотов «снимок + 6 кадров» (см. историю в tracks/baku.md) |

## Старый город и реклама (v1.17.3)

| Файл | Что делает |
|---|---|
| `dump-wall.js [файл.json]` | осевая и ПОСТРОЕННЫЙ барьер игры → `wall.json` (порт monaco-scan) |
| `city.py [index.html]` | крепостная стена (по границе района «İçəri Şəhər») и дома OSM участка S 1990–4620 → блок «Старый город» в `SCENERY_BAKU` (`boxesOff`, `buildings`); повторный запуск заменяет блок, `walls.py` его сохраняет |
| `osm-trees.py` | деревья OSM (`natural=tree`, теги узлов) → `osm/trees.json` (v1.17.5) |
| `trees.py [--map] [index.html]` | деревья: кроны летнего снимка ESRI z19 и стволы OSM, без дворов → блок `trees` в `SCENERY_BAKU` (v1.17.5; `--map` — `plans/trees_<S>.jpg`) |
| `streets.py` | виды с улицы вдоль круга: панорамы Яндекса и фото KartaView → `streets.tsv` (S, источник, отступ от осевой, дата, ссылка); 24.10.2026 |
| `povcmp.js` | `APEX_INDEX=…` — опытная сборка вместо `index.html`; `CHROME=…` — другой Chromium (в этой среде `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`) |

**v1.17.4:** `city.py` — дома OSM вдоль всего круга (`CITY`, блок «Город»), серых коробок нет нигде (`boxesOff` на весь круг);
стеклянные башни и Дом правительства — свои цвета (`OVER`).
**v1.17.6:** `city.py` — стиль дома по району (`style()`: Старый город, «нефтяной бум», общественные, высотки, стекло), детали фасада ключами
дома, крыша — цвет летнего снимка ESRI z19 (`roof_col`, тайлы — `tiles/`), угловые башенки (`dome_vertex`).
**v1.17.7:** `city.py` — узнаваемые здания вручную по фото (`LANDMARK`: высота, цвет, ключи; башня — `tower_edge`, купола на все углы — `dome_all`).

Реклама — ключ `railAds` в spec Баку (зоны — tracks/baku.md), полосы — общая таблица `RAIL_ADS`.
Порядок: `node dump-wall.js && python3 city.py`, затем `node tools/run-all.js --only=print,load,clear,materials,solid,wall`.

## Выезды и трибуны против города (24.10.2026, без правки игры)

| Файл | Что делает |
|---|---|
| `runoffs.py` | выезды v1.17.1: карман (кромка + 1 м … построенная стена), деревья в нём, что за стеной (дома игры, улицы и площади OSM), сколько кармана в ИСХОДНЫХ домах OSM |
| `runoff-plan.py ro [радиус]` / `имя:S,…` | план сверху: снимок ESRI, кромка, стена, карман, дома игры, улицы и площади OSM, трибуны gpg, кроны → `plans/plan_<имя>.jpg` |
| `stands-trees.py` | 19 трибун grandprixguides против деревьев и домов игры: S, сторона, отступ от стены, деревья в следе и между следом и стеной |

Все три — после `node dump-wall.js`. Лист — `docs/notes/img/baku-runoffs.jpg`, разбор — tracks/baku.md, «Выезды и трибуны против города».

## Земля города (v1.17.8)

| Файл | Что делает |
|---|---|
| `ground.py [--map] [index.html]` | вода (Каспий по береговой линии OSM, фонтаны, пруды), асфальт улиц и парковок OSM, газоны OSM минус коридор трассы → блок `groundTex`/`ground` в `SCENERY_BAKU` (повторный запуск заменяет); `--map` — слои поверх снимка ESRI, `plans/ground_<S>.jpg` |

Порядок: `node dump-wall.js && python3 ground.py`. После правки стен (выезды) — перезапустить: коридор берётся из построенного барьера.

## Выезды по форме улиц (v1.17.9)

| Файл | Что делает |
|---|---|
| `pockets.py` / `--check` | разметка карманов: стена подхода прямо, барьер поперёк улицы в by+1 м за кромкой выхода, другая сторона улицы — фасад OSM (отступ 1 м) или стена выхода; вогнутые углы — фаской 2 м; `--check` — не на полотне, не в домах OSM |
| `pocket-plan.py [T2,T4 \| все] [радиус]` | план сверху: снимок ESRI, сетка координат игры через 10 м, ход и S, стена, дома OSM (исходные), асфальт улиц, карман → `plans/pk_<имя>.jpg`; `px2xz()` — пиксель плана → x, z игры |
| `pocket-shot.js` | из игры: вид сверху строго вниз и кокпит на подъезде, `archive/v1.17.8.html` против `index.html` → `plans/ps_*.png` |

`walls.py` берёт карманы из `pockets.py` (строки `wallOut` с `path`) и ставит `vergeAsphalt` (обочина асфальтом). `dump-wall.js` пишет и ломаные стен
в разрывах (`GAPS`, у карманов `pocket:true`) — `city.py` и `ground.py` добавляют карман в коридор целиком.
Порядок: `node dump-wall.js && python3 pockets.py --check && python3 walls.py && node dump-wall.js && python3 city.py && node dump-wall.js && python3 ground.py`,
затем `node tools/run-all.js --only=ghost,wallvis,solid,wall,squeeze,failroom,retire,print,load,clear`.

## Площадь T16 (v1.17.10)

`pockets.py`: карман `T16i` — изнутри T16 (сторона L): стена по бордюру автобусного кармана и площади (точки по `pocket-plan.py`,
`px2xz`); `T16` — барьер у кольца Азнефть. Трибуны AzNeft и Filarmoniya — строки `objects` в `SCENERY_BAKU` руками (ключ `front`,
точки — по снимку и полигонам `gpg_baku.json`), после них — `node dump-wall.js && python3 city.py && python3 ground.py` (следы трибун и
новый коридор). Сверка с онбоардом — `povcmp.py 321 327 330 && povcmp.js 0 _n 64` (лист — `docs/notes/img/baku-t16.jpg`).

## Углы по онбоарду (v1.17.11)

| Файл | Что делает |
|---|---|
| `kerbs.py [index.html]` | поребрики (ключ `kerbs`) и краска у кромки (`stripes`, `verge:true` — и на обочину до стены) по кадрам онбоарда → блоки в `SCENERY_BAKU` (повторный запуск заменяет) |
| `overlay.py K[:dh[:dx[:vy]]] …` | план игры на кадре онбоарда: сетка x, z через 10 м, кромки, стена, ломаные карманов (камера 1.28 м, 64°; курс и сдвиг — руками) → `plans/ov_K.jpg` |
| `look.js top:S:высота[:dx:dz] cock:S[:вбок] pov:K …` | кадры игры: сверху строго вниз, кокпит по осевой, поза онбоарда (`povs.json`) — в сборках `archive/v$OLD.html` и `index.html` → `plans/lk_<сборка>_<вид>.png` |
| `sheet3.py выход.jpg K …` | лист «онбоард / было / стало» из `plans/game_K_o.png`, `game_K_n.png` (`povcmp.js` с `APEX_INDEX` прошлой сборки) |

`pockets.py`: T1 — барьер в 45 м за кромкой выхода, стена подхода в 2.6 м с S 95; серпы изнутри T6 (`T6i`) и T12 (`T12i`) — строки без `path`
в конце `POCKETS` (в `design()` их нет). `walls.py` пишет `by` дробным.
Порядок: `python3 pockets.py --check && python3 walls.py && node dump-wall.js && python3 city.py && node dump-wall.js && python3 ground.py && python3 kerbs.py`.

## Боксы (v1.17.12)

`tiles.py`: источник `wbNNNNN` — выпуск ESRI Wayback (15423 — снимок 16.05.2021, боксы стоят). `pocket-plan.py`: `PLAN_SRC=wb15423`, пит-лейн OSM пурпуром.
`city.py`: навесы `carport` «Baku City Circuit» — боксы (`PIT_BLD`, строка с `garage:{fromS,toS}`), моторхоумы (`TEAM_UNITS`).
`ground.py`: асфальт пит-лейна (`pitlane()`: путь OSM роли `pit_lane` и полоса за левой стеной S `PIT_S`).

## Трибуны по кругу (v1.17.13)

| Файл | Что делает |
|---|---|
| `stands.py [--check] [index.html]` | 13 трибун по полигонам grandprixguides передним краем к трассе (ключ `front`), отодвинутые от построенной стены не ближе 3 м → строки в `objects` `SCENERY_BAKU` (повторный запуск заменяет); `--check` — только сводка |

Порядок: `node dump-wall.js && python3 stands.py && node dump-wall.js && python3 city.py && node dump-wall.js && python3 ground.py`.

## Повороты без изломов и подъём шире (v1.17.14)

| Файл | Что делает |
|---|---|
| `recenter.py` | шаг 4 — сглаживание: осевая по Гауссу `--gsig=8` м только поперёк (`KEEP` — участки со слабым сдвигом: апекс T12), полуширина `--wsig=8` м и подъём не круче `--wslope=0.06` м/м (только вниз); `--out=префикс` — опыт в другой файл |
| `mkgame.py --geom` | в игру только полотно (`pts`, `len`, `widths`) по ПРЕЖНЕМУ началу координат; `railAds`, `sectors`, `garage` — по месту |
| `s-v1.17.13.tsv` | старая S (v1.17.13) → новая через 10 м: круг стал короче на 21 м; S-константы `pockets.py`, `kerbs.py`, `city.py`, `ground.py` уже переведены |
| `../edge-kinks.js` | справка: изломы и дрожание кромки (осевая ± полуширина), все трассы или `Baku --list` |

Порядок после правки кромок или сглаживания: `python3 edges.py && python3 recenter.py && python3 mkgame.py --geom && node dump-wall.js &&
(cd .. && node sector-lines.js)` (секторы Баку — в spec и `sectors.json`), затем `python3 pockets.py --check && python3 walls.py && python3 kerbs.py &&
node dump-wall.js && python3 stands.py && node dump-wall.js && python3 city.py && python3 ground.py && node dump-wall.js`, затем
`node tools/run-all.js --only=pole,print,ghost,wall,solid,wallvis,failroom,clear,load` (якорь и отпечаток Баку — переписать по правилу §4).
Если круг снова изменит длину — S-константы инструментов перевести заново (по образцу `s-v1.17.13.tsv`).
