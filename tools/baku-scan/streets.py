"""Виды с улицы вдоль круга Баку (24.10.2026): какие есть и где.

  python3 streets.py            -> streets.tsv (S, источник, расстояние до осевой, дата, ссылка на картинку)

Яндекс: api-maps.yandex.ru/services/panoramas/1.x (без ключа) — ближайшая панорама к точке; плитки 256 px —
  pano.maps.yandex.net/<imageId>/<zoom>.<x>.<y> (zoom 1 = 3584x1792). В Баку у трассы — только 7 панорам «360derece.az»
  у входов в магазины и внутри галерей; проезда машиной Яндекса нет.
KartaView: api.kartaview.org/2.0/photo/?lat=&lng=&radius= (радиус 1–500 м, без ключа) — фото с машины, fileurlProc — 4000x3000.
  В Баку — один проезд 12.06.2019 по ходу гонки, S 2830–4025.
Mapillary: graph.mapillary.com требует ключ (Client Token из mapillary.com/dashboard/developers) — без него не проверить.
"""
import json, math, os, subprocess, time
HERE = os.path.dirname(os.path.abspath(__file__))
c = json.load(open(os.path.join(HERE, 'az-center.geojson')))['features'][0]['geometry']['coordinates']
S = [0.0]
for i in range(1, len(c)):
    S.append(S[-1] + math.hypot((c[i][0]-c[i-1][0])*84900, (c[i][1]-c[i-1][1])*110540))

def get(u):
    return subprocess.run(['curl', '-sS', '-m', '20', '-A', 'Mozilla/5.0', u], capture_output=True, text=True).stdout

def dist(lon, lat, i):
    return math.hypot((lon-c[i][0])*84900, (lat-c[i][1])*110540)

rows, seen = [], set()
for i in range(0, len(c), 3):
    lon, lat = c[i]
    if i % 4 == 0:
        r = get(f'https://api-maps.yandex.ru/services/panoramas/1.x/?l=stv&lang=ru_RU&origin=userAction&provider=streetview&ll={lon:.5f},{lat:.5f}')
        if '"success"' in r:
            d = json.loads(r)['data']; D = d['Data']; p = D['Point']['coordinates']
            if D['panoramaId'] not in seen:
                seen.add(D['panoramaId'])
                rows.append((round(S[i]), 'yandex:' + ((d.get('Author') or {}).get('name') or 'yandex'), round(dist(p[0], p[1], i)),
                             time.strftime('%Y-%m-%d', time.gmtime(D['timestamp'])), 'https://pano.maps.yandex.net/%s/1.{x}.{y}' % D['Images']['imageId']))
    r = get(f'https://api.kartaview.org/2.0/photo/?lat={lat:.5f}&lng={lon:.5f}&radius=40&itemsPerPage=100')
    try:
        data = json.loads(r)['result']['data']
    except Exception:
        continue
    for x in data:
        if x['id'] in seen:
            continue
        seen.add(x['id'])
        rows.append((round(S[i]), 'kartaview h%.0f' % float(x['heading'] or 0), round(dist(float(x['lng']), float(x['lat']), i)),
                     x['shotDate'][:10], x['fileurlProc']))
rows.sort()
with open(os.path.join(HERE, 'streets.tsv'), 'w') as f:
    f.write('S\tисточник\tот осевой, м\tдата\tкартинка\n')
    for r in rows:
        f.write('\t'.join(map(str, r)) + '\n')
print(len(rows), 'видов')
