# Lighthouse

Measured on 2026-10-09 with `pnpm lighthouse`: Lighthouse 13.5.0 desktop preset, headless Chromium from Playwright, the production build served by `vite preview` with the deployed security headers, median of 3 runs per page, on a laptop (CI numbers vary). Floor 95, aim 100.

| Page     | Performance | Accessibility | Best practices | SEO | FCP   | LCP   | TBT  | CLS   |
| -------- | ----------- | ------------- | -------------- | --- | ----- | ----- | ---- | ----- |
| /        | 100         | 100           | 100            | 100 | 0.4 s | 0.4 s | 0 ms | 0.000 |
| /privacy | 100         | 100           | 100            | 100 | 0.5 s | 0.5 s | 0 ms | 0.000 |
