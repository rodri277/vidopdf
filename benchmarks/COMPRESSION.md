# Compression spike

Measured by `pnpm --filter @vidopdf/benchmarks measure:compression` on synthetic photographs (see `src/compression/corpus.ts`); real photographs may compress differently. "Error" is the mean absolute difference per colour channel (0 to 255) between renders of the original and of the compressed file at about 100 dpi, worst of the first three pages; "pixels over 24" is the share of pixels that differ by more than 24 levels in some channel.

## Corpus

- **photos-full-page-300dpi** (photographic): Four pages, each one A4 photograph of 2480 x 3508 pixels (300 dpi), JPEG quality 92
- **report-with-photos** (photographic): Four pages of text with two photographs each, drawn at 300 and 600 dpi
- **photos-lossless** (photographic): Three pages, each with a 1600 x 1100 photograph stored without loss (PNG, Flate), drawn at 250 dpi
- **phone-album** (photographic): Six pages, each with a 3000 x 2250 phone-style photograph (JPEG 90) drawn 6.5 inches wide (460 dpi)
- **huge-picture-small-place** (photographic): One 4000 x 3000 photograph (JPEG 90) drawn 3 inches wide (1333 dpi)
- **scanned-document**: Four scanned text pages, 2480 x 3508 pixels (300 dpi), JPEG quality 80
- **already-optimised**: Two pages with a 900 x 600 photograph at JPEG quality 55 drawn 6 inches wide (150 dpi): nothing to gain
- **diagram**: One 1600 x 1200 diagram of flat colours stored without loss, drawn at 300 dpi: JPEG would blur it
- **text-only**: Thirty pages of text and no pictures at all

## Median saving on the photographic cases

| Strategy                            | screen | balanced | print  |
| ----------------------------------- | ------ | -------- | ------ |
| quality only (no resizing)          | 82 %   | 66.8 %   | 25.2 % |
| resize and quality, plain structure | 98.8 % | 96 %     | 86.3 % |
| resize and quality, object streams  | 98.8 % | 96 %     | 86.3 % |

## Every case

| Case                     | Strategy                            | Preset   | Before  | After   | Saved  | Error | Pixels over 24 | Time   | Pictures recompressed |
| ------------------------ | ----------------------------------- | -------- | ------- | ------- | ------ | ----- | -------------- | ------ | --------------------- |
| photos-full-page-300dpi  | quality only (no resizing)          | screen   | 8483 KB | 1333 KB | 84.3 % | 1.73  | 0.02 %         | 587 ms | 4/4                   |
| photos-full-page-300dpi  | quality only (no resizing)          | balanced | 8483 KB | 2458 KB | 71 %   | 1.39  | 0.01 %         | 607 ms | 4/4                   |
| photos-full-page-300dpi  | quality only (no resizing)          | print    | 8483 KB | 4120 KB | 51.4 % | 1.07  | 0 %            | 627 ms | 4/4                   |
| photos-full-page-300dpi  | resize and quality, plain structure | screen   | 8483 KB | 163 KB  | 98.1 % | 2.81  | 0.66 %         | 178 ms | 4/4                   |
| photos-full-page-300dpi  | resize and quality, plain structure | balanced | 8483 KB | 524 KB  | 93.8 % | 2.09  | 0.09 %         | 249 ms | 4/4                   |
| photos-full-page-300dpi  | resize and quality, plain structure | print    | 8483 KB | 2146 KB | 74.7 % | 1.62  | 0.13 %         | 403 ms | 4/4                   |
| photos-full-page-300dpi  | resize and quality, object streams  | screen   | 8483 KB | 163 KB  | 98.1 % | 2.81  | 0.66 %         | 182 ms | 4/4                   |
| photos-full-page-300dpi  | resize and quality, object streams  | balanced | 8483 KB | 524 KB  | 93.8 % | 2.09  | 0.09 %         | 247 ms | 4/4                   |
| photos-full-page-300dpi  | resize and quality, object streams  | print    | 8483 KB | 2145 KB | 74.7 % | 1.62  | 0.13 %         | 407 ms | 4/4                   |
| report-with-photos       | quality only (no resizing)          | screen   | 2778 KB | 567 KB  | 79.6 % | 0.47  | 0 %            | 218 ms | 8/8                   |
| report-with-photos       | quality only (no resizing)          | balanced | 2778 KB | 991 KB  | 64.3 % | 0.38  | 0 %            | 228 ms | 8/8                   |
| report-with-photos       | quality only (no resizing)          | print    | 2778 KB | 2106 KB | 24.2 % | 0.25  | 0 %            | 244 ms | 8/8                   |
| report-with-photos       | resize and quality, plain structure | screen   | 2778 KB | 68 KB   | 97.5 % | 0.85  | 0.19 %         | 66 ms  | 8/8                   |
| report-with-photos       | resize and quality, plain structure | balanced | 2778 KB | 186 KB  | 93.3 % | 0.59  | 0.01 %         | 87 ms  | 8/8                   |
| report-with-photos       | resize and quality, plain structure | print    | 2778 KB | 688 KB  | 75.2 % | 0.46  | 0.03 %         | 129 ms | 8/8                   |
| report-with-photos       | resize and quality, object streams  | screen   | 2778 KB | 68 KB   | 97.6 % | 0.85  | 0.19 %         | 65 ms  | 8/8                   |
| report-with-photos       | resize and quality, object streams  | balanced | 2778 KB | 185 KB  | 93.3 % | 0.59  | 0.01 %         | 86 ms  | 8/8                   |
| report-with-photos       | resize and quality, object streams  | print    | 2778 KB | 687 KB  | 75.3 % | 0.46  | 0.03 %         | 127 ms | 8/8                   |
| photos-lossless          | quality only (no resizing)          | screen   | 9164 KB | 239 KB  | 97.4 % | 0.51  | 0 %            | 188 ms | 3/3                   |
| photos-lossless          | quality only (no resizing)          | balanced | 9164 KB | 406 KB  | 95.6 % | 0.43  | 0 %            | 186 ms | 3/3                   |
| photos-lossless          | quality only (no resizing)          | print    | 9164 KB | 718 KB  | 92.2 % | 0.33  | 0 %            | 192 ms | 3/3                   |
| photos-lossless          | resize and quality, plain structure | screen   | 9164 KB | 44 KB   | 99.5 % | 0.81  | 0.14 %         | 125 ms | 3/3                   |
| photos-lossless          | resize and quality, plain structure | balanced | 9164 KB | 144 KB  | 98.4 % | 0.65  | 0.07 %         | 141 ms | 3/3                   |
| photos-lossless          | resize and quality, plain structure | print    | 9164 KB | 522 KB  | 94.3 % | 0.44  | 0.01 %         | 175 ms | 3/3                   |
| photos-lossless          | resize and quality, object streams  | screen   | 9164 KB | 44 KB   | 99.5 % | 0.81  | 0.14 %         | 124 ms | 3/3                   |
| photos-lossless          | resize and quality, object streams  | balanced | 9164 KB | 144 KB  | 98.4 % | 0.65  | 0.07 %         | 140 ms | 3/3                   |
| photos-lossless          | resize and quality, object streams  | print    | 9164 KB | 522 KB  | 94.3 % | 0.44  | 0.01 %         | 174 ms | 3/3                   |
| phone-album              | quality only (no resizing)          | screen   | 8500 KB | 1578 KB | 81.4 % | 0.4   | 0 %            | 685 ms | 6/6                   |
| phone-album              | quality only (no resizing)          | balanced | 8500 KB | 2852 KB | 66.4 % | 0.3   | 0 %            | 704 ms | 6/6                   |
| phone-album              | quality only (no resizing)          | print    | 8500 KB | 6380 KB | 24.9 % | 0.18  | 0 %            | 762 ms | 6/6                   |
| phone-album              | resize and quality, plain structure | screen   | 8500 KB | 102 KB  | 98.8 % | 0.93  | 0.23 %         | 175 ms | 6/6                   |
| phone-album              | resize and quality, plain structure | balanced | 8500 KB | 337 KB  | 96 %   | 0.78  | 0.09 %         | 210 ms | 6/6                   |
| phone-album              | resize and quality, plain structure | print    | 8500 KB | 1163 KB | 86.3 % | 0.52  | 0.08 %         | 284 ms | 6/6                   |
| phone-album              | resize and quality, object streams  | screen   | 8500 KB | 102 KB  | 98.8 % | 0.93  | 0.23 %         | 173 ms | 6/6                   |
| phone-album              | resize and quality, object streams  | balanced | 8500 KB | 337 KB  | 96 %   | 0.78  | 0.09 %         | 210 ms | 6/6                   |
| phone-album              | resize and quality, object streams  | print    | 8500 KB | 1163 KB | 86.3 % | 0.52  | 0.08 %         | 288 ms | 6/6                   |
| huge-picture-small-place | quality only (no resizing)          | screen   | 2455 KB | 442 KB  | 82 %   | 0.06  | 0 %            | 218 ms | 1/1                   |
| huge-picture-small-place | quality only (no resizing)          | balanced | 2455 KB | 816 KB  | 66.8 % | 0.04  | 0 %            | 210 ms | 1/1                   |
| huge-picture-small-place | quality only (no resizing)          | print    | 2455 KB | 1836 KB | 25.2 % | 0.02  | 0 %            | 222 ms | 1/1                   |
| huge-picture-small-place | resize and quality, plain structure | screen   | 2455 KB | 6 KB    | 99.7 % | 0.23  | 0.06 %         | 45 ms  | 1/1                   |
| huge-picture-small-place | resize and quality, plain structure | balanced | 2455 KB | 17 KB   | 99.3 % | 0.2   | 0.04 %         | 50 ms  | 1/1                   |
| huge-picture-small-place | resize and quality, plain structure | print    | 2455 KB | 51 KB   | 97.9 % | 0.14  | 0.04 %         | 51 ms  | 1/1                   |
| huge-picture-small-place | resize and quality, object streams  | screen   | 2455 KB | 6 KB    | 99.7 % | 0.23  | 0.06 %         | 46 ms  | 1/1                   |
| huge-picture-small-place | resize and quality, object streams  | balanced | 2455 KB | 17 KB   | 99.3 % | 0.2   | 0.04 %         | 46 ms  | 1/1                   |
| huge-picture-small-place | resize and quality, object streams  | print    | 2455 KB | 51 KB   | 97.9 % | 0.14  | 0.04 %         | 52 ms  | 1/1                   |
| scanned-document         | quality only (no resizing)          | screen   | 3352 KB | 3352 KB | 0 %    | 0     | 0 %            | 5 ms   | 0/4                   |
| scanned-document         | quality only (no resizing)          | balanced | 3352 KB | 3352 KB | 0 %    | 0     | 0 %            | 4 ms   | 0/4                   |
| scanned-document         | quality only (no resizing)          | print    | 3352 KB | 3352 KB | 0 %    | 0     | 0 %            | 4 ms   | 0/4                   |
| scanned-document         | resize and quality, plain structure | screen   | 3352 KB | 452 KB  | 86.5 % | 5.53  | 6.48 %         | 159 ms | 4/4                   |
| scanned-document         | resize and quality, plain structure | balanced | 3352 KB | 907 KB  | 73 %   | 3.13  | 2.92 %         | 224 ms | 4/4                   |
| scanned-document         | resize and quality, plain structure | print    | 3352 KB | 2331 KB | 30.5 % | 2.97  | 3.08 %         | 388 ms | 4/4                   |
| scanned-document         | resize and quality, object streams  | screen   | 3352 KB | 452 KB  | 86.5 % | 5.53  | 6.48 %         | 162 ms | 4/4                   |
| scanned-document         | resize and quality, object streams  | balanced | 3352 KB | 906 KB  | 73 %   | 3.13  | 2.92 %         | 223 ms | 4/4                   |
| scanned-document         | resize and quality, object streams  | print    | 3352 KB | 2331 KB | 30.5 % | 2.97  | 3.08 %         | 377 ms | 4/4                   |
| already-optimised        | quality only (no resizing)          | screen   | 67 KB   | 67 KB   | 0 %    | 0     | 0 %            | 1 ms   | 0/2                   |
| already-optimised        | quality only (no resizing)          | balanced | 67 KB   | 67 KB   | 0 %    | 0     | 0 %            | 1 ms   | 0/2                   |
| already-optimised        | quality only (no resizing)          | print    | 67 KB   | 67 KB   | 0 %    | 0     | 0 %            | 1 ms   | 0/2                   |
| already-optimised        | resize and quality, plain structure | screen   | 67 KB   | 27 KB   | 59.5 % | 0.74  | 0.09 %         | 12 ms  | 2/2                   |
| already-optimised        | resize and quality, plain structure | balanced | 67 KB   | 67 KB   | 0 %    | 0     | 0 %            | 1 ms   | 0/2                   |
| already-optimised        | resize and quality, plain structure | print    | 67 KB   | 67 KB   | 0 %    | 0     | 0 %            | 1 ms   | 0/2                   |
| already-optimised        | resize and quality, object streams  | screen   | 67 KB   | 27 KB   | 59.9 % | 0.74  | 0.09 %         | 10 ms  | 2/2                   |
| already-optimised        | resize and quality, object streams  | balanced | 67 KB   | 66 KB   | 0.4 %  | 0     | 0 %            | 1 ms   | 0/2                   |
| already-optimised        | resize and quality, object streams  | print    | 67 KB   | 66 KB   | 0.4 %  | 0     | 0 %            | 1 ms   | 0/2                   |
| diagram                  | quality only (no resizing)          | screen   | 12 KB   | 12 KB   | 0 %    | 0     | 0 %            | 14 ms  | 0/1                   |
| diagram                  | quality only (no resizing)          | balanced | 12 KB   | 12 KB   | 0 %    | 0     | 0 %            | 8 ms   | 0/1                   |
| diagram                  | quality only (no resizing)          | print    | 12 KB   | 12 KB   | 0 %    | 0     | 0 %            | 8 ms   | 0/1                   |
| diagram                  | resize and quality, plain structure | screen   | 12 KB   | 12 KB   | 0 %    | 0     | 0 %            | 8 ms   | 0/1                   |
| diagram                  | resize and quality, plain structure | balanced | 12 KB   | 12 KB   | 0 %    | 0     | 0 %            | 8 ms   | 0/1                   |
| diagram                  | resize and quality, plain structure | print    | 12 KB   | 12 KB   | 0 %    | 0     | 0 %            | 8 ms   | 0/1                   |
| diagram                  | resize and quality, object streams  | screen   | 12 KB   | 12 KB   | 1.8 %  | 0     | 0 %            | 9 ms   | 0/1                   |
| diagram                  | resize and quality, object streams  | balanced | 12 KB   | 12 KB   | 1.8 %  | 0     | 0 %            | 9 ms   | 0/1                   |
| diagram                  | resize and quality, object streams  | print    | 12 KB   | 12 KB   | 1.8 %  | 0     | 0 %            | 8 ms   | 0/1                   |
| text-only                | quality only (no resizing)          | screen   | 77 KB   | 77 KB   | 0 %    | 0     | 0 %            | 15 ms  | 0/0                   |
| text-only                | quality only (no resizing)          | balanced | 77 KB   | 77 KB   | 0 %    | 0     | 0 %            | 12 ms  | 0/0                   |
| text-only                | quality only (no resizing)          | print    | 77 KB   | 77 KB   | 0 %    | 0     | 0 %            | 11 ms  | 0/0                   |
| text-only                | resize and quality, plain structure | screen   | 77 KB   | 77 KB   | 0 %    | 0     | 0 %            | 14 ms  | 0/0                   |
| text-only                | resize and quality, plain structure | balanced | 77 KB   | 77 KB   | 0 %    | 0     | 0 %            | 11 ms  | 0/0                   |
| text-only                | resize and quality, plain structure | print    | 77 KB   | 77 KB   | 0 %    | 0     | 0 %            | 13 ms  | 0/0                   |
| text-only                | resize and quality, object streams  | screen   | 77 KB   | 75 KB   | 1.5 %  | 0     | 0 %            | 12 ms  | 0/0                   |
| text-only                | resize and quality, object streams  | balanced | 77 KB   | 75 KB   | 1.5 %  | 0     | 0 %            | 11 ms  | 0/0                   |
| text-only                | resize and quality, object streams  | print    | 77 KB   | 75 KB   | 1.5 %  | 0     | 0 %            | 10 ms  | 0/0                   |
