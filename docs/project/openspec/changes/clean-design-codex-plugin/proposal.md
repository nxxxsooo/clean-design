## Why

Clean Design owns a complete local visual creation surface, but a user working in Codex cannot reach it. They must leave the agent, open the app, and re-describe intent by hand. Codex plugins solve exactly this, and the repository already ships the underlying project, file, preview, render, and handoff services.

The obstacle is the product contract. Clean Design forbids hosted services, external plugin hosts, and global CLI installation. A plugin that starts a local service therefore needs an explicit, bounded exception rather than a silent reinterpretation of the existing rule.

## What Changes

- Add a repository-owned first-party `clean-design` Codex plugin that bundles eight Skills with a local MCP bridge.
- Allow explicit plugin invocation to start one authenticated, namespace-scoped, temporary headless service from an installed Clean Design application.
- Add challenge-response authentication, bounded client leases, and idle shutdown to the local service boundary.
- Reuse the existing project, file, design-system, skills, preview, render, and handoff services behind an allowlisted MCP profile.
- Share one daemon and one render broker across every local client instead of starting a service per client.
- Keep the plugin's capability surface strictly narrower than the application's own surface.

## Capabilities

### New Capabilities

None. This change constrains and extends an existing capability.

### Modified Capabilities

- `local-studio`: narrow the local-only service boundary to permit exactly one first-party plugin exception, with explicit prohibitions on agent execution, provider execution, credentials, arbitrary shell, arbitrary host paths, project deletion, and overwrite-in-place export.

## Impact

The change affects the sidecar protocol, sidecar runtime primitives, daemon authentication and routes, packaged startup and shutdown ownership, desktop render orchestration, macOS packaging, a new MCP bridge package, plugin and Skill content, and end-to-end tests.

Publication to the universal OpenAI plugin directory is explicitly out of scope. Directory review requires a publicly hosted MCP server and forbids local endpoints, which conflicts with the loopback-only product contract. Local and repository-marketplace distribution are unaffected.
