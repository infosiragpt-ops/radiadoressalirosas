# Auditoría de mejoras profesionales de alto impacto

Fecha: 24 de julio de 2026

## Alcance

Auditoría combinada de UX, conversión, accesibilidad visible, SEO técnico,
rendimiento y operación del sitio local de Radiadores Salirosas.

Objetivo principal del usuario: encontrar el repuesto correcto y solicitar una
cotización verificable con el menor número de pasos posible.

## Evidencia capturada

1. Inicio — `01-inicio.png`
2. Catálogo de escritorio — `02-catalogo.png`
3. Ficha de producto — `03-producto.png`
4. Contacto y formulario — `04-contacto.png`
5. Catálogo móvil — `05-catalogo-movil.png`
6. Filtros móviles abiertos — `06-filtros-movil.png`
7. Carrito vacío — `07-carrito-vacio.png`

## Veredicto

La identidad visual es sólida y el sitio ya ofrece catálogo, búsqueda,
WhatsApp, formularios persistidos y administración. La mayor oportunidad no es
añadir más decoración: es convertir el catálogo en un sistema de compatibilidad
y cotización trazable.

La ruptura principal está en el modelo comercial: los 186 productos actuales
son `quote_only`, pero el sitio muestra un carrito que no puede recibirlos.
Cards y fichas envían al usuario directamente a WhatsApp, mientras el formulario
web crea solicitudes sin productos asociados.

## Fortalezas confirmadas

- Identidad visual coherente y responsive.
- Búsqueda por nombre, marca y código.
- CTA de WhatsApp claro en cards y fichas.
- Formulario que crea números de atención `COT` en PostgreSQL.
- API y base de datos ya preparadas para cotizaciones con múltiples artículos.
- Estados comerciales y panel administrativo existentes.
- Foco visible global, etiquetas accesibles en controles principales y
  estructura semántica razonable.

## Prioridades

| Orden | Mejora | Impacto | Esfuerzo |
|---|---|---:|---:|
| 1 | Lista de cotización multiproducto, en lugar de carrito de compra | Muy alto | Medio |
| 2 | Cotización contextual con producto, teléfono y carga de fotos | Muy alto | Medio |
| 3 | Buscador de compatibilidad por pieza, marca, modelo, año, OEM y medidas | Muy alto | Alto |
| 4 | Fichas técnicas con aplicaciones, equivalencias, medidas, stock y garantía | Muy alto | Medio-alto |
| 5 | Analítica del embudo y atribución de campañas | Alto | Bajo-medio |
| 6 | SEO indexable por producto y SEO local | Alto | Medio-alto |
| 7 | Catálogo paginado e imágenes optimizadas | Alto | Medio |
| 8 | Seguimiento real de cotizaciones y CRM comercial | Alto | Medio |
| 9 | Prueba social y políticas comerciales verificables | Alto | Bajo-medio |
| 10 | Corrección móvil y accesibilidad de cards/filtros | Alto | Bajo |

## Recomendaciones

### 1. Lista de cotización multiproducto

Permitir “Agregar a cotización” en todos los productos `quote_only`, conservar
cantidad y SKU, y enviar una única solicitud a PostgreSQL. Después se puede
ofrecer WhatsApp como continuidad, incluyendo el número `COT`.

Esto aprovecha las tablas `quote_requests` y `quote_request_items` ya
existentes, evita perder el contexto al salir a WhatsApp y permite medir la
conversión por producto.

### 2. Cotización contextual y con fotos

Desde cada ficha, abrir un formulario corto con producto preseleccionado:
teléfono, cantidad, marca/modelo/año y hasta tres fotos de la pieza, placa o
código. El correo puede ser opcional y solicitarse después.

### 3. Buscador de compatibilidad

Añadir en inicio y catálogo un flujo guiado:

1. Tipo de pieza.
2. Marca del vehículo.
3. Modelo y año.
4. Código OEM o medidas.
5. Resultados compatibles o derivación a asesor.

Las categorías actuales y la marca representan prácticamente la misma
clasificación, por lo que no reducen suficiente la incertidumbre.

### 4. Ficha técnica comercial

Estructurar aplicaciones compatibles, años, dimensiones, material, OEM
equivalentes, posición, garantía, disponibilidad, plazo estimado y método de
envío. Incorporar galería con detalle de conexiones y un PDF descargable cuando
los datos estén validados.

### 5. Medición de negocio

Registrar búsquedas, productos vistos, clics de WhatsApp, llamadas, rutas,
productos añadidos a cotización, formularios iniciados/enviados y estados
ganados. Conservar UTM y campaña en PostgreSQL.

La mejora de conversión debe validarse con estos eventos; hoy no existe una
línea base medible.

### 6. SEO técnico e indexable

- Renderizar o prerenderizar inicio, categorías y fichas.
- Título, descripción, canonical y Open Graph específicos.
- JSON-LD de `LocalBusiness`, `Product`, `BreadcrumbList` e `ItemList`.
- `sitemap.xml`, `robots.txt` y `noindex` en carrito, cuenta y administración.
- H1 textual en portada.
- 404 reales para slugs de producto inexistentes.

### 7. Rendimiento

El frontend descarga el catálogo completo antes de mostrar el sitio y renderiza
las 186 tarjetas. Debe consultar portada, ficha y catálogo por separado,
paginar 24 resultados y aplicar filtros en servidor.

También debe generar miniaturas AVIF/WebP, `srcset` y tamaños específicos para
cards. Los activos públicos actuales son mucho más pesados que el JavaScript,
por lo que optimizar imágenes tendrá mayor retorno que microoptimizar el bundle.

### 8. Seguimiento de cotizaciones

“Mis cotizaciones” debe listar solicitudes reales, artículos, estado,
responsable, respuesta, fecha de seguimiento y PDF de cotización. En el panel
interno conviene añadir responsable, próxima acción, notas, vencimiento y
alertas por solicitud sin atender.

### 9. Confianza verificable

Mostrar razón social/RUC, dirección consistente, garantía real, condiciones de
cambio, comprobantes emitidos, cobertura de envío y testimonios auténticos. El
horario debe provenir de una sola configuración: el footer muestra solo
lunes-viernes, mientras Contacto también comunica atención los sábados.

### 10. Móvil y accesibilidad

- Cambiar la grilla móvil a una tarjeta por fila o simplificar títulos.
- Eliminar la duplicación visual `COTIZARCotizar`.
- Dar al CTA un área táctil mínima cómoda y texto legible.
- Convertir filtros en drawer con resumen, limpiar y aplicar.
- Evitar que el WhatsApp flotante tape tarjetas o filtros.
- Pasar el texto comercial crítico del hero/promociones de la imagen a HTML.
- Evitar que el menú móvil cerrado siga siendo alcanzable con Tab; usar
  `inert`/`aria-hidden`, Escape, gestión y devolución de foco.
- Encerrar y devolver el foco en el modal administrativo.
- Restituir un foco visible en los buscadores, cuyos estilos eliminan el
  contorno.
- Revisar el contraste de blanco sobre naranja y verde, y eliminar textos de
  8–10 px.
- Añadir pausa al carrusel automático, enlace “Saltar al contenido” y anuncio
  de cambios de ruta.
- Probar teclado, lector de pantalla, contraste y zoom antes de afirmar
  conformidad WCAG.

## Hoja de ruta recomendada

### Fase 1 — Conversión medible

Lista de cotización, formulario contextual, fotos, corrección móvil, eventos y
atribución.

### Fase 2 — Encontrabilidad

Buscador de compatibilidad, fichas técnicas, catálogo paginado, imágenes
optimizadas y SEO indexable.

### Fase 3 — Operación B2B

Seguimiento real, CRM, PDFs, alertas, prueba social, CI/CD, observabilidad y
backups con restauración probada.

## Gates antes de producción

- Definir una única topología de frontend/API y validar
  `VITE_API_BASE_URL`; el worker estático actual no reenvía `/api`.
- Evitar que el catálogo estático de contingencia oculte una API caída.
- Devolver 404 reales para productos inexistentes.
- Incorporar CI con tipos, pruebas, build, seguridad y presupuesto de
  rendimiento.
- Automatizar backups cifrados de PostgreSQL y probar restauraciones.
- Añadir monitoreo de disponibilidad, errores y cotizaciones sin atender.

## Límites

La auditoría confirma la experiencia visible y el comportamiento revisable en
código. No existen datos reales de conversión, búsquedas o campañas, por lo que
el tamaño del incremento comercial es una hipótesis hasta instrumentar y medir.
La revisión visual no sustituye una auditoría WCAG completa con tecnologías de
asistencia.
