# ADR 004: Compression strategy

- Status: Accepted
- Date: 2026-10-09
- Phase: 3

## Context

SPEC asks for three presets (screen, balanced, print), the real size shown before saving, a result that is never larger than the input, and a median reduction of at least 40 % on photographic PDFs at "balanced". If the JavaScript route could not reach that, the fallback was a WebAssembly build of MuPDF, whose AGPL license needs the owner's decision (ADR 005). So the first step was a spike: measure before choosing.

## Spike

`benchmarks/src/compression/spike.measure.ts` (run with `pnpm --filter @vidopdf/benchmarks measure:compression`) compresses a corpus with three strategies and three presets, renders the first three pages before and after, and writes [`benchmarks/COMPRESSION.md`](../../benchmarks/COMPRESSION.md) with every number.

The corpus has nine PDFs and **no real photographs**: they are drawn from fixed seeds (gradients, soft blobs, strokes and sensor-like noise), so they behave like photographs under JPEG, but real ones may compress differently. Five cases are photographic (full-page 300 dpi photographs, a report with photographs at 300 and 600 dpi, lossless Flate photographs, a phone album at 460 dpi, a huge picture drawn small) and four are not (a noisy scan, an already-thin JPEG, a flat-colour diagram, text only).

Median saving on the photographic cases:

| Strategy                                       | screen | balanced | print  |
| ---------------------------------------------- | ------ | -------- | ------ |
| (a) re-encode only, keep the pixels            | 82 %   | 66.8 %   | 25.2 % |
| (b) shrink to the preset's dpi, then re-encode | 98.8 % | 96 %     | 86.3 % |
| (b) with object streams in the saved file      | 98.8 % | 96 %     | 86.3 % |

## Decision

1. **The JavaScript route is enough.** Even the weaker strategy (a) passes the 40 % bar at "balanced", so MuPDF and its AGPL license are **not** needed and the question for the owner does not arise.
2. **Strategy (b)**: each picture is recompressed as a JPEG, first scaled down when the page draws it at more dots per inch than the preset allows. The dpi is not guessed: the content streams of pages and forms are read (own tokenizer with a matrix stack, `compression/content.ts`) to know how large every picture is drawn. A picture whose placement cannot be found is left alone.
3. **Presets**, unchanged after the data (they give clearly separated results and the visual error stays small):

   | Preset   | Target dpi | JPEG quality | Median saving (photographic) |
   | -------- | ---------- | ------------ | ---------------------------- |
   | screen   | 96         | 0.55         | 98.8 %                       |
   | balanced | 150        | 0.72         | 96 %                         |
   | print    | 220        | 0.85         | 86.3 %                       |

4. **What is never touched**: pictures with a soft mask, mask, `Decode` array, image masks or rendering intent; colour spaces other than gray, RGB and ICC with 1 or 3 components; anything not 8 bits per component; tiny pictures (under 4096 pixels); pictures with at most 256 distinct colours (line art, which JPEG would blur: the diagram case); JPEGs already below about 1.2 bits per pixel. A replacement is accepted only if it is at most 90 % of the old stream.
5. **Never larger**: if the saved file is not smaller than the original, the original bytes are returned and the report says nothing was gained (text-only and diagram cases return 0 %).
6. **Object streams are off.** They saved 0 to 1.5 % in the measurements (text-only 1.5 %, diagram 1.8 %) and the files are less compatible with old readers and tools. The option stays in the compressor but the app does not use it.
7. **The codec is injected** (`ImageCodec`): the browser uses `createImageBitmap` and `OffscreenCanvas` in the worker (`compress/browser.ts`); the tests and the spike use `@napi-rs/canvas` (`testing/node-codec.ts`). The compression logic is therefore tested in Node and the browser codec is covered by an end-to-end test.

## Known costs

- **Scanned text suffers most.** On the noisy scan at "balanced", 2.9 % of the pixels differ by more than 24 levels (mean error 3.1 of 255) because 300 dpi is brought to 150. Text stays legible, but "print" (3 %, 30 % saved) is the right choice for a document that will be read closely; the dialog says so.
- **JPEG re-encoding is lossy and one way.** The original is never modified; the compressed file is a new download.
- Sizes of real photographs may differ from these synthetic ones; the spike is repeatable with the same command and the numbers in the README say what was measured on what.

## Alternatives rejected

- **MuPDF in WebAssembly**: more thorough (fonts, structure), but AGPL and a large binary; unnecessary given the data.
- **Re-encoding without resizing** (a): simpler, but at "print" it saves 25 % and at "screen" it leaves 442 KB where resizing leaves 6 KB, and it ignores that the same picture can be drawn at 1300 dpi.
- **Guessing the dpi from the picture's size**: wrong whenever a picture is drawn small or cropped; reading the placement is cheap.
- **WebP or AVIF inside PDFs**: not valid PDF.
