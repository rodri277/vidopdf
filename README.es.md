# Vidopdf

[Read in English](README.md) · **[Demo en vivo](https://vidopdf-web.vercel.app)**

Un espacio de trabajo para PDFs que funciona al 100 % en tu navegador. Carga uno o varios PDFs, mira cada página como miniatura y únelos, divídelos, reordénalos, rótalos, comprímelos y protégelos. **Tus archivos no salen de tu dispositivo**: sin backend, sin analítica y sin peticiones a terceros, garantizado por una política CSP estricta y un test de extremo a extremo.

![Carga de tres PDFs, rotar y borrar páginas, deshacer y por último comprimir y exportar](docs/media/demo.gif)

> **Estado: v1.0.0.** Unir, dividir (de cuatro maneras), reordenar, rotar, eliminar, duplicar y extraer páginas; convertir imágenes JPEG y PNG en páginas y páginas en PNG, JPEG o WebP; **comprimir** las imágenes de dentro de un PDF con tres perfiles y ver el peso real antes de guardar; todo con deshacer y rehacer, atajos de teclado y una interfaz en español e inglés. Privacidad, aviso legal, términos y licencias son páginas dentro de la app. Lo que viene después (contraseña, formularios, firma, uso sin conexión) está en [SPEC.md](SPEC.md).

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
pnpm e2e          # Playwright: privacidad, accesibilidad, archivos hostiles (Chromium; e2e:webkit para WebKit)
pnpm build        # bundle de producción en apps/web/dist
pnpm bench        # benchmarks de rendimiento y memoria (unos 2 minutos)
pnpm lighthouse   # Lighthouse sobre el sitio compilado; falla por debajo de 95
```

## Cómo está construido

Puertos y adaptadores: un `core` sin DOM, adaptadores sobre `pdfjs-dist` y `@cantoo/pdf-lib`, y una app React cuyo trabajo pesado corre en Web Workers. Las reglas de capas rompen el build si se incumplen ([ADR 003](docs/adr/003-layered-architecture.md)). Todas las decisiones están en [docs/adr](docs/adr/README.md).

## Medido

2026-10-10, versión 2.0.0 (candidata), portátil Apple M4, Chromium sin interfaz (y WebKit para los E2E). Se reproduce con `pnpm bench`; la tabla completa con todos los números está en [benchmarks/RESULTS.md](benchmarks/RESULTS.md).

| Métrica                                                    | Presupuesto (SPEC)                    | Medido                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scroll de un documento de 1000 páginas                     | 60 fps, ninguna tarea de más de 50 ms | 60 fps, ningún fotograma de más de 20 ms, ninguna tarea larga (también con el hilo principal 4 veces más lento)                                              |
| Reordenar, rotar o eliminar de 1 a 1000 páginas            | menos de 100 ms                       | unos 31 ms hasta pintar (el trabajo en sí tarda de 0,1 a 1,8 ms)                                                                                             |
| Unir 20 archivos y 500 páginas                             | sin bloqueos, progreso visible        | 1,5 s, de 29 a 33 pasos de progreso, ninguna tarea larga                                                                                                     |
| Primeras miniaturas de un documento de 1000 páginas        | 1 s para 300 páginas                  | de 0,3 a 0,4 s                                                                                                                                               |
| Memoria, 500 páginas de texto / 500 escaneadas (97 MB)     | medida y documentada                  | 0,5 GB / 1,1 GB, pico de 1,3 GB al exportar ([ADR 015](docs/adr/015-benchmarks-and-memory.md))                                                               |
| Aviso por demasiado PDF cargado                            | ajustado con datos                    | 150 MB (antes 250 MB)                                                                                                                                        |
| JavaScript inicial                                         | 150 kB gzip                           | 98,5 kB                                                                                                                                                      |
| Cobertura de `packages/core`                               | 90 % de líneas                        | 99,0 %                                                                                                                                                       |
| Tests                                                      |                                       | 260 del núcleo, 172 de adaptadores, 184 de la web, 9 reglas de arquitectura, 9 de utilidades de benchmark, 133 E2E en cada uno de Chromium, WebKit y Firefox |
| Lighthouse (escritorio, build local)                       | 95 a 100                              | 100 / 100 / 100 / 100 en el espacio de trabajo y en una página legal ([benchmarks/LIGHTHOUSE.md](benchmarks/LIGHTHOUSE.md))                                  |
| Compresión, reducción mediana en PDFs con fotografías      | 40 % en «equilibrado»                 | 96 % (corpus sintético, ver abajo)                                                                                                                           |
| Comprimir 500 páginas escaneadas (165 MB)                  | medido y documentado                  | un 42 % menos en 18 s, pico del renderizador de 1,8 GB                                                                                                       |
| Exportar 500 páginas con números de página y marca de agua | medido y documentado                  | 1,3 s (0,8 s sin ellos)                                                                                                                                      |

## Compresión, medida

El método y todos los números están en el [ADR 004](docs/adr/004-compression-strategy.md) y en [benchmarks/COMPRESSION.md](benchmarks/COMPRESSION.md); se repite con `pnpm --filter @vidopdf/benchmarks measure:compression`. Cada imagen se reduce a la resolución a la que la página la dibuja de verdad (se lee del contenido de la página) y se vuelve a codificar como JPEG si eso ahorra al menos una décima parte. El resultado nunca pesa más que el original.

| Perfil      | Objetivo | Reducción mediana en PDFs con fotografías | Peor cambio visible medido                                           |
| ----------- | -------- | ----------------------------------------- | -------------------------------------------------------------------- |
| Pantalla    | 96 ppp   | 98,8 %                                    | el 6,5 % de los píxeles de un escaneo con ruido difiere en más de 24 |
| Equilibrado | 150 ppp  | 96 %                                      | 2,9 % (el mismo escaneo); menos del 0,1 % en fotografías             |
| Impresión   | 220 ppp  | 86,3 %                                    | 3,1 % (el mismo escaneo); alrededor del 0,1 % en fotografías         |

**Lo que esto no demuestra.** El corpus no tiene fotografías reales: están dibujadas a partir de semillas fijas (degradados, manchas, trazos y ruido), porque no se descargó ningún archivo. Se comportan como fotografías ante el JPEG, pero las reales pueden comprimirse de otra forma. Parte del gran ahorro viene de imágenes dibujadas a entre 300 y 1300 ppp que se bajan a la resolución del perfil; un PDF cuyas imágenes ya están a 150 ppp y son ligeras no gana nada en «equilibrado», y el diálogo lo dice. El texto de las páginas escaneadas se ablanda en «pantalla» y «equilibrado»; «impresión» es la opción para un documento que se leerá de cerca.

## Limitaciones conocidas

- **La compresión** solo toca imágenes JPEG y sin pérdida en RGB o gris de 8 bits, sin máscaras ni máscaras suaves. Deja como están el color CMYK, indexado y calibrado, las imágenes con canal alfa, el dibujo de líneas con pocos colores (el JPEG lo emborronaría), las imágenes diminutas y los JPEG que ya son ligeros. No toca fuentes ni estructura, y las imágenes nuevas son JPEG: la pérdida es permanente en el archivo nuevo (tu original nunca se modifica). El códec de imágenes es el lienzo del navegador, probado en Chromium, WebKit y Firefox.

- **Contraseñas.** Un PDF que necesita contraseña la pide y solo se abre con la correcta; no hay recuperación ni forma de quitar protecciones. Las restricciones que puso el autor de un archivo (no copiar, no imprimir) se mantienen en el resultado y no se pueden cambiar aquí, aunque protejas tú el resultado. Tu protección es AES-256; si olvidas la contraseña no se puede recuperar. Las contraseñas viven en memoria y se descartan al guardar.
- **Sellos y marcas de agua** (números de página, encabezados, pies, marcas de agua) usan la fuente Inter en latín, latín extendido, cirílico, griego y vietnamita. El texto de otros alfabetos (por ejemplo chino, japonés, coreano o árabe) se rechaza indicándolo, en lugar de dibujarse mal.
- **Recortar oculta, no borra:** lo que queda fuera de la página nueva sigue en el archivo. El diálogo lo dice; no lo uses para ocultar información confidencial.
- **La firma visual** es una imagen sobre la página, no una firma electrónica en el sentido de eIDAS; no lleva certificado. La imagen nunca se guarda ni se envía.
- **Formularios:** los campos sobreviven a unir y se pueden rellenar o aplanar. Los formularios XFA no se admiten, y los valores escritos en los campos se limitan a los caracteres de la codificación estándar de fuentes del PDF (WinAnsi).
- **Metadatos:** son lo que escribes; no se añade nada en silencio. Puedes copiar los datos de un archivo cargado como punto de partida.
- **Unir usa `copyPages` de pdf-lib, que pierde parte de la estructura** (fijado por `merge-limits.test.ts`):
  - `copyPages` pierde los marcadores (el índice del documento), así que el escritor los reconstruye a partir de los de los propios archivos;
  - los campos de formulario dejarían de ser rellenables (los widgets se ven, pero la definición del formulario desaparece), así que el escritor reconstruye el formulario a partir de los widgets copiados;
  - se pierde el etiquetado (`/MarkInfo`, `/StructTreeRoot`) y el idioma del documento, así que el resultado es menos accesible para lectores de pantalla.
- **Dividir por marcadores** usa los marcadores de los archivos originales; una página que es destino de un marcador abre un archivo nuevo.
- **Dividir por tamaño máximo** construye los PDFs de verdad para medirlos, así que tarda segundos con documentos grandes (5,4 s con 500 páginas); una página que por sí sola supera el límite no se puede dividir y el diálogo la nombra.
- **Imágenes de entrada:** solo JPEG y PNG (WebP y GIF se rechazan). La página es A4, Carta, del tamaño de la imagen (su lado largo nunca pasa de unos 42 cm) o de un tamaño que escribes en mm, cm o pulgadas, entre 5 mm y 508 cm por lado (el límite del formato PDF). Antes de añadir, el diálogo lista la página y la resolución que tendrá cada imagen, y avisa por debajo de 100 ppp. El tamaño se lee de la cabecera de la imagen, así que una cabecera que el lector no entienda solo se mide al añadirla. Las orientaciones EXIF con espejo (2, 4, 5, 7) siguen la tabla estándar pero no se han comprobado con archivos de cámara.
- **Imágenes de salida:** WebP depende del navegador (Safari en macOS no puede escribirlo y la opción se apaga con una explicación). Las páginas demasiado grandes para el lienzo se dibujan con menos resolución y se avisa. El ZIP se construye en memoria.
- **Memoria:** unos 6,5 MB de memoria del navegador por cada MB de PDF escaneado; la aplicación avisa a los 150 MB cargados.
- Los enlaces externos y la capa de texto se conservan. Los enlaces a otra página del mismo archivo se eliminan, porque dejarían de llevar a ningún sitio al reordenar o quitar páginas; lo que se deja fuera de un resultado (una página, o un botón de un formulario que está en otra página) no viaja dentro del archivo. Las imágenes se copian byte a byte salvo que pidas comprimir. Las de más de 40 megapíxeles nunca se recomprimen, para no agotar la memoria del navegador.
- **Accesibilidad:** es un objetivo (WCAG 2.2 AA), comprobado con axe en cada pantalla y a mano con el teclado, pero no ha habido una auditoría externa, así que no se afirma conformidad.
- **Los textos legales** (privacidad, aviso legal, términos) los ha escrito la persona desarrolladora con Claude Code, no un abogado. El proyecto funciona bajo el alias vidotho; consulta el aviso legal en la app.

## Cómo se hizo con IA

Vidopdf se construye con Claude Code a partir de una especificación escrita ([SPEC.md](SPEC.md)). Claude Code escribe código, tests y ADRs fase a fase; vidotho revisa cada plan antes de empezar y el resultado al terminar. Esta sección recoge qué se pidió, qué se generó, qué se revisó y qué se corrigió, y se actualiza al cerrar cada fase.

**Fase 0.** Claude Code montó el monorepo, las reglas de capas con sus tests de prueba, la CI, la CSP estricta y los dos spikes (pdf.js en un worker y unir con pdf-lib). Correcciones por el camino, descubiertas ejecutando y no suponiendo: pdf.js 6 ya no tiene `isEvalSupported`; pdf.js lee `document` en sitios que fallan dentro de un worker (ADR 009); un `<select>` nativo hace que WebKit escriba un aviso CSP falso, así que el selector de idioma es un grupo de botones.

**Fase 1.** Claude Code propuso el plan en seis bloques y vidotho lo aprobó, delegando las decisiones abiertas («lo que sea mejor para el usuario y para el desarrollo»). Cada bloque fue un pull request que tenía que pasar la CI antes de fusionarse. Decisiones que tomó Claude por su cuenta, para que se puedan revisar: el workspace como referencias a páginas inmutables editadas con comandos ([ADR 010](docs/adr/010-workspace-as-a-plan-of-commands.md)); un planificador puro para renderizar miniaturas ([ADR 011](docs/adr/011-thumbnail-pipeline.md)); virtualizar la rejilla con aritmética en vez de `@tanstack/react-virtual`, y reordenar con teclado con Alt + flechas en vez del sensor de teclado de dnd-kit ([ADR 012](docs/adr/012-grid-virtualization-and-reordering.md)). Descubierto ejecutando y no pensando: los avisos de progreso de pdf.js pueden llegar después del resultado (una carrera que dejaba la exportación colgada), el primer borrador de las reglas de capas no veía los nombres de paquetes del workspace, y una tolerancia del 0,1 % de píxeles era demasiado laxa para notar un cambio de texto, así que ahora es del 0,01 %. Lo que _no_ se hizo: las muestras reales de dominio público que menciona la SPEC; las fixtures generadas por código las sustituyen.

**Fase 2.** El mismo ciclo: plan primero, aprobación y cinco bloques como pull requests (lógica pura en `core`, adaptadores, workers y estado, interfaz, benchmarks), cada uno fusionado solo con la CI en verde. vidotho volvió a delegar las decisiones abiertas. Tomadas por Claude y anotadas para revisarlas: dividir trabaja sobre el espacio de trabajo y no sobre los archivos ([ADR 013](docs/adr/013-splitting.md)); las imágenes se convierten en fuentes PDF de una página al importarlas y se dibujan sobre papel blanco, con el giro de la rejilla, al exportarlas ([ADR 014](docs/adr/014-pictures-in-and-out.md)); el aviso de memoria pasó de 250 a 150 MB con las mediciones como motivo ([ADR 015](docs/adr/015-benchmarks-and-memory.md)). **Descubierto midiendo o con un navegador real, no pensando:** los PDFs escaneados no mostraban miniaturas (pdf.js necesitaba un lienzo que no puede crear en un worker; solo lo dispara un escaneo suficientemente grande), exportar 500 páginas escaneadas como imágenes usaba 4,8 GB (ahora 1,4 GB), la carga mantenía copias de más del archivo, y la comprobación de formatos de imagen preguntaba a un lienzo sin contexto, así que todos los formatos parecían no soportados y el panel entraba en bucle. **No hecho o sin verificar:** los PDFs reales de dominio público de la SPEC (las fixtures generadas por código los sustituyen), la memoria en Safari y Firefox, y una medición en un portátil de gama media real (la columna de 4x es solo un sustituto).

**Fase 3.** El mismo ciclo otra vez (plan, aprobación, bloques como pull requests, CI en verde antes de fusionar). Lo primero fue un spike, porque la SPEC solo admite software AGPL (MuPDF) como alternativa si la vía JavaScript no alcanza el 40 %: lo supera de sobra ([ADR 004](docs/adr/004-compression-strategy.md)), así que nunca hizo falta preguntar. Tomadas por Claude y anotadas para revisarlas: reducir a la resolución a la que se dibuja cada imagen, leída del contenido de la página (no adivinada por su tamaño); no recomprimir lo que podría dañarse (dibujo de líneas, máscaras, color poco común); dejar apagados los flujos de objetos (ahorraban de 0 a 1,5 %). **Descubierto midiendo:** recodificar sin reducir solo ahorra un 25 % en «impresión»; el escaneo de 150 ppp que ya tenían los benchmarks no tiene nada que ganar en «equilibrado» (una primera ejecución dio 0 % hasta que se añadió un escaneo de 200 ppp). **No hecho o sin verificar:** fotografías reales (el corpus es sintético), la revisión de un abogado de las páginas legales y la búsqueda de marca que pide la SPEC en EUIPO y OEPM (la tiene que hacer quien publica).

**Después de la 1.0.0: una auditoría.** Ante la petición de una revisión completa, Claude reprodujo cada problema con un test que fallaba antes de arreglarlo. Encontrado: una llamada a un worker que fallaba dejaba el diálogo de exportar atascado y sin salida; R, Supr y Ctrl+Z cambiaban páginas ocultas detrás de un diálogo o de una página legal; soltar un archivo fuera de la zona de páginas sustituía la app por el visor de PDF del navegador; las imágenes sin pérdida guardadas con predictores PNG se recomprimían a partir de basura (pdf-lib ignora `/DecodeParms`); se perdían los perfiles de color ICC; `/privacy/` con barra final daba 404; y un test de propiedades fallaba al azar. La batería E2E corre ahora también en Firefox y CodeQL revisa cada pull request.

## Privacidad y aspectos legales

[PRIVACY.md](PRIVACY.md) (en inglés y en español) y el [registro legal](docs/LEGAL.md): qué se ha comprobado, con sus fuentes, y qué solo puede cerrar quien publica. Los mismos textos, más el aviso legal, los términos y las licencias, están dentro de la app, enlazados en el pie.

## Licencia

MIT. Avisos de terceros: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md), también visibles en la app.
