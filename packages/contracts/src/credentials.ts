export const CREDENTIAL_REFERENCE_PREFIX = 'credential://';

export type CredentialKind = 'chat-provider' | 'media-provider' | 'cli-override';

export interface CredentialMetadata {
  ref: string;
  slot: string;
  kind: CredentialKind;
  label: string;
  mask: string;
  updatedAt: string;
}

export interface SaveCredentialRequest {
  slot: string;
  kind: CredentialKind;
  label: string;
  secret: string;
}

export type CredentialListResult =
  | { ok: true; credentials: CredentialMetadata[] }
  | { ok: false; reason: string };

export type CredentialSaveResult =
  | { ok: true; credential: CredentialMetadata }
  | { ok: false; reason: string };

export type CredentialDeleteResult =
  | { ok: true; deleted: boolean }
  | { ok: false; reason: string };

export interface RegisteredCredential extends CredentialMetadata {
  secret: string;
}

export function isCredentialReference(value: unknown): value is string {
  return typeof value === 'string'
    && /^credential:\/\/[A-Za-z0-9_-]{16,64}$/.test(value);
}

export function maskCredential(secret: string): string {
  const trimmed = secret.trim();
  const tail = trimmed.slice(-4);
  return tail ? `****${tail}` : '****';
}
