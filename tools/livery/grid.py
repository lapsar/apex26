#!/usr/bin/env python3
"""Обрезка фото с сеткой пикселей и подписями — снимать координаты фигур ливреи (пиксели исходного фото).
   python3 -I tools/livery/grid.py <фото> x0,y0,x1,y1 <шаг> <выход.png> [увеличение]"""
import sys
from PIL import Image,ImageDraw
f,box,step,out=sys.argv[1],[int(v) for v in sys.argv[2].split(',')],int(sys.argv[3]),sys.argv[4]
sc=float(sys.argv[5]) if len(sys.argv)>5 else 1
im=Image.open(f).convert('RGB').crop(box);im=im.resize((int(im.size[0]*sc),int(im.size[1]*sc)));d=ImageDraw.Draw(im)
for x in range((box[0]//step+1)*step,box[2],step):
  X=(x-box[0])*sc;d.line([(X,0),(X,im.size[1])],fill=(255,0,0) if x%100==0 else (255,255,0),width=1);d.text((X+2,2),str(x),fill=(255,60,60))
for y in range((box[1]//step+1)*step,box[3],step):
  Y=(y-box[1])*sc;d.line([(0,Y),(im.size[0],Y)],fill=(255,0,0) if y%100==0 else (255,255,0),width=1);d.text((2,Y+2),str(y),fill=(255,60,60))
im.save(out)
