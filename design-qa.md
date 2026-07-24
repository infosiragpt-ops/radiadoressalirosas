# Design QA — Radiadores Salirosas

Fecha de validación: 24 de julio de 2026

## Alcance y referencias

- Sitio de referencia: `https://radiadoressalirosas.com/`
- Captura original de escritorio:
  `reference/source/desktop/user-home-3022x1718.png`
- Captura original móvil:
  `reference/source/mobile/home-top-390x844.png`
- Sistema visual medido: `reference/design-system.md`
- Trazabilidad de captura: `reference/source-capture.md`

La comparación usa la misma sección y estado visual: primer banner de sistemas
de enfriamiento en escritorio y banner de envíos nacionales en móvil. Cada
archivo comparativo coloca la referencia a la izquierda y el prototipo a la
derecha.

## Evidencia renderizada

- Escritorio, viewport CSS `1511 × 859` y captura visible `1496 × 850`:
  `output/browser/home-desktop-1511x859.png`
- Comparación de escritorio:
  `output/browser/desktop-reference-vs-prototype.png`
- Móvil, viewport CSS `390 × 844` y captura visible `375 × 812`:
  `output/browser/home-mobile-390x844.png`
- Comparación móvil:
  `output/browser/mobile-reference-vs-prototype.png`
- Referencia específica del footer original:
  `reference/source/desktop/footer-social-map-1511x859.png`
- Footer final en escritorio, viewport CSS `1511 × 859`:
  `output/browser/footer-social-map-desktop-1511x859.png`
- Footer final en móvil, viewport CSS `390 × 844`:
  `output/browser/footer-social-map-mobile-390x844.png`
- Comparación enfocada, referencia a la izquierda e implementación a la derecha:
  `output/browser/footer-reference-vs-prototype.png`

Las capturas del prototipo se generaron en el navegador integrado de Codex
contra `http://127.0.0.1:4173/`, después de terminar la carga del catálogo y la
transición del carrusel.

## Criterios revisados

- Geometría: alto del encabezado, proporción y recorte del hero, separaciones,
  ancho de promociones y comienzo de productos destacados.
- Identidad: logotipo, naranja de marca, fondos, radios y sombras.
- Tipografía: jerarquía, pesos, tamaños, navegación y buscador.
- Imágenes: assets originales locales, sin hotlinks ni placeholders.
- Responsive: encabezado compacto, menú móvil, hero específico, promociones y
  botón flotante.
- Interacción y accesibilidad: navegación por rutas, foco visible, etiquetas
  accesibles, buscador, menú, formularios y contraste.

## Hallazgos corregidos durante QA

1. **P1 — Catálogo incompleto bajo React Strict Mode.** Una solicitud abortada
   podía reemplazar los 186 productos por los 12 elementos de contingencia.
   Se aisló el efecto desmontado y se ignora `AbortError`; `/store/` muestra los
   186 productos y las 11 categorías.
2. **P1 — Destino de WhatsApp.** Se reemplazó el enlace genérico por el número
   comercial `+51 943 716 278`.
3. **P2 — Hero móvil.** Se incorporaron los assets móviles originales para
   conservar composición, texto y recorte en `390 × 844`.
4. **P2 — Ritmo del encabezado y promociones.** Se ajustaron los gaps,
   proporciones y padding exterior para coincidir con la captura fuente.
5. **P2 — Carrusel.** El temporizador se reinicia tras una selección manual y
   los indicadores que no aparecen en el sitio original permanecen ocultos.
6. **P2 — Texto importado.** Se decodificaron entidades y se normalizaron slugs
   para evitar cadenas corruptas en nombres y URLs.
7. **P1 — Seed destructivo en reinicios.** El contenedor de API ya no ejecuta
   seed ni migraciones al arrancar. Bootstrap y migraciones son tareas one-shot
   explícitas, con `MIGRATOR_DATABASE_URL` separada de la cuenta limitada del
   runtime, para preservar cambios administrativos y reducir privilegios.
8. **P2 — Flujos secundarios.** La búsqueda global limpia filtros heredados,
   cuenta y recuperación tienen respuestas funcionales, administración permite
   cambiar el estado de cotizaciones y las URLs malformadas muestran 404.
9. **P2 — Soft 404.** El worker conserva HTTP 200 en rutas SPA válidas y devuelve
   un shell con HTTP 404 y `x-robots-tag: noindex` para URLs desconocidas.
10. **P2 — Footer sin redes ni guía de llegada.** Se incorporaron accesos de
    `46 × 46 px` a Instagram, TikTok y Facebook con nombres accesibles; también
    se reconstruyó la ubicación de la fuente con mapa embebido, dirección,
    horario, teléfono y un CTA externo “Cómo llegar”. El bloque se adapta a
    escritorio, tableta y móvil sin desbordamiento horizontal.

## Diferencias deliberadas

- El asistente flotante de terceros del sitio fuente no se replica: es un
  widget opaco sin contrato ni backend capturado. El acceso principal por
  WhatsApp sí está implementado y operativo.
- La fuente publica `0 PEN` y no permite compra directa. Los 186 productos se
  conservan como `quote_only`; no se inventan precios ni pagos disponibles.
- La nueva implementación usa React, Fastify y PostgreSQL en lugar de
  WordPress/WooCommerce, manteniendo la experiencia pública y agregando
  administración propia.

## Regresión funcional

- API: `/api/v1/health` respondió `status: ok` y `database.status: ok`.
- PostgreSQL: 186 productos, 186 en modo `quote_only`, 11 categorías y 1,860
  unidades de inventario.
- Catálogo: 186 imágenes locales disponibles, sin SKU o slugs duplicados.
- Solicitud de cotización: el formulario creó `COT-20260724-001000` y el panel
  administrativo mostró el registro persistido.
- Administración: inicio de sesión, métricas, listado de solicitudes y
  navegación entre secciones verificados.
- Búsqueda y ficha: búsqueda por SKU `81061016518`, sugerencia y ruta de
  producto verificadas.
- Footer: 3 enlaces sociales externos, mapa con título accesible, dirección,
  horario, teléfono y enlace de navegación verificados en la ficha anotada.
- Responsive del footer: `1511 × 859` y `390 × 844` comprobados, sin
  desbordamiento horizontal; los botones sociales conservan un área táctil de
  `46 × 46 px`.
- Consola del navegador: sin errores ni advertencias de la aplicación en la
  carga final; únicamente mensajes informativos de Vite/React en desarrollo.
- Automatización: build de API y frontend correcto; 6 pruebas de dominio/API y
  despliegue y 5 pruebas de empaquetado/rutas aprobaron.

## Resultado

No quedan hallazgos visuales o funcionales locales abiertos con severidad P0 o
P1. Las comparaciones finales verifican el encabezado, hero, promociones,
respuesta móvil y CTA flotante en el estado entregado.

Antes de producción queda un gate operativo P2: materializar una cuenta
PostgreSQL DML limitada. Compose, `.env.example` y
`packages/db/scripts/provision-runtime-role.sql` ya soportan la separación, pero
el proceso local actual continúa con el propietario `luis` porque crear un login
y cambiar privilegios requiere autorización explícita.

final result: passed
