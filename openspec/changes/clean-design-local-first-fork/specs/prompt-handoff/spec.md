## Purpose

Defines a deterministic, immutable, secret-filtered design packet that users can hand to any coding agent as a prompt and folder without direct integration.

## ADDED Requirements

### Requirement: User selects a trusted handoff root
The desktop application SHALL let the user choose an external directory through the native folder picker and store the canonical root as privileged project metadata that generic project create/update APIs cannot set or change.

#### Scenario: Generic API attempts to set the root
- **WHEN** an unprivileged project request includes a handoff root or trusted-root marker
- **THEN** the request is rejected and the stored trusted root remains unchanged

### Requirement: Every export creates an immutable version
Each successful export SHALL atomically create `<root>/<project-slug>/<YYYYMMDD-HHmmss>-<short-id>/`, SHALL NOT overwrite an existing packet, and SHALL add a deterministic collision suffix when necessary.

#### Scenario: Packet name collides
- **WHEN** the intended version directory already exists
- **THEN** Clean Design creates the packet at a suffixed path without modifying the existing directory

### Requirement: Packet contents are deterministic and format-aware
Every packet SHALL contain `HANDOFF.md`, `manifest.json` with schema version `1`, filtered project source and artifact files, `DESIGN.md` when present, and required previews for the project kind. HTML requires desktop and mobile PNGs; decks require PDF and cover PNG with PPTX best-effort; documents require PDF; image, video, and audio require primary media; brand/design-system packets require `DESIGN.md` and a preview.

#### Scenario: Required preview fails
- **WHEN** a required preview or primary artifact cannot be produced
- **THEN** export fails with `render_failed`, publishes no partial packet, and leaves any previous packet unchanged

#### Scenario: Optional preview fails
- **WHEN** an optional representation such as PPTX cannot be produced
- **THEN** export succeeds and records a warning in the manifest and UI

### Requirement: Handoff prompt is implementation-oriented and agent-agnostic
`HANDOFF.md` SHALL direct the receiving agent to inspect its current repository first, preserve existing behavior, security, and data contracts, adapt rather than transplant prototype architecture, implement the approved references, run native tests, and visually compare the recorded viewports. It MUST NOT name or invoke a required coding-agent product.

#### Scenario: Same project state is exported twice
- **WHEN** two exports use identical project inputs and preview results
- **THEN** prompt and manifest semantics are identical apart from packet identity, timestamp, and generated file hashes

### Requirement: Unsafe content and destinations are rejected
The exporter MUST enforce realpath containment, reject symlink escapes, traversal, system directories, credential locations, and Clean Design data roots, apply size limits, and reject secret-like filenames or content. Hidden paths, sidecars, credentials, config stores, transcripts, API keys, and application data MUST be excluded.

#### Scenario: Secret is detected
- **WHEN** a candidate packet file contains a blocked credential filename or high-confidence secret value
- **THEN** export fails with `secret_detected` before the packet is published

### Requirement: Export reports stable failure modes
The API SHALL distinguish `root_required`, `root_unavailable`, `secret_detected`, `render_failed`, and `write_failed`. Clipboard failure SHALL preserve the completed packet and display selectable prompt text.

#### Scenario: Clipboard write fails
- **WHEN** packet creation succeeds but the prompt cannot be copied
- **THEN** the packet remains available and the user can manually select the complete prompt

