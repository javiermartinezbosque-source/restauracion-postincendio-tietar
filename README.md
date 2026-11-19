# Restauración post-incendio · Burgohondo – Valle del Tiétar (Ávila), 2026

Evaluación post-incendio de emergencia y priorización de la restauración con especies nativas tras el gran incendio de julio–agosto de 2026 en la vertiente oriental de la Sierra de Gredos (Alberche y Valle del Tiétar, Ávila). El análisis usa **Google Earth Engine** y **QGIS**.

> Proyecto de portfolio en curso. Los resultados son una aproximación técnica basada en teledetección y **no sustituyen la evaluación oficial** de las administraciones competentes.

---

## Contexto

- El incendio se declaró en **Burgohondo** el 22 de julio de 2026, cruzó la sierra hacia el **Valle del Tiétar**, obligó a evacuar municipios como **Piedralaves** y se estabilizó el 6 de agosto, tras quince días activo ([Infobae](https://www.infobae.com/espana/2026/08/06/estabilizado-el-incendio-de-burgohondo-avila-tras-quince-dias-activos-y-mas-de-50000-hectareas-afectadas/)).
- Las cifras de superficie publicadas variaron mucho mientras el incendio seguía activo, y algunas fuentes hablan de **más de 50.000 ha** (misma fuente). Por eso este proyecto **delimita el área quemada con Sentinel-2** en lugar de depender de cifras de prensa.
- Marco normativo: España presentó el borrador de su **Plan Nacional de Restauración** el 31/08/2026, en cumplimiento del Reglamento (UE) 2024/1991 de Restauración de la Naturaleza; la versión final se espera para septiembre de 2027 ([La Moncloa](https://www.lamoncloa.gob.es/lang/en/gobierno/news/Paginas/2026/20260831-national-nature-restoration-plan.aspx?mode=Dark)).

## Preguntas

1. ¿Qué superficie quemó y con qué severidad?
2. ¿Qué vegetación había antes, y cuál puede regenerarse sola (especies rebrotadoras) y cuál no?
3. ¿Dónde es urgente estabilizar el suelo antes de las lluvias?
4. ¿Dónde conviene restaurar activamente con especies nativas, y con cuáles?
5. *(Fase 2027)* ¿Qué se regeneró después de la primera temporada de crecimiento?

## Plan de trabajo

| Fase | Contenido | Estado |
|---|---|---|
| 1 · Perímetro y severidad | dNBR y RBR con Sentinel-2, perímetro propio, clases de severidad | 🔄 En curso |
| 2 · Vegetación previa | Mapa Forestal de España: especies rebrotadoras, germinadoras y exóticas | ⏳ |
| 3 · Riesgo de erosión | Pendiente, severidad y lluvia: prioridades de estabilización | ⏳ |
| 4 · Priorización | Multicriterio: dejar regenerar, estabilizar, restaurar con nativas o monitorear | ⏳ |
| 5 · Especies y carbono | Especies nativas recomendadas y captura de carbono esperada | ⏳ |
| 6 · Regeneración (2027) | Recuperación del NDVI y el NBR tras la primavera de 2027 | ⏳ |

## Fase 1 · Perímetro y severidad

Script: [`gee/01_perimetro_severidad.js`](gee/01_perimetro_severidad.js)

1. **Compuestos de Sentinel-2:** mediana pre-incendio (15/06–21/07/2026) y post-incendio (08/08–20/09/2026), con nubes enmascaradas por Cloud Score+.
2. **NBR** = (B8 − B12) / (B8 + B12); **dNBR** = NBR pre − NBR post (×1000).
3. **Corrección por offset:** se resta la mediana del dNBR en un anillo no quemado de 0,5–2 km alrededor del perímetro, para descontar diferencias de fenología e iluminación entre fechas.
4. **Perímetro propio:** dNBR ≥ 100, sin zonas urbanas, agua ni cultivos (la cosecha de verano imita la señal de un incendio), cierre morfológico de 60 m y selección del polígono mayor.
5. **Severidad** según los umbrales de dNBR de Key y Benson (2006):

| Clase | dNBR (×1000) |
|---|---|
| No quemado | < 100 |
| Baja | 100–269 |
| Moderada-baja | 270–439 |
| Moderada-alta | 440–659 |
| Alta | ≥ 660 |

6. **RBR** (Parks et al., 2014) como métrica complementaria, más comparable entre tipos de vegetación.
7. **Referencia independiente:** área quemada de MODIS MCD64A1 (500 m), si ya está disponible para el período.

**Resultados:** *pendientes de ejecución.*

## Datos

| Dataset | Uso | ID en GEE |
|---|---|---|
| Sentinel-2 SR Harmonized | NBR, dNBR, RGB | `COPERNICUS/S2_SR_HARMONIZED` |
| Cloud Score+ | Máscara de nubes | `GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED` |
| ESA WorldCover 2021 | Exclusión de agua, urbano y cultivos | `ESA/WorldCover/v200` |
| MODIS MCD64A1 | Área quemada de referencia | `MODIS/061/MCD64A1` |

Sistema de referencia de las salidas: **ETRS89 / UTM 30N (EPSG:25830)**, el oficial en la España peninsular.

## Referencias

- Key, C. H. y Benson, N. C. (2006). *Landscape Assessment (LA): Sampling and Analysis Methods*. En: FIREMON: Fire Effects Monitoring and Inventory System. USDA Forest Service, Gen. Tech. Rep. RMRS-GTR-164-CD.
- Parks, S. A., Dillon, G. K. y Miller, C. (2014). A new metric for quantifying burn severity: the relativized burn ratio. *Remote Sensing*, 6(3), 1827–1844.
- Reglamento (UE) 2024/1991 relativo a la restauración de la naturaleza — [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1991/oj).

## Autor

Javier Martínez Bosque
