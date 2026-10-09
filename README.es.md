# Vidopdf

[Read in English](README.md)

Un espacio de trabajo para PDFs que funciona al 100 % en tu navegador. Carga uno o varios PDFs, mira cada página como miniatura y únelos, divídelos, reordénalos, rótalos, comprímelos y protégelos. **Tus archivos no salen de tu dispositivo**: sin backend, sin analítica y sin peticiones a terceros, garantizado por una política CSP estricta y un test de extremo a extremo.

> **Estado: Fase 2 terminada (v0.3.0).** Sobre el espacio de trabajo de páginas: dividir un documento de cuatro maneras (por rangos, cada N páginas, por marcadores, por tamaño máximo) en un ZIP, extraer páginas, convertir imágenes JPEG y PNG en páginas, y convertir páginas en imágenes PNG, JPEG o WebP. La compresión, las páginas legales dentro de la app y la publicación llegan en la Fase 3; consulta [SPEC.md](SPEC.md).

## Teclado

| Acción                             | Atajo                                             |
| ---------------------------------- | ------------------------------------------------- |
| Deshacer, rehacer                  | Ctrl o Cmd + Z, Ctrl o Cmd + Mayús + Z            |
| Seleccionar todo                   | Ctrl o Cmd + A                                    |
| Rotar a la derecha, a la izquierda | R, Mayús + R                                      |
| Eliminar páginas                   | Supr o Retroceso                                  |
| Duplicar                           | Ctrl o Cmd + D                                    |
| Vista previa                       | Barra espaciadora o Intro (el doble clic también) |
| Añadir archivos, exportar          | Ctrl o Cmd + O, Ctrl o Cmd + E                    |
| Mover la selección                 | Alt + flechas, Alt + Inicio o Fin                 |
| Moverse, ampliar la selección      | Flechas, Mayús + flechas                          |

## Ejecutarlo

Necesita Node 24 (`fnm use`), pnpm 12 y, para los tests, `qpdf`.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unitarios, de propiedades, PDFs reales y reglas de arquitectura
pnpm e2e          # Playwright: privacidad, accesibilidad, archivos hostiles (Chromium)
pnpm build        # bundle de producción en apps/web/dist
```

## Cómo está construido

Puertos y adaptadores: un `core` sin DOM, adaptadores sobre `pdfjs-dist` y `@cantoo/pdf-lib`, y una app React cuyo trabajo pesado corre en Web Workers. Las reglas de capas rompen el build si se incumplen ([ADR 003](docs/adr/003-layered-architecture.md)). Todas las decisiones están en [docs/adr](docs/adr/README.md).

## Medido hasta ahora

2026-10-09, versión 0.3.0, portátil Apple M4, Chromium sin interfaz (y WebKit para los E2E). Se reproduce con `pnpm bench`; la tabla completa con todos los números está en [benchmarks/RESULTS.md](benchmarks/RESULTS.md).

| Métrica                                                | Presupuesto (SPEC)                    | Medido                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scroll de un documento de 1000 páginas                 | 60 fps, ninguna tarea de más de 50 ms | 60 fps, ningún fotograma de más de 20 ms, ninguna tarea larga (también con el hilo principal 4 veces más lento)                                    |
| Reordenar, rotar o eliminar de 1 a 1000 páginas        | menos de 100 ms                       | unos 31 ms hasta pintar (el trabajo en sí tarda de 0,1 a 1,8 ms)                                                                                   |
| Unir 20 archivos y 500 páginas                         | sin bloqueos, progreso visible        | 1,5 s, de 29 a 33 pasos de progreso, ninguna tarea larga                                                                                           |
| Primeras miniaturas de un documento de 1000 páginas    | 1 s para 300 páginas                  | de 0,3 a 0,4 s                                                                                                                                     |
| Memoria, 500 páginas de texto / 500 escaneadas (97 MB) | medida y documentada                  | 0,5 GB / 1,1 GB, pico de 1,3 GB al exportar ([ADR 015](docs/adr/015-benchmarks-and-memory.md))                                                     |
| Aviso por demasiado PDF cargado                        | ajustado con datos                    | 150 MB (antes 250 MB)                                                                                                                              |
| JavaScript inicial                                     | 150 kB gzip                           | 105,6 kB                                                                                                                                           |
| Cobertura de `packages/core`                           | 90 % de líneas                        | 99,5 %                                                                                                                                             |
| Tests                                                  |                                       | 162 del núcleo, 101 de adaptadores, 136 de la web, 9 reglas de arquitectura, 9 de utilidades de benchmark, 70 E2E en Chromium y otros 70 en WebKit |
| Lighthouse                                             | de 95 a 100                           | sin medir todavía (Fase 3)                                                                                                                         |

## Limitaciones conocidas

- Los PDFs cifrados, incluidos los que solo tienen restricciones de propietario, se rechazan en esta versión.
- **Unir usa `copyPages` de pdf-lib, que pierde parte de la estructura** (fijado por `merge-limits.test.ts`):
  - se pierden los marcadores (el índice del documento);
  - los campos de formulario dejan de ser rellenables: los widgets se ven, pero la definición del formulario desaparece;
  - se pierde el etiquetado (`/MarkInfo`, `/StructTreeRoot`) y el idioma del documento, así que el resultado es menos accesible para lectores de pantalla.
- **Dividir por marcadores** usa los marcadores de los archivos originales, porque unir los pierde; una página que es destino de un marcador abre un archivo nuevo.
- **Dividir por tamaño máximo** construye los PDFs de verdad para medirlos, así que tarda segundos con documentos grandes (5,4 s con 500 páginas); una página que por sí sola supera el límite no se puede dividir y el diálogo la nombra.
- **Imágenes de entrada:** solo JPEG y PNG (WebP y GIF se rechazan). Las orientaciones EXIF con espejo (2, 4, 5, 7) siguen la tabla estándar pero no se han comprobado con archivos de cámara.
- **Imágenes de salida:** WebP depende del navegador (Safari en macOS no puede escribirlo y la opción se apaga con una explicación). Las páginas demasiado grandes para el lienzo se dibujan con menos resolución y se avisa. El ZIP se construye en memoria.
- **Memoria:** unos 6,5 MB de memoria del navegador por cada MB de PDF escaneado; la aplicación avisa a los 150 MB cargados.
- Los enlaces externos y la capa de texto se conservan, y las imágenes se copian byte a byte (en esta versión no se recomprimen).

## Cómo se hizo con IA

Vidopdf se construye con Claude Code a partir de una especificación escrita ([SPEC.md](SPEC.md)). Claude Code escribe código, tests y ADRs fase a fase; Rodrigo revisa cada plan antes de empezar y el resultado al terminar. Esta sección recoge qué se pidió, qué se generó, qué se revisó y qué se corrigió, y se actualiza al cerrar cada fase.

**Fase 0.** Claude Code montó el monorepo, las reglas de capas con sus tests de prueba, la CI, la CSP estricta y los dos spikes (pdf.js en un worker y unir con pdf-lib). Correcciones por el camino, descubiertas ejecutando y no suponiendo: pdf.js 6 ya no tiene `isEvalSupported`; pdf.js lee `document` en sitios que fallan dentro de un worker (ADR 009); un `<select>` nativo hace que WebKit escriba un aviso CSP falso, así que el selector de idioma es un grupo de botones.

**Fase 1.** Claude Code propuso el plan en seis bloques y Rodrigo lo aprobó, delegando las decisiones abiertas («lo que sea mejor para el usuario y para el desarrollo»). Cada bloque fue un pull request que tenía que pasar la CI antes de fusionarse. Decisiones que tomó Claude por su cuenta, para que se puedan revisar: el workspace como referencias a páginas inmutables editadas con comandos ([ADR 010](docs/adr/010-workspace-as-a-plan-of-commands.md)); un planificador puro para renderizar miniaturas ([ADR 011](docs/adr/011-thumbnail-pipeline.md)); virtualizar la rejilla con aritmética en vez de `@tanstack/react-virtual`, y reordenar con teclado con Alt + flechas en vez del sensor de teclado de dnd-kit ([ADR 012](docs/adr/012-grid-virtualization-and-reordering.md)). Descubierto ejecutando y no pensando: los avisos de progreso de pdf.js pueden llegar después del resultado (una carrera que dejaba la exportación colgada), el primer borrador de las reglas de capas no veía los nombres de paquetes del workspace, y una tolerancia del 0,1 % de píxeles era demasiado laxa para notar un cambio de texto, así que ahora es del 0,01 %. Lo que _no_ se hizo: las muestras reales de dominio público que menciona la SPEC; las fixtures generadas por código las sustituyen.

**Fase 2.** El mismo ciclo: plan primero, aprobación y cinco bloques como pull requests (lógica pura en `core`, adaptadores, workers y estado, interfaz, benchmarks), cada uno fusionado solo con la CI en verde. Rodrigo volvió a delegar las decisiones abiertas. Tomadas por Claude y anotadas para revisarlas: dividir trabaja sobre el espacio de trabajo y no sobre los archivos ([ADR 013](docs/adr/013-splitting.md)); las imágenes se convierten en fuentes PDF de una página al importarlas y se dibujan sobre papel blanco, con el giro de la rejilla, al exportarlas ([ADR 014](docs/adr/014-pictures-in-and-out.md)); el aviso de memoria pasó de 250 a 150 MB con las mediciones como motivo ([ADR 015](docs/adr/015-benchmarks-and-memory.md)). **Descubierto midiendo o con un navegador real, no pensando:** los PDFs escaneados no mostraban miniaturas (pdf.js necesitaba un lienzo que no puede crear en un worker; solo lo dispara un escaneo suficientemente grande), exportar 500 páginas escaneadas como imágenes usaba 4,8 GB (ahora 1,4 GB), la carga mantenía copias de más del archivo, y la comprobación de formatos de imagen preguntaba a un lienzo sin contexto, así que todos los formatos parecían no soportados y el panel entraba en bucle. **No hecho o sin verificar:** los PDFs reales de dominio público de la SPEC (las fixtures generadas por código los sustituyen), la memoria en Safari y Firefox, y una medición en un portátil de gama media real (la columna de 4x es solo un sustituto).

## Licencia

MIT. Avisos de terceros: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
