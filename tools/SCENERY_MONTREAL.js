const SCENERY_MONTREAL = {
  // ЩИТЫ ТОРМОЖЕНИЯ 150/100/50 м. Чистая геометрия: отсчёт от входа в зону
  // торможения по замеру поворотов, вынос 8.5 м вбок — за кромкой (7 м)
  // и перед рельсом (10 м), иначе щит не виден из-за отбойника.
  markers: { panelW:1.6, panelH:0.9, baseY:0, postW:0, markers: [
    {corner:'Senna S', dist:150, atS:86, side:'R', off:8.5, latLon:[45.499310,-73.522693]},
    {corner:'Senna S', dist:100, atS:136, side:'R', off:8.5, latLon:[45.498870,-73.522729]},
    {corner:'Senna S', dist:50, atS:186, side:'R', off:8.5, latLon:[45.498421,-73.522803]},
    {corner:'L Epingle', dist:150, atS:2514, side:'L', off:8.5, latLon:[45.512757,-73.527422]},
    {corner:'L Epingle', dist:100, atS:2564, side:'L', off:8.5, latLon:[45.513194,-73.527542]},
    {corner:'L Epingle', dist:50, atS:2614, side:'L', off:8.5, latLon:[45.513637,-73.527670]},
    {corner:'Final chicane', dist:150, atS:3731, side:'L', off:8.5, latLon:[45.505423,-73.523751]},
    {corner:'Final chicane', dist:100, atS:3781, side:'L', off:8.5, latLon:[45.504980,-73.523619]},
    {corner:'Final chicane', dist:50, atS:3831, side:'L', off:8.5, latLon:[45.504538,-73.523487]},
  ]},

  // ПИТ-БИЛДИНГ. Контур здания «Paddocks» из OSM (way 42229671, building=hangar):
  // габарит и посадка обмерены по нему, оценена только высота.
  objects: [
    {kind:'pit', shape:'straight', name:'Paddocks Montreal', atS:4264, side:'L', off:38.7, w:328, h:12, d:27, latLon:[45.500883,-73.522453]},
  ],
};
