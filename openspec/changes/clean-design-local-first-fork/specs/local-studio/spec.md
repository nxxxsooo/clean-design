## Purpose

Defines Clean Design as an isolated local-first visual studio that preserves the complete 0.16.1 creation surface without account, cloud-platform, telemetry, update, deployment, or downstream-agent coupling.

## ADDED Requirements

### Requirement: Clean Design has an isolated installed identity
The macOS application SHALL present the name Clean Design, use bundle identifier `fun.mjshao.clean-design`, URI scheme `cleandesign`, IPC root `/tmp/clean-design/ipc`, and a Clean Design application-data root that does not read from or write to Open Design runtime paths.

#### Scenario: Clean Design and Open Design coexist
- **WHEN** both applications are installed or have existing local data
- **THEN** launching, using, and uninstalling Clean Design does not alter Open Design application data, IPC endpoints, or installation files

### Requirement: The complete 0.16.1 creation surface remains available
The product SHALL preserve Home, Studio, system/light/dark themes, projects, previews, canvas editing, assets, `DESIGN.md`, exports, allowlisted local CLI generation, BYOK generation, catalogs, and the prototype, deck, template, brand, image, video, audio, and other project kinds.

#### Scenario: User creates each supported artifact kind
- **WHEN** a user creates and opens each supported project kind using a valid local CLI or BYOK provider
- **THEN** the project can be generated, previewed, manually refined, and exported through the native product flow

### Requirement: Local coding CLIs are allowlisted
The product SHALL expose and execute only Codex, Claude Code, Antigravity (`agy`), OpenCode, and Pi as local coding CLIs. The internal `byok-opencode` adapter SHALL remain available only to the BYOK provider flow. Local profiles SHALL inherit only one of the five allowlisted CLI definitions. All other inherited coding-agent adapters and unused transports MUST be absent from active source, configuration, UI, documentation, fixtures, and tests.

#### Scenario: Runtime discovery completes
- **WHEN** Clean Design discovers installed coding-agent runtimes and loads valid local profiles
- **THEN** every returned local CLI is one of the five allowlisted runtimes or a profile derived from one of them, and removed runtime IDs cannot be selected or executed

### Requirement: Removed platform services are unavailable
The product MUST NOT expose or invoke accounts, hosted cloud services, login or wallet flows, teams, billing, promotions, news, deployment, auto-update, telemetry, external observability services, external MCP installation, or downstream-agent plugin-host integration.

#### Scenario: Product runs with network denial
- **WHEN** Clean Design starts and the user performs local-only project and editing workflows without selecting an external provider or resource
- **THEN** no outbound network request is attempted and no removed-service control is visible

### Requirement: Outbound traffic requires explicit user intent
The product SHALL limit outbound traffic to the provider selected for the current operation, behavior of a local CLI explicitly invoked by the user, or a resource URL the user explicitly requested.

#### Scenario: BYOK provider is selected
- **WHEN** the user starts generation with a configured BYOK provider
- **THEN** Clean Design contacts only that provider and resources explicitly required by the user's request

### Requirement: Desktop owns the local lifecycle
The Apple Silicon macOS application SHALL bind local services to loopback, start required sidecars during a normal launch, terminate owned sidecars on quit, and SHALL NOT silently bootstrap headlessly or install a global `od` executable.

#### Scenario: Application quits
- **WHEN** the user quits Clean Design
- **THEN** no Clean Design-owned daemon, web, desktop, or helper process remains running

### Requirement: Model selectors reflect the supported native runtimes
Clean Design SHALL obtain model choices from the owning supported CLI when discovery is available, preserve a usable Default choice when it is not, and MUST NOT expose explicitly retired model choices or mutate another CLI's settings file as a selection side effect.

#### Scenario: Model picker opens
- **WHEN** a user opens the model picker for one of the five supported local CLIs
- **THEN** the picker shows the current discovered or approved fallback choices for that runtime and preserves custom native routing where supported

### Requirement: The public release is direct and verifiable
The public launch SHALL provide bilingual product guidance, direct Apple Silicon downloads, SHA-256 checksums, Gatekeeper guidance, English and Chinese repository documentation, and a real product screenshot without changing the packaged startup or in-app Home experience.

#### Scenario: Visitor opens the launch page
- **WHEN** an AI creator visits the Clean Design launch page on desktop or mobile
- **THEN** the initial viewport presents centered full-width product value and download actions above a legible real product view, before the remaining local-first workflow and privacy evidence

#### Scenario: User downloads version 0.1.0
- **WHEN** the user follows a release download link
- **THEN** the linked DMG or ZIP and published SHA-256 checksum belong to the verified `v0.1.0` release
