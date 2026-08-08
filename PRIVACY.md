# Clean Design Privacy

Clean Design is a local-first desktop application. It has no product analytics,
session replay, safety telemetry, crash-reporting relay, hosted account, or
first-party model service.

## Data kept on this Mac

Projects, generated artifacts, preferences, manifests, and handoff packets stay
on the user's Mac in the locations the application or user selects. Provider
credentials are stored in an operating-system-protected encrypted vault. The
renderer receives only credential references and masks; it does not receive a
stored plaintext secret after submission.

Clean Design does not import Open Design application data or plaintext browser
storage. Its application data, IPC endpoints, bundle identity, and installation
paths are independent.

## Network access

Local-only project browsing, editing, previewing, and handoff export make no
outbound network requests. Network access occurs only when the user explicitly:

- invokes a local CLI whose own behavior may use the network;
- starts generation with a selected BYOK provider; or
- requests a remote resource needed for the current design operation.

In those cases, data is sent to the selected third-party tool, provider, or
resource host under that service's terms. Clean Design does not proxy those
requests through a Clean Design service and does not receive a copy.

## Handoff exports

Handoff packets are written only to a directory selected through the native
folder picker. The exporter excludes hidden application state, credentials,
configuration stores, transcripts, and detected secrets. A failed export does
not publish a partial packet.

## Reporting a privacy issue

Report suspected privacy or secret-handling issues through the private GitHub
repository while the project is under development. This document and a public
security contact must be reviewed before the repository can be made public.
