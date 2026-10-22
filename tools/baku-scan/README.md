# Баку — исходные данные (снято 22.10.2026)

Проверка «есть ли данные» перед работой над трассой — `docs/notes/tracks/baku.md`.

| Файл | Откуда |
|---|---|
| `osm_relation_11266687.osm` | `https://api.openstreetmap.org/api/0.6/relation/11266687/full` — отношение «Baku City Circuit» с пит-лейном |
| `gpg_baku.json` | `https://grandprixguides.com/api/circuit/azerbaijan` — 19 трибун полигонами |
| `multiviewer_2026.json` | `https://api.multiviewer.app/api/v1/circuits/144/2026` — 20 поворотов, сектора маршалов, круг-образец |
| `../baku_lap.json` | `python3 openf1-lap.py Baku --year=2026` (из `tools/`) — поул 2026, №63, 1:42.526; для 2025 openf1 кругов не отдаёт |
| `onboard/` | кадры онбоарда от владельца (`kadr_%04d.jpg`, `fps=4`) + `README.txt` |

Контур `bacinger/f1-circuits/circuits/az-2016.geojson` — 86 точек, в репозиторий не сохранён (берётся по ссылке).
Дома OSM (40 тайлов 0.004° в рамке 49.829–49.857, 40.361–40.378) не сохранены: снимаются заново тем же способом, что у Монако.
