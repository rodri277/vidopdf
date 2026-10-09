# Vidopdf

[Read in English](README.md)

Un espacio de trabajo para PDFs que funciona al 100 % en tu navegador. Carga uno o varios PDFs, mira cada página como miniatura y únelos, divídelos, reordénalos, rótalos, comprímelos y protégelos. **Tus archivos no salen de tu dispositivo**: sin backend, sin analítica y sin peticiones a terceros, garantizado por una política CSP estricta y un test de extremo a extremo.

> **Estado: Fase 1 terminada (v0.2.0).** Carga varios PDFs, mira cada página como miniatura, selecciónalas, arrástralas o muévelas con el teclado a un nuevo orden, rótalas, duplícalas, elimínalas, inserta páginas en blanco, ábrelas en vista previa, deshaz y rehaz sin límite y exporta un PDF. Dividir, comprimir, imágenes y lo demás llegan fase a fase; consulta [SPEC.md](SPEC.md).

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

2026-10-09, versión 0.2.0, portátil con Apple silicon, navegadores sin interfaz.

| Métrica                                                     | Valor                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Primeras miniaturas de un PDF de 300 páginas                | de 200 a 340 ms en Chromium, de 330 a 900 ms en WebKit (objetivo 1 s)                                                |
| JavaScript inicial                                          | 111,7 kB gzip (presupuesto 150 kB)                                                                                   |
| Cobertura de `packages/core`                                | 100 % de líneas, umbral 90 %                                                                                         |
| Tests                                                       | 65 del núcleo, 32 de adaptadores, 57 de la web, 9 de reglas de arquitectura, 32 E2E en Chromium y otros 32 en WebKit |
| Lighthouse, memoria con 500 páginas, scroll de 1000 páginas | sin medir todavía (Fases 2 y 3)                                                                                      |

## Limitaciones conocidas

- Los PDFs cifrados, incluidos los que solo tienen restricciones de propietario, se rechazan en esta versión.
- **Unir usa `copyPages` de pdf-lib, que pierde parte de la estructura** (fijado por `merge-limits.test.ts`):
  - se pierden los marcadores (el índice del documento);
  - los campos de formulario dejan de ser rellenables: los widgets se ven, pero la definición del formulario desaparece;
  - se pierde el etiquetado (`/MarkInfo`, `/StructTreeRoot`) y el idioma del documento, así que el resultado es menos accesible para lectores de pantalla.
- Los enlaces externos y la capa de texto se conservan, y las imágenes se copian byte a byte (en esta versión no se recomprimen).

## Cómo se hizo con IA

Vidopdf se construye con Claude Code a partir de una especificación escrita ([SPEC.md](SPEC.md)). Claude Code escribe código, tests y ADRs fase a fase; Rodrigo revisa cada plan antes de empezar y el resultado al terminar. Esta sección recoge qué se pidió, qué se generó, qué se revisó y qué se corrigió, y se actualiza al cerrar cada fase.

**Fase 0.** Claude Code montó el monorepo, las reglas de capas con sus tests de prueba, la CI, la CSP estricta y los dos spikes (pdf.js en un worker y unir con pdf-lib). Correcciones por el camino, descubiertas ejecutando y no suponiendo: pdf.js 6 ya no tiene `isEvalSupported`; pdf.js lee `document` en sitios que fallan dentro de un worker (ADR 009); un `<select>` nativo hace que WebKit escriba un aviso CSP falso, así que el selector de idioma es un grupo de botones.

**Fase 1.** Claude Code propuso el plan en seis bloques y Rodrigo lo aprobó, delegando las decisiones abiertas («lo que sea mejor para el usuario y para el desarrollo»). Cada bloque fue un pull request que tenía que pasar la CI antes de fusionarse. Decisiones que tomó Claude por su cuenta, para que se puedan revisar: el workspace como referencias a páginas inmutables editadas con comandos ([ADR 010](docs/adr/010-workspace-as-a-plan-of-commands.md)); un planificador puro para renderizar miniaturas ([ADR 011](docs/adr/011-thumbnail-pipeline.md)); virtualizar la rejilla con aritmética en vez de `@tanstack/react-virtual`, y reordenar con teclado con Alt + flechas en vez del sensor de teclado de dnd-kit ([ADR 012](docs/adr/012-grid-virtualization-and-reordering.md)). Descubierto ejecutando y no pensando: los avisos de progreso de pdf.js pueden llegar después del resultado (una carrera que dejaba la exportación colgada), el primer borrador de las reglas de capas no veía los nombres de paquetes del workspace, y una tolerancia del 0,1 % de píxeles era demasiado laxa para notar un cambio de texto, así que ahora es del 0,01 %. Lo que _no_ se hizo: las muestras reales de dominio público que menciona la SPEC; las fixtures generadas por código las sustituyen.

## Licencia

MIT. Avisos de terceros: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
