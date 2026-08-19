## MODIFIED Requirements

### Requirement: Local-only service boundary
The product MUST NOT expose hosted services, external plugin hosting, arbitrary downstream-agent integration, or global CLI installation. The sole plugin exception SHALL be the repository-owned first-party `clean-design` plugin. Explicit invocation MAY start one authenticated, namespace-scoped, temporary headless service from an installed Clean Design application. The MCP profile MUST NOT expose agent or provider execution, credentials, arbitrary shell commands, arbitrary host paths, project deletion, or overwrite-in-place exports.

#### Scenario: Plugin invocation while the desktop is closed
- **WHEN** an installed `clean-design` plugin invokes its bundled MCP server
- **THEN** one compatible temporary headless service starts for the active namespace
- **AND** all clients share the same bounded service and render broker
- **AND** the service exits after its final lease and idle timeout

#### Scenario: Plugin invocation while the desktop is open
- **WHEN** the visible Clean Design application is already running for the same namespace
- **THEN** the plugin attaches to the existing daemon and render broker instead of starting a second service
- **AND** quitting the visible application does not terminate a daemon that still holds a live plugin lease

#### Scenario: Forbidden capability is requested through MCP
- **WHEN** a caller requests agent execution, provider execution, credential access, an arbitrary shell command, an arbitrary host path, project deletion, or an overwrite of an existing export packet
- **THEN** the request fails before reaching any application service
- **AND** no such operation is registered in the MCP profile

### Requirement: Removed platform services are unavailable
The product MUST NOT expose or invoke accounts, hosted cloud services, login or wallet flows, teams, billing, promotions, news, deployment, auto-update, telemetry, external observability services, external MCP installation, or downstream-agent plugin-host integration. Bundling the first-party `clean-design` plugin SHALL NOT reintroduce any of these surfaces, and the plugin SHALL NOT be published to a hosted plugin directory that requires a publicly reachable MCP endpoint.

#### Scenario: Product runs with network denial
- **WHEN** Clean Design starts and the user performs local-only project and editing workflows without selecting an external provider or resource
- **THEN** no outbound network request is attempted and no removed-service control is visible

#### Scenario: Plugin runs with network denial
- **WHEN** the bundled plugin creates, inspects, previews, renders, and exports a local project without selecting an external provider
- **THEN** every call stays on the loopback service boundary and no outbound network request is attempted
