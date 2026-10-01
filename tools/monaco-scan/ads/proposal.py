#!/usr/bin/env python3
"""Картинка «реклама в жизни → предложение» для Монако (по образцу hungaroring-scan/ads).
Кадры — onboard/kadr_NNNN.jpg, S — из onboard/kadry.tsv. Запуск из tools/monaco-scan: python3 ads/proposal.py"""
from PIL import Image, ImageDraw, ImageFont
F = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', s)
Fr = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', s)
NEW = {'N1': ('#15151e', '#f2d21b', 'MONACO'), 'N2': ('#c8102e', '#ffffff', 'CASINO DE MONTE-CARLO'),
       'N3': ('#1d2150', '#ffffff', 'GRAND PRIX DE MONACO')}
OLD = {'2': ('#17418f', '#ffffff', "APEX '26"), '3': ('#f2c400', '#d40511', 'PIRELLI'), '4': ('#0a7d4b', '#ffffff', 'ARAMCO'),
       '8': ('#a8142a', '#ffffff', "APEX '26"), 'A': ('#c9ccd0', '#9aa0a6', '')}
Z = [('0–200', 'пит-прямая', 'армко слева, стена боксов справа', 283, 'A'),
     ('200–270', 'Сент-Девот', 'чёрные F1 «Monaco»', 23, 'N1'),
     ('270–500', 'подъём Бо-Риваж', 'Louis Vuitton, тёмно-синие', 37, 'N3'),
     ('500–790', 'Массне', 'American Express, ярко-синие', 55, '2'),
     ('790–900', 'площадь Казино', 'CASINO, красные', 61, 'N2'),
     ('900–1150', 'к Мирабо', 'Aramco, синий + зелёный', 75, '4'),
     ('1150–1430', 'Мирабо, шпилька, Портье', 'чёрные F1 «Monaco», Heineken у моста', 109, 'N1'),
     ('1430–1545', 'к тоннелю', 'Salesforce, фиолетово-синие', 139, 'N3'),
     ('1545–1925', 'тоннель', 'рекламы нет, бетон', 157, 'A'),
     ('1925–2400', 'шикана, Табак', 'Lenovo красные, Qatar бордовые', 185, '8'),
     ('2400–2730', 'бассейн', 'Explora Journeys, тёмно-синие', 225, 'N3'),
     ('2730–2840', 'выход бассейна', 'UBS, белые', 237, 'A'),
     ('2840–2990', 'Раскасс', 'Pirelli, жёлтые', 253, '3'),
     ('2990–3200', 'Антони Ноэс', 'TAG Heuer, чёрные', 269, 'N1')]
W, RH = 1800, 150
im = Image.new('RGB', (W, 90 + RH * len(Z)), '#0b0e13'); d = ImageDraw.Draw(im)
d.text((20, 15), 'Монако: реклама на стенах — в жизни (онбоард 2025) → предложение (вариант Б: 3 новые полосы)', fill='#edeff2', font=F(26))
d.text((20, 55), 'S — метры от линии старта игры (v1.16.23). Зона у нас одна на обе стороны. «армко» — голый отбойник, без рекламы.', fill='#8a94a3', font=Fr(18))
for i, (S, place, life, fr, key) in enumerate(Z):
    y = 90 + i * RH
    im.paste(Image.open('onboard/kadr_%04d.jpg' % fr).resize((240, 135)), (20, y + 7))
    d.text((280, y + 15), 'S ' + S, fill='#f2d21b', font=F(22)); d.text((280, y + 48), place, fill='#edeff2', font=F(22))
    d.text((280, y + 82), 'в жизни: ' + life, fill='#8a94a3', font=Fr(19))
    bg, fg, tx = NEW.get(key) or OLD.get(key); x0 = 960
    d.rectangle([x0, y + 35, x0 + 520, y + 105], fill=bg)
    if key == 'A':
        d.rectangle([x0, y + 66, x0 + 520, y + 74], fill=fg); lab = 'армко, без рекламы'
    else:
        f = F(30); w = d.textlength(tx, font=f)
        while w > 500: f = F(f.size - 2); w = d.textlength(tx, font=f)
        d.text((x0 + 260 - w / 2, y + 52), tx, fill=fg, font=f)
        lab = 'НОВАЯ полоса' if key in NEW else 'готовая, №' + key
    d.text((x0 + 540, y + 58), lab, fill='#7fe0a0' if key in NEW else '#edeff2', font=Fr(20))
im.save('ads/proposal.jpg', quality=85)
