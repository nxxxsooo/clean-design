## Purpose

Defines encrypted local custody of provider credentials so the renderer and persistent daemon state never receive reusable plaintext secrets.

## ADDED Requirements

### Requirement: Provider secrets are encrypted at rest
Clean Design SHALL persist chat-provider, media-provider, and secret CLI-override credentials only in an Electron-protected encrypted vault file readable and writable by the current user alone.

#### Scenario: Credential is saved
- **WHEN** the user saves or updates a provider secret
- **THEN** the persisted file has mode `0600` and neither renderer storage nor daemon persistence contains the plaintext value

### Requirement: Renderer uses credential references
The renderer SHALL receive only a stable credential reference, provider metadata, and a non-reversible mask; it MUST NOT receive a stored plaintext credential after submission.

#### Scenario: Settings are reopened
- **WHEN** the renderer reloads provider settings after a credential was saved
- **THEN** it displays configured state and a mask without receiving the credential value

### Requirement: Daemon secrets are ephemeral
The authenticated desktop boundary SHALL decrypt credentials only to register them for an authorized operation, and the daemon SHALL keep plaintext only in memory for the required lifetime.

#### Scenario: Credential registration is unauthorized
- **WHEN** a renderer or unauthenticated local client attempts to register or retrieve a credential directly
- **THEN** the request is rejected without revealing whether the secret exists or returning any plaintext

### Requirement: Vault failures fail closed
Clean Design MUST refuse to persist or use a credential when protected storage is unavailable, the vault cannot be decrypted, vault permissions are unsafe, or a credential reference is invalid.

#### Scenario: Protected storage is unavailable
- **WHEN** the operating system does not provide protected storage
- **THEN** the settings UI reports that secure credential storage is unavailable and no plaintext fallback is written

