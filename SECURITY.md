# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub's **Security → Report a vulnerability** form on this repository. Do not open a public issue for them. Include the browser, the steps to reproduce and, if possible, a minimal PDF that triggers the problem (without personal data).

You can expect an acknowledgement within a few days. Vidopdf is a personal project maintained without a service-level agreement.

## Scope

Vidopdf runs entirely in the browser: there is no server, account or upload endpoint. The most relevant issues are therefore PDF parsing and rendering problems triggered by a hostile file, weaknesses in the Content Security Policy, and anything that makes a request to another origin.
