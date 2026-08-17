## 1. Contract and Protocol

- [ ] 1.1 Record the bounded first-party plugin exception in OpenSpec and the root product contract
- [ ] 1.2 Extend the sidecar protocol with service version, limits, roles, handshake messages, and status without changing the five-field stamp
- [ ] 1.3 Add generic owner-only private JSON files and atomic startup locks

## 2. Service Boundary

- [ ] 2.1 Add daemon challenge-response authentication, per-lease session keys, and replay defense
- [ ] 2.2 Add a bounded lease registry with fixed capacity, renewal, release, expiry reclamation, and idle eligibility
- [ ] 2.3 Make packaged daemon startup attach-or-start and make desktop shutdown lease-based
- [ ] 2.4 Add one bounded FIFO render broker and a private argument-gated headless entry

## 3. MCP Surface

- [ ] 3.1 Add a bounded operation scheduler and signed request verification
- [ ] 3.2 Add the allowlisted MCP application profile over existing project, file, design, asset, preview, render, and handoff services
- [ ] 3.3 Register the private operation route with pagination and response caps
- [ ] 3.4 Prove structurally that no agent, provider, credential, or shell dependency reaches the profile

## 4. Bridge and Plugin

- [ ] 4.1 Build the MCP v2 stdio bridge with strict schemas and annotated tools
- [ ] 4.2 Discover and launch only a validated Clean Design application
- [ ] 4.3 Package the private service protocol and headless branch for macOS
- [ ] 4.4 Scaffold the plugin manifest, repository marketplace, launcher bundle, and brand assets
- [ ] 4.5 Write the router Skill and seven focused workflow Skills

## 5. Verification

- [ ] 5.1 Prove the end-to-end business flow from project creation through handoff export
- [ ] 5.2 Prove startup-storm bounds, one daemon, and bounded renderers
- [ ] 5.3 Prove the security invariants fail closed
- [ ] 5.4 Prove Skill and tool routing against positive and negative evaluations
- [ ] 5.5 Document installation and lifecycle, then run the full acceptance pass
