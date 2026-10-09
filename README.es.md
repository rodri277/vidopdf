# Vidopdf

[Read in English](README.md)

Un espacio de trabajo para PDFs que funciona al 100 % en tu navegador. Carga uno o varios PDFs, mira cada página como miniatura y únelos, divídelos, reordénalos, rótalos, comprímelos y protégelos. **Tus archivos no salen de tu dispositivo**: sin backend, sin analítica y sin peticiones a terceros, garantizado por una política CSP estricta y un test de extremo a extremo.

> **Estado: Fase 0 (fundaciones).** La app carga PDFs, muestra la primera página de cada uno y los une al exportar. La rejilla de páginas, deshacer y rehacer y el resto llegan fase a fase; consulta [SPEC.md](SPEC.md).

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

## Limitaciones conocidas

- Los PDFs cifrados, incluidos los que solo tienen restricciones de propietario, se rechazan en esta versión.
- La Fase 0 solo dibuja la primera página y todavía no permite editar páginas.

## Cómo se hizo con IA

Vidopdf se construye con Claude Code a partir de una especificación escrita ([SPEC.md](SPEC.md)). Claude Code escribe código, tests y ADRs fase a fase; Rodrigo revisa cada plan antes de empezar y el resultado al terminar. Esta sección recoge qué se pidió, qué se generó, qué se revisó y qué se corrigió, y se actualiza al cerrar cada fase.

**Fase 0.** Claude Code montó el monorepo, las reglas de capas con sus tests de prueba, la CI, la CSP estricta y los dos spikes (pdf.js en un worker y unir con pdf-lib). Correcciones por el camino, descubiertas ejecutando y no suponiendo: pdf.js 6 ya no tiene `isEvalSupported`; pdf.js lee `document` en sitios que fallan dentro de un worker (ADR 009); un `<select>` nativo hace que WebKit escriba un aviso CSP falso, así que el selector de idioma es un grupo de botones.

## Licencia

MIT. Avisos de terceros: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
