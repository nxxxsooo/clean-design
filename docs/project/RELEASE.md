# Clean Design Release Gate

The repository remains private until every v0.1.0 item below is complete. A
failed or unverified item blocks both public visibility and the release tag.

## Build and behavior

- [x] Repository guard, full typecheck, and affected package tests pass under
      Node 24 and pinned pnpm.
- [x] Apple Silicon package builds, installs, launches, restarts, quits, and
      uninstalls without leaving owned processes or runtime files.
- [x] Clean Design coexists with an Open Design installation and never reads or
      writes its application data, IPC paths, bundle, or installation files.
- [x] Every retained artifact family passes a mocked generation/preview/export
      flow, plus one representative real generation through either a retained
      local CLI or a configured BYOK provider.
- [x] A real immutable handoff packet is inspected and its prompt is pasted into
      a coding agent for an implementation attempt.

## Privacy and security

- [x] Git history and tracked content contain no secrets, credentials, internal
      hosts, personal paths, owner mappings, or private operational references.
- [x] Credentials are encrypted with protected storage, renderer storage has no
      plaintext secret, vault mode is `0600`, and failure paths fail closed.
- [x] Local-only startup, editing, preview, and handoff tests observe zero
      outbound requests.
- [x] Provider traffic reaches only the explicitly selected provider or resource.
- [x] Handoff traversal, secret detection, size limits, atomicity, collisions,
      and unsafe-root rejection pass focused tests.

## Licensing and identity

- [x] `LICENSE`, `NOTICE`, and `UPSTREAM.md` accurately describe every retained
      third-party work and required attribution.
- [x] Upstream trade names, logos, domains, social links, donation/affiliate
      links, promotions, update feeds, and hosted-service endpoints are absent
      from installed/runtime surfaces.
- [x] Bundled named-brand catalogs and media have been reviewed for public
      redistribution, attribution, and trademark risk.
- [x] Public documentation clearly states that Clean Design is independent and
      does not imply upstream endorsement.

## Publication

- [x] The final commit is pushed to the private `nxxxsooo/clean-design` remote.
- [x] A clean checkout reproduces the accepted build and tests.
- [x] Repository visibility is changed to public only after this checklist is
      complete.
- [x] Tag `v0.1.0` is created and pushed only from the audited public commit.
