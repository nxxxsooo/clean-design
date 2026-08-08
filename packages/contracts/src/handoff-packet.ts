import type { ProjectKind } from './api/projects.js';

export const HANDOFF_MANIFEST_VERSION = 1 as const;

export type HandoffFailureCode =
  | 'root_required'
  | 'root_unavailable'
  | 'secret_detected'
  | 'render_failed'
  | 'write_failed';

export interface HandoffWarning {
  code: string;
  message: string;
}

export interface HandoffManifestFile {
  path: string;
  bytes: number;
  sha256: string;
  role: 'source' | 'design' | 'preview' | 'handoff';
}

export interface HandoffManifestV1 {
  schemaVersion: typeof HANDOFF_MANIFEST_VERSION;
  packetId: string;
  createdAt: string;
  project: {
    id: string;
    name: string;
    slug: string;
    kind: ProjectKind;
    intent?: string;
  };
  viewports: Array<{ name: 'desktop' | 'mobile'; width: number; height: number }>;
  files: HandoffManifestFile[];
  warnings: HandoffWarning[];
}

export type HandoffRootStatusResponse = {
  configured: boolean;
  displayName?: string;
};

export type HandoffPacketResponse =
  | {
      ok: true;
      packetPath: string;
      prompt: string;
      manifest: HandoffManifestV1;
      warnings: HandoffWarning[];
    }
  | {
      ok: false;
      code: HandoffFailureCode;
      message: string;
    };

export function isHandoffFailureCode(value: unknown): value is HandoffFailureCode {
  return [
    'root_required',
    'root_unavailable',
    'secret_detected',
    'render_failed',
    'write_failed',
  ].includes(String(value));
}
