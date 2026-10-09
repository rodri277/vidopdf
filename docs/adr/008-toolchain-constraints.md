# ADR 008: Toolchain version constraints

- Status: Accepted
- Date: 2026-10-09
- Phase: 0

## Context

SPEC asks for current stable versions. On 2026-10-09 two of them clash with the rest of the toolchain (same findings as Vidopix ADR 008):

- `typescript` 7.0.x is outside the peer range of `typescript-eslint` 8.71 (`<6.1.0`), which the strict type-checked lint setup needs.
- `eslint` 10.x is outside the peer range of `eslint-plugin-jsx-a11y` 6.10.
- `dependency-cruiser` runs on Node 22, 24 and 26 only; the machine's default Node 25 is refused.

## Decision

Pin `typescript` to 6.0.3 and `eslint` / `@eslint/js` to 9.39.5, so `pnpm peers check` is clean. Pin Node 24.21.0 in `.nvmrc` (CI reads it) and require `>=24.21.0` in `engines`. Everything else follows the latest stable release. Dependabot ignores the major bumps of the held packages.

## Consequences

- No peer-dependency warnings are ignored.
- Revisit when `typescript-eslint` and `eslint-plugin-jsx-a11y` support TypeScript 7 and ESLint 10; bump both together.
- Locally, run commands under Node 24 (`fnm use`).
