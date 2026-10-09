# Kit de PDF — Especificación técnica para Claude Code

Oct 9, 2026 · @Rodri

## Cómo usar este documento

Esta especificación es el contrato de trabajo de Claude Code: léela entera antes de escribir código y avanza por fases, sin saltarte ninguna.

- Exporta este documento a Markdown y guárdalo como `SPEC.md` en la raíz del repositorio. Es la fuente de verdad del proyecto.
- Al empezar cada sesión, relee `SPEC.md` y trabaja una sola fase cada vez, empezando por la Fase 0.
- Antes de cada fase, propón un plan breve: archivos que vas a tocar, riesgos y orden de trabajo. Espera la confirmación de Rodrigo.
- Una fase está terminada solo si cumple todos sus criterios de aceptación (sección 8), la CI está en verde y la documentación está actualizada. No declares nada terminado sin haberlo ejecutado: mide, no supongas.
- Si falta una decisión técnica relevante, elige la opción más simple que respete la arquitectura y regístrala como ADR en `docs/adr/`. Si la decisión contradice este documento, pregunta antes.
- Haz commits pequeños con Conventional Commits, una intención por commit.
- Ninguna dependencia nueva entra sin comprobar su licencia (MIT, Apache-2.0, BSD, ISC o CC0; nada GPL ni AGPL salvo las excepciones aprobadas en Cumplimiento legal) y su peso en el bundle. Se anota en `THIRD_PARTY_LICENSES.md`.
- Código, commits y ADRs en inglés. La interfaz y el README van en español e inglés, con español por defecto. El soporte i18n se monta desde la Fase 0.

## Visión del producto

Vidopdf (nombre de trabajo, en la línea de Vidopix y vidotho) es un espacio de trabajo para PDFs que funciona al 100 % en el navegador. Cargas uno o varios archivos, ves todas sus páginas como miniaturas y las unes, divides, reordenas, rotas, comprimes y proteges sin que ningún archivo salga del dispositivo.

**Objetivos**

- **Un espacio de trabajo, no una colección de herramientas.** Una sola pantalla con una rejilla de páginas. Unir, reordenar, rotar o borrar son gestos sobre esa rejilla; comprimir y proteger se aplican al exportar.
- **Privacidad verificable.** Sin backend, sin analítica y sin peticiones a terceros. Una política CSP lo impide y cualquiera puede comprobarlo en las herramientas del navegador.
- **Calidad profesional.** Fluido con PDFs de cientos de páginas, deshacer y rehacer en toda la sesión, atajos de teclado, accesible y utilizable sin conexión.
- **Portafolio con ingeniería visible.** Arquitectura limpia, tests con PDFs reales, ADRs y un README que documenta qué generó la IA y qué revisó Rodrigo.

**Público**

Personas que manejan documentos a diario (administrativos, estudiantes, autónomos) y los desarrolladores o reclutadores que revisen el repositorio.

**No-objetivos**

- Sin cuentas, sin backend y sin almacenamiento en la nube.
- Sin edición del contenido de una página (cambiar el texto dentro del PDF).
- Sin conversión desde o hacia Word, Excel o PowerPoint.
- Optimizado para escritorio y utilizable en tablet; el móvil no es prioridad.

**Alcance por versión**

- **v1, núcleo:** unir, dividir, gestionar páginas, comprimir, y convertir imágenes a PDF y PDF a imágenes.
- **v2, nivel profesional:** numeración, marcas de agua, recorte, metadatos, marcadores, contraseña, firma y formularios.
- **v3, diferenciadores:** pipeline encadenado, procesamiento por lotes, OCR opcional, comparación de dos PDFs y PWA offline.

## Stack tecnológico

TypeScript estricto sobre un monorepo pnpm, con un motor PDF distinto para cada tarea y solo licencias permisivas.

| Capa | Elección | Licencia | Para qué |
| --- | --- | --- | --- |
| Lenguaje | TypeScript (strict, noUncheckedIndexedAccess) | Apache-2.0 | Tipos exhaustivos en el dominio |
| UI | React + Vite | MIT | Misma base que Vidopix |
| Estado de UI | Zustand | MIT | Solo estado de interfaz; el dominio vive en el núcleo |
| Renderizado de páginas | pdfjs-dist | Apache-2.0 | Miniaturas y vista previa en workers |
| Manipulación de PDF | @cantoo/pdf-lib (fork mantenido de pdf-lib) | MIT | Unir, dividir, reordenar, rotar, metadatos y cifrado AES-256 |
| Compresión | Reencodado de imágenes con OffscreenCanvas y reconstrucción del PDF | propio | Compresión sin motores AGPL (ver decisión abajo) |
| Hilos | Web Workers + Comlink | Apache-2.0 | Interfaz nunca bloqueada |
| Rejilla | dnd-kit + @tanstack/react-virtual | MIT | Arrastrar con teclado y virtualización de cientos de páginas |
| Archivos ZIP | fflate | MIT | Salida de varios PDFs o imágenes en un solo archivo |
| OCR (v3) | tesseract.js, carga bajo demanda | Apache-2.0 | PDFs escaneados buscables |
| Tests | Vitest, fast-check, Playwright | MIT / Apache-2.0 | Unitarios, propiedades y E2E en Chromium y WebKit |
| Calidad | ESLint, Prettier, dependency-cruiser | MIT | Estilo y reglas de dependencia entre capas |
| i18n | i18next | MIT | Español e inglés |
| Despliegue | Hosting estático (Vercel o Cloudflare Pages) | Servicio (sus términos) | Subdominio de vidotho.com, por ejemplo pdf.vidotho.com |

**Decisiones que Claude Code debe verificar con un spike antes de comprometerse**

1. **Compresión.** pdf-lib no recomprime imágenes. En la Fase 3, mide sobre un corpus de prueba cuánto reduce el reencodado con canvas. Si el resultado es claramente insuficiente, redacta un ADR comparando motores WASM (por ejemplo MuPDF, que es AGPL) y deja la decisión a Rodrigo: con el repositorio público es viable, pero cambia la licencia del proyecto.
2. **Contraseña (v2).** @cantoo/pdf-lib ya cifra y descifra (AES-256 por defecto), así que no hace falta otra pieza. No se usa el paquete qpdf-wasm de npm: no incluye la licencia de qpdf ni los avisos de sus dependencias compiladas.
3. **Mantenimiento de pdf-lib.** El paquete original no publica versiones desde mayo de 2022. El fork @cantoo/pdf-lib (MIT) sigue activo y añade cifrado. Se usa el fork y la elección queda en un ADR en la Fase 0.

Política de licencias: MIT, Apache-2.0, BSD, ISC o CC0, más las excepciones listadas en Cumplimiento legal. Se audita en CI con una comprobación automática y se documenta en `THIRD_PARTY_LICENSES.md`.

## Arquitectura

Puertos y adaptadores, igual que en Vidopix: un núcleo de dominio sin DOM ni librerías PDF, y adaptadores que lo conectan con pdfjs-dist, pdf-lib y el navegador. Todo el trabajo pesado ocurre en Web Workers; el hilo principal solo coordina y pinta.

&#91;embedded content: arquitectura · 4 piezas, 4 dependencias\]

La interfaz usa el núcleo y los workers; los workers usan los adaptadores; los adaptadores implementan los puertos del núcleo. El núcleo no conoce a nadie, y por eso se prueba sin navegador.

```text
vidopdf/
├─ SPEC.md
├─ docs/adr/                 # decisiones de arquitectura numeradas
├─ packages/
│  ├─ core/                  # dominio puro: sin DOM, sin React, sin pdf.js ni pdf-lib
│  │  ├─ workspace/          # Workspace, SourceFile, PageRef, selección
│  │  ├─ history/            # comandos y deshacer/rehacer
│  │  ├─ export/             # ExportPlan: pasos encadenados
│  │  └─ ports/              # PdfRenderer, PdfWriter, Compressor, FileIO
│  └─ pdf-adapters/          # implementaciones de los puertos (pdfjs-dist, pdf-lib, compresión)
├─ apps/web/
│  └─ src/
│     ├─ workers/            # render, export, ocr
│     ├─ ui/                 # componentes React
│     ├─ state/              # estado de interfaz (Zustand)
│     └─ i18n/
└─ tests/fixtures/           # PDFs de prueba con su procedencia documentada
```

**Reglas de dependencia** (se comprueban con dependency-cruiser en CI; una violación rompe el build)

1. `core` no importa nada fuera de sí mismo.
2. `pdf-adapters` solo importa `core` y las librerías PDF.
3. `apps/web` importa `core` y `pdf-adapters`. La interfaz nunca importa pdfjs-dist ni pdf-lib directamente.
4. Renderizado, exportación y OCR se ejecutan solo en workers. Los `ArrayBuffer` se transfieren, no se copian.
5. Cada operación sobre el documento es un comando puro del núcleo, testeable sin navegador.

**Principio central:** los PDFs originales nunca se modifican. El workspace es un plan (referencias a páginas de archivos fuente más transformaciones) y el PDF resultante solo se construye al exportar.

## Modelo de dominio y decisiones técnicas

El workspace guarda referencias a páginas, no copias de PDFs. Esa decisión hace baratos el reordenado, el deshacer y las miniaturas, y deja el trabajo costoso para la exportación.

**Modelo de dominio**

| Entidad | Contenido | Notas |
| --- | --- | --- |
| SourceFile | id, nombre, bytes, número de páginas, huella hash, estado de cifrado | Inmutable; vive en memoria durante la sesión |
| PageRef | id estable, sourceId, índice en el origen, rotación (0, 90, 180, 270), tipo (original o en blanco) | Es lo que ordena la rejilla |
| Workspace | lista ordenada de PageRef, selección, metadatos de salida | Inmutable; cada comando devuelve uno nuevo |
| Command | apply, invert y una etiqueta legible para el historial | Se fusionan comandos consecutivos del mismo tipo, como rotar la misma selección |
| ExportPlan | pasos ordenados: ensamblar, sellar (v2), comprimir, proteger (v2) | Los pipelines de v3 son planes guardados |

**Decisiones técnicas clave**

1. **Miniaturas.** pdf.js renderiza en un worker con OffscreenCanvas a baja resolución. La rotación se aplica con CSS, así que rotar no vuelve a renderizar. Cola con prioridad para lo visible, cancelación al hacer scroll y caché LRU de ImageBitmap que se cierran al expulsarse.
2. **Identidad de página.** Cada PageRef tiene un id estable. La selección y las miniaturas sobreviven a reordenar. Duplicar una página crea un id nuevo que comparte la caché de render.
3. **Historial.** Patrón comando con pilas de deshacer y rehacer, sin límite dentro de la sesión. Las operaciones sobre la lista de páginas son inmutables con estructura compartida.
4. **Exportación.** Se ejecuta en un worker con progreso por página y cancelación con `AbortSignal`. Para guardar se usa `showSaveFilePicker` si existe; si no, una descarga normal con Blob.
5. **Dividir.** Cuatro modos: por rangos, cada N páginas, por marcadores y por tamaño máximo. El de tamaño agrupa páginas de forma voraz y mide el tamaño real de cada resultado. Varios PDFs de salida se entregan en un ZIP generado con fflate (MIT).
6. **Compresión.** Tres presets (pantalla, equilibrado, impresión) que fijan resolución objetivo y calidad JPEG; los valores iniciales se afinan midiendo sobre el corpus de pruebas. En v1 solo se recomprimen imágenes JPEG (DCTDecode) y las Flate en RGB o gris de 8 bits; el resto se deja intacto. Se calcula el resultado real antes de exportar, no una estimación. Si el resultado pesa más que el original, se conserva el original y se avisa.
7. **PDFs cifrados de entrada.** En v1 se detectan y se rechazan con un mensaje claro. En v2 se admiten con contraseña, con @cantoo/pdf-lib. Las restricciones de propietario (impedir imprimir, copiar o modificar) nunca se quitan sin la contraseña de propietario; ver Cumplimiento legal.
8. **Límites conocidos de unir con pdf-lib.** `copyPages` puede perder marcadores, estructura de etiquetado y vínculos de formularios. Cada pérdida se comprueba con tests sobre fixtures concretos y se documenta en el README como limitación, sin ocultarla.
9. **Privacidad.** CSP estricta: `default-src 'self'`, sin orígenes externos, `worker-src 'self' blob:` y `'wasm-unsafe-eval'` solo si hay WASM. Los datos de idioma del OCR se alojan en el propio sitio. Un test E2E recorre un flujo completo y falla si se produce una sola petición a otro origen.
10. **Errores.** Tipos de resultado explícitos en lugar de excepciones que crucen la frontera del worker. Un PDF corrupto o inusual nunca debe dejar la aplicación inutilizable: se informa del archivo problemático y se sigue con los demás.
11. **Límites de memoria.** Aviso suave al superar 250 MB entre todos los archivos cargados. Se mide el uso real en el benchmark de la Fase 2 y se ajusta.

## Diseño de interfaz

Interfaz oscura de herramienta profesional, coherente con Vidopix. Si el repositorio de Vidopix ya define sus tokens, reutilízalos; los valores de abajo son el punto de partida. El centro de la pantalla es siempre la rejilla de páginas; todo lo demás la acompaña.

**Layout**

- **Barra superior:** nombre del proyecto, añadir archivos, deshacer y rehacer, selector de idioma y botón Exportar.
- **Panel izquierdo:** lista de archivos cargados, con su color de identificación, nombre, número de páginas y peso. Cada página de la rejilla lleva una marca discreta del color de su archivo de origen.
- **Centro:** rejilla virtualizada de miniaturas con tamaño ajustable. Admite selección múltiple, arrastrar y soltar (también con teclado) e insertar un hueco al soltar entre páginas.
- **Panel derecho:** contexto de lo seleccionado. Con páginas elegidas ofrece rotar, eliminar, duplicar, extraer y dividir aquí; sin selección muestra las opciones de exportación (compresión, metadatos).
- **Vista previa:** doble clic o barra espaciada abre una página a tamaño grande con navegación por flechas.
- **Estado vacío:** zona grande para soltar archivos, con la frase de privacidad visible desde el primer segundo ("tus archivos no salen de este dispositivo").

**Interacciones clave**

- Selección con clic, Mayús para rangos, Ctrl o Cmd para sumar y rectángulo de selección sobre la rejilla.
- Arrastrar varias páginas a la vez, con una miniatura apilada y un indicador claro del punto de inserción.
- Toda acción destructiva es reversible con deshacer; no hay diálogos de confirmación innecesarios.
- La exportación muestra el peso resultante antes de guardar y permite cancelar con progreso por página.

**Atajos de teclado**

| Acción | Atajo |
| --- | --- |
| Deshacer, rehacer | Ctrl o Cmd + Z, Ctrl o Cmd + Mayús + Z |
| Seleccionar todo | Ctrl o Cmd + A |
| Rotar a la derecha, a la izquierda | R, Mayús + R |
| Eliminar páginas | Supr o Retroceso |
| Duplicar | Ctrl o Cmd + D |
| Vista previa | Barra espaciadora |
| Añadir archivos | Ctrl o Cmd + O |
| Exportar | Ctrl o Cmd + E |
| Mover la selección una posición | Alt + flechas |

**Tokens visuales**

- Fondo base `#0f1115`, superficies `#171a21` y `#1e222b`, bordes `#2a2f3a`.
- Texto principal `#e6e8ee`, secundario `#9aa3b2`.
- Acento único `#5b8cff`; peligro `#ff5d6c`; correcto `#3ecf8e`.
- Tipografía Inter para la interfaz y JetBrains Mono para cifras de peso y páginas, ambas con licencia OFL y alojadas en el propio sitio.
- Esquinas de 8 px, espaciado en pasos de 4 px, movimiento breve y respetando `prefers-reduced-motion`.

**Accesibilidad**

- Todo se puede hacer solo con teclado, incluido reordenar páginas.
- La rejilla usa roles ARIA de lista seleccionable y anuncia los cambios ("página 3 movida a la posición 7").
- Contraste mínimo AA, foco siempre visible y objetivos táctiles de al menos 44 px en tablet.
- Se comprueba con axe-core en los tests E2E.

## Calidad

El listón es que un revisor senior pueda abrir el repositorio y confirmar la calidad con datos, no con adjetivos.

**Estándares de código**

- TypeScript estricto, sin `any` ni `@ts-ignore` (reglas de lint que rompen el build).
- Funciones pequeñas y con una sola responsabilidad; complejidad ciclomática máxima 10 por función, también vigilada por lint.
- Sin dependencias circulares, comprobado con dependency-cruiser.
- Todo comportamiento del núcleo se expresa como función pura o comando.

**Testing**

- **Unitarios (Vitest) sobre el núcleo**, con cobertura mínima del 90 % de líneas en `packages/core`. Con fast-check se prueban propiedades, por ejemplo que aplicar un comando y su inverso devuelve el workspace original y que los rangos de división cubren todas las páginas sin solaparse.
- **Integración con PDFs reales.** El corpus de `tests/fixtures/` mezcla PDFs generados por código (tamaños de página mixtos, rotaciones, cientos de páginas) con unos pocos PDFs pequeños de dominio público o CC0: escaneados, con imágenes, con marcadores, con formularios, con fuentes incrustadas y etiquetados. Cada fixture documenta su procedencia y licencia.
- **Verificación de resultados.** Cada operación se comprueba reabriendo el PDF de salida: número de páginas, texto extraído y comparación de píxeles de las páginas renderizadas con una tolerancia definida. En CI se valida además con `qpdf --check`, usado solo como herramienta de test e independiente del código de producción.
- **Entradas hostiles.** Casos con PDFs truncados, xref dañada, archivo de cero bytes, páginas de tamaño gigantesco y PDFs cifrados. La aplicación debe responder con un error claro y seguir funcionando.
- **E2E con Playwright** en Chromium y WebKit: cargar, reordenar con ratón y con teclado, rotar, unir, dividir, comprimir y exportar. Incluye la comprobación de accesibilidad con axe-core y el test de privacidad (ninguna petición a otro origen).

**Presupuestos de rendimiento**

Los valores son objetivos medidos en un portátil de gama media con una suite de benchmarks versionada en `benchmarks/`. Si un objetivo no es alcanzable, se documenta en un ADR con los datos.

| Escenario | Objetivo |
| --- | --- |
| JS crítico de carga inicial | 150 KB o menos comprimido, sin contar pdf.js ni WASM, que cargan bajo demanda |
| Lighthouse | 100 en las cuatro categorías, como Vidopix; 95 como mínimo aceptable |
| Abrir un PDF de 300 páginas | Primeras miniaturas visibles en menos de 1 s tras leer el archivo |
| Scroll en una rejilla de 1000 páginas | 60 fps y ninguna tarea larga de más de 50 ms en el hilo principal |
| Reordenar, rotar o eliminar páginas | Respuesta visible en menos de 100 ms |
| Unir 20 archivos y 500 páginas | Interfaz sin bloqueos y progreso visible durante toda la exportación |

**Seguridad**

- Los PDFs son entrada no confiable: pdf.js con `isEvalSupported: false`, sin ejecutar JavaScript embebido y con un máximo de píxeles por lienzo para evitar bombas de memoria.
- CSP estricta y cabeceras de seguridad definidas en la configuración del hosting, incluida `Permissions-Policy` sin permisos innecesarios.
- Nombres de archivo saneados al exportar.
- `pnpm audit`, actualizaciones automáticas de dependencias y `pnpm install --frozen-lockfile` en CI.

**CI/CD (GitHub Actions)**

- En cada pull request: lint, typecheck, tests unitarios y de integración, reglas de dependencia, auditoría de licencias, build, E2E y Lighthouse CI.
- Despliegue de preview por rama y despliegue a producción al fusionar en `main`. `main` queda protegida y exige CI en verde.
- Cada fase termina con una etiqueta de versión y un changelog generado desde los commits.

## Plan por fases

Seis fases, cada una con criterios de aceptación medibles. La v1 pública termina en la Fase 3; las Fases 4 y 5 son v2 y v3. Una fase no se da por cerrada hasta que cumple todos sus criterios y se etiqueta su versión.

&#91;embedded content: hoja de ruta · 6 fases, 3 versiones\]

Los rombos marcan las versiones etiquetadas: la v1.0.0 pública al cerrar la Fase 3, la v2 al cerrar la Fase 4 y la v3 al cerrar la Fase 5.

**Fase 0. Fundaciones**

Monorepo pnpm, TypeScript estricto, lint, dependency-cruiser, Vitest, Playwright, CI, CSP, esqueleto de i18n y tokens visuales. Dos spikes: renderizar una página con pdf.js en un worker y unir dos PDFs con pdf-lib.

- La CI ejecuta lint, typecheck, tests, build y reglas de dependencia, y está en verde.
- Existe una URL de preview pública desde el primer commit de la fase.
- Añadir un import prohibido entre capas hace fallar la CI; queda demostrado en un commit de prueba.
- El test E2E de privacidad ya existe y pasa.
- ADRs escritos: estructura del monorepo, pdf-lib frente a @cantoo/pdf-lib y arquitectura de capas.

**Fase 1. Espacio de trabajo y páginas**

Dominio del workspace, comandos e historial. Carga de varios PDFs, rejilla virtualizada de miniaturas, selección, arrastrar y soltar con ratón y teclado, rotar, eliminar, duplicar, insertar páginas en blanco, unir y exportar.

- Se cargan tres PDFs, se reordenan sus páginas y se exporta uno solo que `qpdf --check` valida y cuyo render coincide con el esperado.
- Cobertura de `packages/core` de al menos el 90 %, con tests de propiedades del historial.
- E2E de reordenar con ratón y con teclado, y de deshacer y rehacer de toda la sesión.
- Un PDF de 300 páginas muestra sus primeras miniaturas en menos de 1 s.
- Los PDFs cifrados y corruptos del corpus producen un error claro sin romper la aplicación.
- Las pérdidas de `copyPages` (marcadores, etiquetado, formularios) están comprobadas con fixtures y documentadas.

**Fase 2. Dividir, extraer e imágenes**

Dividir por rangos, cada N páginas, por marcadores y por tamaño máximo; extraer páginas; ZIP de salida. Imágenes a PDF (JPEG y PNG, tamaño de página, orientación y márgenes) y PDF a imágenes (PNG, JPEG o WebP, de 72 a 300 DPI).

- Los cuatro modos de división se prueban con propiedades: ninguna página se pierde ni se repite.
- La división por tamaño máximo respeta el límite en el 100 % de los casos del corpus, o falla con un mensaje explicando por qué una sola página lo supera.
- La suite de benchmarks está en el repositorio y el scroll con 1000 páginas mantiene 60 fps.
- El uso de memoria con 500 páginas queda medido y documentado, y el umbral de aviso se ajusta con esos datos.

**Fase 3. Compresión y lanzamiento de la v1**

Spike de compresión con ADR, presets de pantalla, equilibrado e impresión, resultado real calculado antes de exportar y garantía de que nunca crece el archivo.

- En PDFs del corpus con fotografías, la reducción mediana de peso es de al menos el 40 % en el preset equilibrado, con diferencia visual dentro de la tolerancia definida. Si no se alcanza, un ADR documenta los datos y las alternativas, incluida la AGPL, y Rodrigo decide.
- Ningún caso del corpus devuelve un archivo mayor que el original.
- Lighthouse en 100 en las cuatro categorías (95 como mínimo) y presupuesto de JS inicial cumplido.
- README completo en español e inglés, `THIRD_PARTY_LICENSES.md`, `PRIVACY.md` y etiqueta `v1.0.0`.

**Fase 4. Nivel profesional (v2)**

Numeración de páginas, cabeceras y pies, marcas de agua de texto e imagen, recorte de márgenes, metadatos, editor de marcadores, proteger con contraseña, quitar la protección solo con la contraseña que corresponda, abrir PDFs cifrados, firma visual dibujada o con imagen (no es firma electrónica avanzada ni cualificada) y relleno de formularios.

- Cada función se valida reabriendo el resultado en pdf.js y con `qpdf --check`.
- Un PDF protegido pide contraseña al abrirlo en un visor independiente y no se abre sin ella.
- Un PDF con restricciones de propietario conserva esas restricciones al exportar si no se da su contraseña de propietario, y un test lo comprueba. Cada pieza nueva tiene su ADR con licencia verificada.
- Los tests E2E y axe cubren todas las pantallas nuevas.

**Fase 5. Diferenciadores (v3)**

Pipelines encadenados (recetas guardables y exportables como JSON), procesamiento por lotes con la misma receta, OCR opcional, comparación de dos PDFs y PWA con funcionamiento offline.

- Una receta de unir, rotar, numerar y comprimir se ejecuta en una sola exportación y da el mismo resultado que hacerlo paso a paso.
- El lote de 20 archivos produce un ZIP sin bloquear la interfaz.
- El OCR se carga bajo demanda, sus datos de idioma están alojados en el propio sitio y el test de privacidad sigue pasando.
- Un test E2E carga la aplicación, corta la red y completa un flujo de unir y exportar.
- La comparación muestra diferencias por píxeles y de texto entre dos versiones de un mismo documento.

## Cumplimiento legal y publicación

Publicar Vidopdf es legal si se cumplen los puntos de esta sección; la lista de comprobación del final es criterio de aceptación de la Fase 3 y sin ella no hay v1.0.0. No es asesoramiento jurídico: si algún día se monetiza, conviene revisarlo con un abogado.

**Licencias de lo que se sirve al navegador** (verificadas en el registro de npm el 9 de octubre de 2026)

| Componente | Licencia | Obligación |
| --- | --- | --- |
| pdfjs-dist 6.x | Apache-2.0 | Incluir su LICENSE y los avisos que traiga |
| CMaps de pdf.js (Adobe) | BSD-3-Clause | Reproducir el aviso de copyright |
| WASM de pdf.js: OpenJPEG, JBIG2 de PDFium, qcms | BSD-2, BSD-3, MIT | Reproducir cada aviso (vienen en `wasm/LICENSE_*`) |
| Fuentes estándar Foxit de pdf.js | BSD-3 (PDFium) | Reproducir el aviso |
| Fuentes Liberation de pdf.js | GPL-2.0 con excepción de fuentes (Red Hat) | Única pieza GPL: se sirve sin modificar, como archivo aparte, con su licencia al lado. Se aprueba como excepción en un ADR |
| Perfiles ICC de pdf.js | CC0 | Ninguna |
| @cantoo/pdf-lib y sus dependencias (fflate, culori, node-html-better-parser) | MIT | Reproducir los avisos |
| Inter y JetBrains Mono | OFL-1.1 | Incluir la OFL; si se recortan (subsetting), respetar los nombres reservados que declare cada fuente |
| tesseract.js y datos de idioma (v3) | Apache-2.0 | Incluir licencia y avisos |

Si no se quiere ninguna pieza GPL, la alternativa es no servir las fuentes Liberation y aceptar peor renderizado de los PDFs que no incrustan sus fuentes; el ADR debe elegir con capturas de ambos casos.

Todos esos avisos se generan en el build y se muestran en una página **Licencias** dentro de la propia app, enlazada en el pie. Tenerlos solo en el repositorio no basta, porque lo que se distribuye es el sitio desplegado.

**PDFs protegidos: el punto de mayor riesgo**

Las restricciones de propietario de un PDF (no imprimir, no copiar, no modificar) son medidas tecnológicas de protección, y eludirlas puede vulnerar la Ley de Propiedad Intelectual (arts. 160 a 162 del TRLPI). Reglas obligatorias:

1. Un PDF con contraseña de apertura solo se abre si el usuario la introduce.
2. Las restricciones de propietario solo se quitan si el usuario introduce la contraseña de propietario. Sin ella, la exportación conserva el cifrado y los mismos permisos, o la operación se bloquea con un mensaje claro.
3. En v1, cualquier PDF cifrado, incluidos los que solo tienen restricciones de propietario, se rechaza.
4. Ni la interfaz, ni el README, ni el marketing hablan de "quitar protecciones" o "desbloquear PDFs".

**Firma**

La firma dibujada o con imagen es una firma visual. No es una firma electrónica avanzada ni cualificada según el Reglamento eIDAS. La interfaz la llama "firma visual" y muestra esa aclaración la primera vez que se usa.

**Privacidad y cookies**

- Los documentos nunca salen del dispositivo, pero el hosting sí registra datos técnicos de cada visita, como la IP. La política de privacidad lo dice: qué registra el proveedor, para qué (seguridad y funcionamiento), cuánto tiempo y que es un encargado del tratamiento. Si el proveedor está en EE. UU., indica la base de la transferencia; al redactarla, comprueba en dataprivacyframework.gov si está adherido al Marco de Privacidad de Datos UE-EE. UU.
- Sin analítica, sin servicios de errores externos y sin fuentes ni scripts de terceros. Así no hay cookies que requieran consentimiento.
- `localStorage` solo para preferencias pedidas por el usuario (idioma, tamaño de miniaturas). Ese uso es estrictamente necesario y no necesita banner. Si en el futuro se añade analítica, primero se añade el consentimiento.
- La política indica un correo de contacto para ejercer derechos y se muestra dentro de la app en español e inglés, no solo en el repositorio.

**Aviso legal y términos de uso**

- **Aviso legal:** nombre del titular y correo de contacto. Para una herramienta gratuita sin anuncios ni ingresos es una buena práctica; si algún día genera ingresos, la LSSI obliga a identificar al prestador por completo.
- **Términos de uso** breves: el servicio se ofrece tal cual, el usuario debe tener derecho sobre los documentos que procesa y debe conservar sus originales. La limitación de responsabilidad se redacta "en la medida en que la ley lo permita", porque no puede excluir el dolo ni la negligencia grave.

**Nombre y marcas**

- "PDF" es un estándar abierto (ISO 32000) y se puede usar de forma descriptiva.
- Nada de logos, nombres ni colores de Adobe, Acrobat u otras herramientas. Las comparaciones en el README, solo con datos verificables.
- En una búsqueda web no aparece ningún producto llamado Vidopdf; sí existe Vid2PDF, una extensión que convierte vídeo a PDF. Antes de publicar, busca el nombre en EUIPO (eSearch plus) y en la OEPM.

**Propiedad del código**

- Según el art. 97.4 del TRLPI, el software que un asalariado crea en el ejercicio de sus funciones o siguiendo instrucciones de la empresa pertenece a la empresa. Un proyecto personal hecho fuera del horario, con equipo y cuentas propias y sin relación con el trabajo, normalmente es tuyo. Aun así, revisa tu contrato y el código de conducta por si hay cláusulas sobre proyectos personales.
- Los términos de Anthropic asignan al usuario los derechos sobre lo que genera Claude. La protección por derechos de autor del código generado por IA puede ser limitada, pero eso no impide publicarlo con licencia MIT. La sección de uso de IA del README lo explica.
- Claude Code no copia código de otros proyectos. Si se inspira en uno, comprueba antes que su licencia sea compatible y lo cita.

**Fixtures de prueba**

Solo PDFs generados por código o de dominio público o CC0, con su procedencia anotada. Nunca documentos reales con datos personales. Los PDFs del corpus de pruebas de pdf.js tienen licencias distintas entre sí y no se copian sin revisarlos uno a uno.

**Accesibilidad**

La Directiva Europea de Accesibilidad (2019/882) no obliga a una herramienta personal gratuita, pero el objetivo es WCAG 2.2 AA. El README dice "objetivo" y no "cumple" mientras no haya una auditoría.

**Lista de comprobación antes de publicar**

- [ ] Página Licencias en la app con todos los avisos, incluidas las fuentes y el WASM de pdf.js
- [ ] ADR de la excepción de las fuentes Liberation (o decisión de no servirlas)
- [ ] Páginas de privacidad, aviso legal y términos en la app, enlazadas en el pie, en español e inglés
- [ ] Test E2E sin peticiones a otros orígenes y CSP revisada
- [ ] Ni analítica ni cookies que requieran consentimiento
- [ ] Tests de PDFs cifrados: v1 los rechaza; v2 respeta contraseñas y permisos
- [ ] La firma se presenta como firma visual
- [ ] Procedencia y licencia de cada fixture anotadas
- [ ] Nombre buscado en EUIPO y OEPM
- [ ] Contrato laboral y código de conducta revisados
- [ ] Adhesión del hosting al marco UE-EE. UU. comprobada para la política de privacidad

Fuentes: [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) · [@cantoo/pdf-lib](https://www.npmjs.com/package/@cantoo/pdf-lib) · [pdf-lib](https://www.npmjs.com/package/pdf-lib) · [qpdf-wasm](https://www.npmjs.com/package/@neslinesli93/qpdf-wasm) · [Vid2PDF](https://chromewebstore.google.com/detail/afoapgjmpljofpaephbjdcmbdnnkdfal)

## Documentación y presentación de portafolio

El repositorio es parte del producto: un reclutador debe entender en cinco minutos qué hace Vidopdf, cómo está construido y qué se ha medido.

**README (español e inglés)**

- Qué es, enlace a la demo, un GIF corto del flujo principal y la frase de privacidad.
- Diagrama de arquitectura y enlaces a los ADRs.
- Cómo ejecutarlo, probarlo y desplegarlo, con los comandos exactos.
- **Métricas reales, no aspiracionales:** Lighthouse, cobertura, resultados del benchmark y reducción de peso medida en el corpus de compresión, siempre con fecha y versión.
- **Limitaciones conocidas**, con honestidad: qué se pierde al unir (marcadores, etiquetado, formularios), qué imágenes no se recomprimen y qué PDFs no se admiten.
- **Cómo se hizo con IA:** qué se pidió, qué generó Claude, qué revisó Rodrigo y qué se corrigió por el camino. Esta sección forma parte de la estrategia de portafolio y se actualiza al cerrar cada fase.

**ADRs en `docs/adr/`**

Formato fijo: contexto, decisión, alternativas consideradas y consecuencias, numerados y con fecha. Se esperan como mínimo estos:

1. Estructura del monorepo.
2. pdf-lib frente a @cantoo/pdf-lib.
3. Arquitectura en capas y reglas de dependencia.
4. Estrategia de compresión, con los datos del spike.
5. Política de licencias.
6. Motor de cifrado y de formularios (Fase 4).
7. Estrategia offline y de caché (Fase 5).

**Documentos legales y de privacidad**

- `LICENSE` del proyecto (MIT, salvo que el ADR de compresión obligue a otra licencia).
- `THIRD_PARTY_LICENSES.md` generado y verificado en CI. El build de producción debe incluir los avisos de licencia exigidos por las fuentes OFL (Inter, JetBrains Mono) y por los paquetes MIT e ISC. En Vidopix este punto faltaba y hubo que corregirlo, así que aquí se hace desde la Fase 0.
- `PRIVACY.md` bilingüe, redactado a partir del comportamiento real del código y no de lo que se desea que haga.
- `SECURITY.md` con cómo comunicar una vulnerabilidad.

**Presentación**

- Badges de CI, cobertura y Lighthouse en el README.
- Una página de caso de estudio en vidotho.com que enlace la demo, el repositorio y las decisiones más interesantes, como la comparación de motores de compresión.
- Plantillas de issue y de pull request para dar sensación de proyecto mantenido.
