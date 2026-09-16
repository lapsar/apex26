#!/usr/bin/env python3
"""НАСТОЯЩИЙ круг из телеметрии F1 против нашей физики (09.2026).

Источник — openf1.org, открытый API с данными F1 начиная с 2023 года. Даёт то,
чего в проекте не было никогда: реальную траекторию, реальную скорость и ВЫСОТУ.

    python3 openf1-lap.py Miami            # быстрый круг квалификации
    python3 openf1-lap.py Monza --year=2024

Что печатает:
  * перепад высот круга — прямой ответ на вопрос о рельефе (CLAUDE.md §10 п.24);
  * отход настоящей линии от нашей осевой — это гоночная линия, измеренная,
    а не построенная оптимизатором (§10 п.23);
  * сравнение реальной скорости с нашим пределом `playerCornerV` — где модель
    запрещает то, что в жизни делают.

ЧТО НАДО ПОМНИТЬ О ДАННЫХ:
  * частота 3.7 Гц, то есть точка каждые 16-25 м на гоночной скорости. Для формы
    линии грубо; уплотняется усреднением по многим кругам и пилотам.
  * координаты в системе F1 (дециметры, свой поворот) — совмещаются с нашим
    контуром подбором угла и сдвига, как в miami-scan/f1fit.py.
  * НАШ предел — это предел ТОЧКИ, а реальная скорость сглажена тормозами
    и разгоном. Сравнивать поточечно можно только там, где машина действительно
    на пределе; поэтому в выводе отдельно считается, где наш предел НИЖЕ
    реальной скорости — это заведомая ошибка модели, а не разница мерок.
"""
import json, math, os, subprocess, sys, urllib.parse, urllib.request

API = 'https://api.openf1.org/v1/'


def get(path, **q):
    url = API + path + '?' + urllib.parse.urlencode(q, safe='<>=')
    req = urllib.request.Request(url, headers={'User-Agent': 'apex26-dev'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def best_lap(circuit, year, kind='Qualifying'):
    ses = [s for s in get('sessions', circuit_short_name=circuit)
           if s['session_type'] == kind and (not year or s['year'] == year)]
    if not ses:
        raise SystemExit('нет сессий %s для %s' % (kind, circuit))
    s = ses[-1]
    laps = [l for l in get('laps', session_key=s['session_key']) if l.get('lap_duration')]
    laps.sort(key=lambda l: l['lap_duration'])
    return s, laps[0]


def main():
    circuit = sys.argv[1] if len(sys.argv) > 1 else 'Miami'
    year = next((int(a.split('=')[1]) for a in sys.argv if a.startswith('--year=')), None)
    s, lap = best_lap(circuit, year)
    print('%s %d, %s: круг %s пилота %s — %.3f с'
          % (circuit, s['year'], s['session_name'], lap['lap_number'],
             lap['driver_number'], lap['lap_duration']))
    t0 = lap['date_start'][:19]
    import datetime
    t1 = (datetime.datetime.fromisoformat(t0) + datetime.timedelta(seconds=lap['lap_duration'] + 2)).isoformat()
    loc = get('location', session_key=s['session_key'], driver_number=lap['driver_number'],
              **{'date>': t0, 'date<': t1})
    car = get('car_data', session_key=s['session_key'], driver_number=lap['driver_number'],
              **{'date>': t0, 'date<': t1})
    loc = [p for p in loc if p['x'] or p['y']]
    z = [p['z'] / 10.0 for p in loc]
    spd = [p['speed'] for p in car]
    brk = [p['brake'] for p in car]
    print('  точек положения %d (каждые ~%.0f м), телеметрии %d'
          % (len(loc), lap['lap_duration'] * 250 / 3.6 / max(1, len(loc)), len(car)))
    print('  ВЫСОТА: %.1f..%.1f м, перепад %.2f м' % (min(z), max(z), max(z) - min(z)))
    print('  скорость: %d..%d км/ч, тормоз нажат %.0f %% времени'
          % (min(spd), max(spd), 100 * sum(1 for b in brk if b) / len(brk)))
    out = '%s_lap.json' % circuit.lower()
    json.dump(dict(session=s, lap=lap, location=loc, car=car), open(out, 'w'))
    print('  сохранено: %s' % out)


if __name__ == '__main__':
    main()
