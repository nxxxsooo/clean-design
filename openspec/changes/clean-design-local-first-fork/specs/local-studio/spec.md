## Purpose

Defines Clean Design as an isolated local-first visual studio that preserves the complete 0.16.1 creation surface without account, cloud-platform, telemetry, update, deployment, or downstream-agent coupling.

## ADDED Requirements

### Requirement: Clean Design has an isolated installed identity
The macOS application SHALL present the name Clean Design, use bundle identifier `fun.mjshao.clean-design`, URI scheme `cleandesign`, IPC root `/tmp/clean-design/ipc`, and a Clean Design application-data root that does not read from or write to Open Design runtime paths.

#### Scenario: Clean Design and Open Design coexist
- **WHEN** both applications are installed or have existing local data
- **THEN** launching, using, and uninstalling Clean Design does not alter Open Design application data, IPC endpoints, or installation files

### Requirement: The complete 0.16.1 creation surface remains available
The product SHALL preserve Home, Studio, system/light/dark themes, projects, previews, canvas editing, assets, `DESIGN.md`, exports, local CLI generation, BYOK generation, catalogs, and the prototype, deck, template, brand, image, video, audio, and other project kinds.

#### Scenario: User creates each supported artifact kind
- **WHEN** a user creates and opens each supported project kind using a valid local CLI or BYOK provider
- **THEN** the project can be generated, previewed, manually refined, and exported through the native product flow

### Requirement: Removed platform services are unavailable
The product MUST NOT expose or invoke accounts, hosted Open Design Cloud, AMR, teams, billing, promotions, news, deployment, auto-update, telemetry, Langfuse, PostHog, external MCP installation, or downstream-agent plugin-host integration.

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

