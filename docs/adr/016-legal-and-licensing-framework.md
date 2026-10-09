# ADR 016: Legal and licensing framework for v2

- Status: Accepted
- Date: 2026-10-09
- Phase: 4

## Context

Phase 4 adds page numbers, headers and footers, watermarks, cropping, metadata, bookmarks, passwords, visual signatures and form filling. Before writing any of it, each feature was checked for legal exposure: licenses of what it needs, regulations that could apply, and claims the interface must not make. The rule for the whole phase: **nothing ships that this register does not cover**, and everything that cannot be settled from the repository is written down as an action for the owner.

This is engineering due diligence, not legal advice. Sources were read on 2026-10-09; the register is [docs/LEGAL.md](../LEGAL.md).

## Decision

**Open-source compliance**

- Everything shipped stays under permissive licenses (MIT, Apache-2.0, BSD, ISC, CC0, OFL for fonts), enforced by `pnpm licenses:check` ([ADR 005](005-license-policy.md)). Nothing GPL or AGPL.
- Every shipped component has its notice reachable from the Licenses page: the npm packages (full texts), every notice file bundled with pdf.js (linked one by one and tested to be served), and a **CycloneDX software bill of materials** at `/sbom.cdx.json`, regenerated and checked in CI by the same tool.
- Any font added to stamp text must be OFL or similar, with its license text in `THIRD_PARTY_LICENSES.md`. The OFL FAQ allows embedding, in full or as a subset, in a document without the document taking the font's license; the spike confirms the embedding-permission flag of the chosen font file.
- The PDF format itself: Adobe's public patent license for ISO 32000-1 covers royalty-free implementations that conform to it. **XFA and Acrobat-specific JavaScript are outside that grant and outside Vidopdf**: XFA forms are reported as unsupported, never half-handled.

**Features that need a rule**

| Feature    | Exposure                                                                                            | Rule                                                                                                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords  | Spanish TRLPI arts. 160 to 162 (technological protection measures); export controls on cryptography | A password is only used if the user types it. Restrictions of the owner are kept unless the owner password is given. Only AES-256 is offered for new files. No cryptography of our own: the algorithms come from the PDF library. The UI never talks about "removing protection" or "unlocking". See the export-control note below. |
| Signature  | eIDAS (Reg. 910/2014)                                                                               | It is a **visual signature**, called that in the UI, with the notice the first time it is used: it is not an advanced or qualified electronic signature. The picture or drawing stays in memory and is never stored or sent.                                                                                                        |
| Watermarks | Others' rights; misuse                                                                              | The user must have the right to the text or picture; the terms say so. There is **no feature to detect or remove watermarks**.                                                                                                                                                                                                      |
| Crop       | Privacy                                                                                             | Cropping hides, it does not delete: the content outside stays inside the file. The dialog says so.                                                                                                                                                                                                                                  |
| Metadata   | Privacy                                                                                             | Strictly a benefit: the user can clear title, author and software fields. Nothing is added about the user.                                                                                                                                                                                                                          |
| Forms      | None beyond XFA                                                                                     | Values stay on the device. Flattening is optional.                                                                                                                                                                                                                                                                                  |
| Data       | GDPR                                                                                                | Nothing new leaves the device, so the privacy policy changes only to name the new features (documents, signatures and passwords stay in memory of the tab; there is no way to recover a lost password, and none is stored).                                                                                                         |

**Export controls on cryptography (the one open point)**

Passwords use AES from the existing PDF library, which is public open-source software. Under the US EAR, publicly available encryption source code is not subject to the EAR once the notification described in section 742.15(b) has been sent, if that notification applies to it at all (the official page read does not say whether standard algorithms such as AES need it). Under the EU dual-use regulation (2021/821), the general software note does not release category 5 part 2 software merely for being public, and the exclusions for items whose cryptography only supports another primary function need a case-by-case reading. Both are routinely satisfied by general-purpose software that merely uses standard encryption, but this ADR **cannot settle it**. Decision: design conservatively (standard AES-256 only, nothing of ours), publish the source (done), and record two actions for the owner in the register: send the notification e-mail BIS describes, which costs nothing, and ask a lawyer to confirm the EU position before the version that adds passwords is tagged.

**Accessibility law**

The European Accessibility Act (Directive 2019/882, in Spain Ley 11/2023) does not reach a free, non-commercial tool, and services by microenterprises are exempt. WCAG 2.2 AA stays the target, checked with axe in every new screen and in all three browsers.

## Alternatives rejected

- **Shipping without the register**, checking later: the cost of a wrong claim (for example about signatures) falls on the owner; the register costs hours.
- **Dropping passwords** to avoid the export-control question: SPEC lists them as v2 and they are what many users expect; the risk is manageable with the actions above.
- **A signature library** for drawing: a few dozen lines on a canvas, with no new dependency to license.
- **A second font bundle** just for stamping: reuse what the spike shows is smallest and OFL.

## Consequences

- Each Phase 4 block updates `docs/LEGAL.md`, the in-app legal texts (es/en) and `PRIVACY.md` in the same pull request as the feature.
- The v2.0.0 tag waits for the owner actions marked "before tagging" in the register.
