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

**Export controls on cryptography**

Passwords use AES from the existing PDF library, which is public open-source software. Decision: design conservatively (standard AES-256 only, nothing of ours) and publish the source.

_Update, 2026-10-10._ This ADR first recorded this as an open point, with two actions for the owner (an e-mail to BIS and a lawyer's check of the EU position), because the official page it had read did not say whether standard algorithms needed the notification. They do not: the rule of 29 March 2021 removed the notification for publicly available source code, and only proprietary or non-standard cryptography is still reported. The EU general software note leaves out software in the public domain or generally available to the public. Both actions are therefore not needed for a free open-source tool; the register explains when to look again.

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
