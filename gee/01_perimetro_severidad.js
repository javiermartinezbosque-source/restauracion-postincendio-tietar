// ============================================================
// FASE 1 — PERÍMETRO Y SEVERIDAD DEL INCENDIO
// Incendio de Burgohondo – Valle del Tiétar (Ávila), julio–agosto 2026
// Sensor: Sentinel-2 SR Harmonized + Cloud Score+
// ============================================================
//
// Lógica:
//   1. Compuestos pre-incendio (antes del 22/07/2026) y post-incendio
//      (después de la estabilización, 06/08/2026).
//   2. NBR = (NIR − SWIR2) / (NIR + SWIR2), con B8 y B12.
//   3. dNBR = NBR_pre − NBR_post (×1000), corregido por el "offset":
//      la mediana del dNBR en un anillo no quemado alrededor del incendio
//      (descuenta diferencias de fenología e iluminación entre fechas).
//   4. Perímetro: píxeles con dNBR ≥ 100, cierre morfológico para unir
//      fragmentos, vectorización y selección del polígono mayor.
//   5. Severidad (umbrales de dNBR de Key & Benson, 2006):
//        0 no quemado (< 100) · 1 baja (100–269) · 2 moderada-baja (270–439)
//        3 moderada-alta (440–659) · 4 alta (≥ 660)
//   6. RBR (Relativized Burn Ratio, Parks et al. 2014) como métrica
//      complementaria, más comparable entre tipos de vegetación.
//
// ⚠️ Fechas, umbrales y área de búsqueda son parámetros de partida:
//    verificar sobre el mapa (capas RGB y falso color).
// ============================================================


// ---------------- 0. CONFIGURACIÓN ----------------
var CFG = {
  // Área de búsqueda amplia: Alberche (Burgohondo, Navaluenga), Valle del
  // Tiétar (Piedralaves) y El Tiemblo–Cebreros. Ajustar si el incendio
  // queda cortado en algún borde.
  areaBusqueda: ee.Geometry.Rectangle([-5.05, 40.15, -4.15, 40.60]),

  // Fechas (el incendio empezó el 22/07/2026 y se estabilizó el 06/08/2026)
  pre: ['2026-06-15', '2026-07-21'],
  post: ['2026-08-08', '2026-09-20'],

  umbralCloudScore: 0.60,
  nubesMax: 40,

  // Umbral de dNBR (×1000, corregido) para delimitar el área quemada
  umbralQuemado: 100,
  // Radio del cierre morfológico, en píxeles de 20 m (3 → 60 m)
  radioCierre: 3,
  // Anillo para el offset: entre 500 m y 2.000 m fuera del perímetro
  anilloInterno: 500,
  anilloExterno: 2000,

  escala: 20,            // B12 es de 20 m: se trabaja a 20 m
  crs: 'EPSG:25830',     // ETRS89 / UTM 30N (sistema oficial en España peninsular)

  soloExportar: false,
  assetSeveridad: 'projects/my-project-javier-464019/assets/tietar_severidad_v1',
  assetPerimetro: 'projects/my-project-javier-464019/assets/tietar_perimetro_v1',
  carpetaDrive: 'Tietar_Postincendio'
};

var area = CFG.areaBusqueda;
Map.centerObject(area, 10);


// ---------------- 1. SENTINEL-2 Y NBR ----------------
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');

function coleccion(fechas) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(area)
    .filterDate(fechas[0], fechas[1])
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CFG.nubesMax))
    .linkCollection(csPlus, ['cs_cdf'])
    .map(function (img) {
      return img.updateMask(img.select('cs_cdf').gte(CFG.umbralCloudScore));
    });
}

var colPre = coleccion(CFG.pre);
var colPost = coleccion(CFG.post);
print('Imágenes pre-incendio:', colPre.size());
print('Imágenes post-incendio:', colPost.size());

var pre = colPre.median();
var post = colPost.median();

function nbr(img) { return img.normalizedDifference(['B8', 'B12']); }

var nbrPre = nbr(pre).rename('nbr_pre');
var nbrPost = nbr(post).rename('nbr_post');
var dnbrBruto = nbrPre.subtract(nbrPost).multiply(1000).rename('dnbr_bruto');

// Agua y zonas urbanas fuera del análisis (ESA WorldCover 2021)
var worldCover = ee.ImageCollection('ESA/WorldCover/v200').first();
var excluir = worldCover.eq(50).or(worldCover.eq(80));   // 50 urbano, 80 agua
// Cultivos (40): la cosecha de cereal en verano baja el NBR igual que un
// incendio. Se excluyen solo para DELIMITAR el perímetro.
var cultivo = worldCover.eq(40);


// ---------------- 2. PERÍMETRO ----------------
var candidato = dnbrBruto.gte(CFG.umbralQuemado)
  .and(excluir.not()).and(cultivo.not())
  .unmask(0);

// Cierre morfológico: une fragmentos separados por islas sin quemar o bordes
var cerrado = candidato
  .focalMax({radius: CFG.radioCierre, kernelType: 'circle', units: 'pixels'})
  .focalMin({radius: CFG.radioCierre, kernelType: 'circle', units: 'pixels'});

var poligonos = cerrado.selfMask().reduceToVectors({
  geometry: area,
  scale: CFG.escala,
  crs: CFG.crs,
  geometryType: 'polygon',
  eightConnected: true,
  maxPixels: 1e10,
  tileScale: 4
}).map(function (f) {
  return f.set('ha', f.geometry().area(1).divide(1e4));
});

var poligonosOrdenados = poligonos.sort('ha', false);
print('Polígonos quemados más grandes (ha):',
      poligonosOrdenados.limit(5).aggregate_array('ha'));

// El incendio buscado es el polígono más grande del área de búsqueda
var perimetro = ee.Feature(poligonosOrdenados.first());
var geomPerimetro = perimetro.geometry();


// ---------------- 3. OFFSET Y dNBR CORREGIDO ----------------
var anillo = geomPerimetro.buffer(CFG.anilloExterno, 50)
  .difference(geomPerimetro.buffer(CFG.anilloInterno, 50), 50);

var offset = ee.Number(dnbrBruto
  .updateMask(excluir.not()).updateMask(cultivo.not())
  .reduceRegion({
    reducer: ee.Reducer.median(),
    geometry: anillo,
    scale: CFG.escala,
    crs: CFG.crs,
    maxPixels: 1e10,
    tileScale: 4
  }).get('dnbr_bruto'));
print('Offset de dNBR (mediana en el anillo no quemado):', offset);

var dnbr = dnbrBruto.subtract(offset).rename('dnbr');

// RBR (Parks et al., 2014), corregido por el mismo offset
var rbr = dnbr.divide(nbrPre.add(1.001)).rename('rbr');


// ---------------- 4. SEVERIDAD ----------------
var severidad = ee.Image(0)
  .where(dnbr.gte(100), 1)
  .where(dnbr.gte(270), 2)
  .where(dnbr.gte(440), 3)
  .where(dnbr.gte(660), 4)
  .updateMask(dnbr.mask())
  .updateMask(excluir.not())
  .clip(geomPerimetro)
  .rename('severidad')
  .toByte();

var nombresSev = ['No quemado', 'Baja', 'Moderada-baja', 'Moderada-alta', 'Alta'];
var paletaSev = ['1a9850', 'fee08b', 'fdae61', 'f46d43', 'a50026'];


// ---------------- 5. REFERENCIA INDEPENDIENTE: MODIS MCD64A1 ----------------
// Área quemada mensual de MODIS (500 m). Puede no estar disponible todavía
// para julio–agosto de 2026: el script lo informa y sigue.
var mcd = ee.ImageCollection('MODIS/061/MCD64A1')
  .filterDate('2026-07-01', '2026-09-01')
  .select('BurnDate');
print('Imágenes MODIS MCD64A1 disponibles (jul–ago 2026):', mcd.size());

// Día del año: 22/07 = 203; 10/08 = 222 (margen de unos días)
var modisQuemado = ee.Image(ee.Algorithms.If(
  mcd.size().gt(0),
  mcd.max().gte(200).and(mcd.max().lte(225)).selfMask(),
  ee.Image(0).selfMask()
)).rename('modis');


// ---------------- 6. ESTADÍSTICAS ----------------
var haPx = ee.Image.pixelArea().divide(1e4);
var statsSev = haPx.addBands(severidad).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'severidad'}),
  geometry: geomPerimetro,
  scale: CFG.escala,
  crs: CFG.crs,
  maxPixels: 1e10,
  tileScale: 4
});

var tablaSev = ee.FeatureCollection(ee.List(statsSev.get('groups')).map(function (g) {
  g = ee.Dictionary(g);
  var c = ee.Number(g.get('severidad'));
  return ee.Feature(null, {
    severidad: c,
    clase: ee.List(nombresSev).get(c),
    hectareas: g.get('sum')
  });
}));

var haPerimetro = perimetro.get('ha');
var haModis = haPx.updateMask(modisQuemado).reduceRegion({
  reducer: ee.Reducer.sum(), geometry: area, scale: 500, maxPixels: 1e10
}).get('area');

if (!CFG.soloExportar) {
  print('Superficie del perímetro (ha):', haPerimetro);
  print('Superficie quemada MODIS en el área de búsqueda (ha, 500 m):', haModis);
  tablaSev.evaluate(function (fc, error) {
    if (error) { print('Error en estadísticas:', error); return; }
    var lineas = ['--- Hectáreas por severidad (dentro del perímetro) ---',
                  'clase;severidad;hectareas'];
    fc.features.forEach(function (f) {
      lineas.push(f.properties.severidad + ';' + f.properties.clase + ';' +
                  Math.round(f.properties.hectareas));
    });
    print(lineas.join('\n'));
  });
}


// ---------------- 7. MAPA ----------------
if (!CFG.soloExportar) {
  var visRgb = {bands: ['B4', 'B3', 'B2'], min: 0, max: 2500};
  var visFalso = {bands: ['B12', 'B8', 'B4'], min: 0, max: 4000};  // quemado = rojo/morado

  Map.addLayer(pre.clip(area), visRgb, 'RGB pre-incendio', false);
  Map.addLayer(post.clip(area), visRgb, 'RGB post-incendio', false);
  Map.addLayer(post.clip(area), visFalso, 'Falso color post (B12-B8-B4)', false);
  Map.addLayer(dnbr.clip(area), {min: -100, max: 800,
    palette: ['1a9850', 'ffffbf', 'fdae61', 'd73027', '67001f']}, 'dNBR corregido', false);
  Map.addLayer(modisQuemado, {palette: ['00ffff']}, 'MODIS MCD64A1 (referencia)', false, 0.5);
  Map.addLayer(severidad, {min: 0, max: 4, palette: paletaSev}, 'Severidad');
  Map.addLayer(ee.Image().paint(ee.FeatureCollection([perimetro]), 1, 2),
    {palette: ['000000']}, 'Perímetro');
  Map.addLayer(ee.Image().paint(anillo, 1, 1), {palette: ['0000ff']}, 'Anillo para el offset', false);
  Map.addLayer(poligonosOrdenados.limit(5).style({color: 'ff00ff', fillColor: '00000000'}),
    {}, 'Otros polígonos candidatos (control)', false);

  var leyenda = ui.Panel({style: {position: 'bottom-left', padding: '8px'}});
  leyenda.add(ui.Label('Severidad (dNBR)', {fontWeight: 'bold'}));
  for (var i = 0; i < nombresSev.length; i++) {
    leyenda.add(ui.Panel([
      ui.Label('', {backgroundColor: '#' + paletaSev[i], padding: '8px', margin: '2px 6px 2px 0'}),
      ui.Label(nombresSev[i], {margin: '2px 0'})
    ], ui.Panel.Layout.flow('horizontal')));
  }
  Map.add(leyenda);

  // Clic: valores para revisar umbrales
  var inspeccion = nbrPre.addBands(nbrPost).addBands(dnbr).addBands(rbr).addBands(severidad);
  Map.onClick(function (c) {
    var p = ee.Geometry.Point([c.lon, c.lat]);
    print('Valores en ' + c.lat.toFixed(5) + ', ' + c.lon.toFixed(5),
          inspeccion.reduceRegion(ee.Reducer.first(), p, CFG.escala));
  });
  Map.style().set('cursor', 'crosshair');
}


// ---------------- 8. EXPORTACIONES ----------------
var regionExport = geomPerimetro.buffer(CFG.anilloExterno, 50).bounds(50);

var paraAsset = ee.Image.cat([
  severidad.unmask(255).toInt16(),
  dnbr.round().toInt16(),
  rbr.round().toInt16(),
  nbrPre.multiply(1000).round().toInt16().rename('nbr_pre'),
  nbrPost.multiply(1000).round().toInt16().rename('nbr_post')
]).set({
  pre_inicio: CFG.pre[0], pre_fin: CFG.pre[1],
  post_inicio: CFG.post[0], post_fin: CFG.post[1],
  offset_dnbr: offset,
  umbral_quemado: CFG.umbralQuemado
});

Export.image.toAsset({
  image: paraAsset,
  description: 'Asset_Tietar_severidad_v1',
  assetId: CFG.assetSeveridad,
  region: regionExport,
  scale: CFG.escala,
  crs: CFG.crs,
  maxPixels: 1e10,
  pyramidingPolicy: {'.default': 'mean', 'severidad': 'mode'}
});

var fcPerimetro = ee.FeatureCollection([perimetro.set({
  incendio: 'Burgohondo - Valle del Tietar (Avila), 2026',
  metodo: 'dNBR Sentinel-2 >= ' + CFG.umbralQuemado + ' + cierre morfologico'
})]);

Export.table.toAsset({
  collection: fcPerimetro,
  description: 'Asset_Tietar_perimetro_v1',
  assetId: CFG.assetPerimetro
});

Export.table.toDrive({
  collection: fcPerimetro,
  description: 'Tietar_perimetro_v1',
  folder: CFG.carpetaDrive,
  fileFormat: 'GeoJSON'
});

Export.table.toDrive({
  collection: tablaSev,
  description: 'Tietar_severidad_hectareas',
  folder: CFG.carpetaDrive,
  fileFormat: 'CSV',
  selectors: ['severidad', 'clase', 'hectareas']
});
