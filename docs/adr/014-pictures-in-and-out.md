# ADR 014: Pictures in and out

- Status: Accepted
- Date: 2026-10-09
- Phase: 2

## Context

SPEC asks for images to PDF (JPEG and PNG; page size, orientation and margins) and PDF to images (PNG, JPEG or WebP, from 72 to 300 dpi). Both must keep working with hostile or large input and tell the user when something could not be done as asked.

## Decision

**Pictures to pages**

- A picture becomes a **one-page PDF source** the moment it is imported, so it is reordered, rotated, extracted and exported like any other page and nothing in the model changes.
- The kind is read from the **bytes**, not the name or MIME type: a PDF called `.jpg` is a PDF; WebP and GIF are turned down with their own message; anything else is ignored with a message. One dialog, once, for all pictures dropped together: paper (fit the picture, A4, Letter), orientation and margins, with a drawn preview of a wide sample picture.
- Layout is pure (`placeImage`): on paper the picture is scaled up or down to the largest size inside the margins, centred and never distorted; "fit" gives the page the picture's size at 96 dpi, shrunk if its long side passes A3's.
- **EXIF orientation** (1 to 8) is honoured with a transformation matrix, verified pixel by pixel for all eight values, so phone photos are not left on their side. PNG transparency is kept.
- Not done: other formats (HEIC, TIFF, SVG), CMYK colour management, and reading the dpi stored in the file.

**Pages to pictures**

- Pages are drawn on white paper at the chosen resolution (a PNG would otherwise keep the transparent canvas and a JPEG would turn it black), with the **rotation the user gave them**, and blank pages are drawn as paper of their size.
- A page too large for the canvas budget (16 megapixels) is drawn at a **lower resolution and the dialog says how many pages were**; it never fails silently.
- A browser that cannot encode a format answers with an error, not another format: the picture panel asks the browser which formats it can write (`canEncodeImage`) and switches off the others with an explanation. Measured: Chromium writes WebP; Safari on macOS does not, while WebKit on Linux does, so the answer comes from the browser itself and not from its name.
- One page is delivered as a plain picture; several as a ZIP written entry by entry, pictures stored (already compressed). Each page is released as soon as it is in the ZIP and pdf.js's caches are trimmed every twenty pages: before that, 500 scanned pages at 150 dpi peaked at 4.8 GB of browser memory, afterwards at 1.4 GB.

## Alternatives considered

- **Convert pictures at export time instead of import time.** Needs a second kind of page in the workspace and in every command.
- **Ask for layout options per picture.** More control, but dropping thirty photos would mean thirty dialogs.
- **Fall back to PNG when WebP is not available.** Silent substitution of the user's choice.

## Consequences

- A ZIP is built in memory, so its size is bounded by the browser's memory; the picture panel warns when pages times resolution is large (see ADR 015 for the numbers).
- Pictures keep working offline and never leave the device, like everything else.
