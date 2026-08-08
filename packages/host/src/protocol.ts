/**
 * @module protocol
 *
 * The Open Design renderer host-bridge wire contract: the injected-global name
 * and version, client constant registries, and every request/result
 * type that crosses the host bridge — including the {@link OpenDesignHostBridge}
 * shape itself. Pure declarations only; depends on nothing else in the package.
 */

export const OPEN_DESIGN_HOST_GLOBAL = "__od__";
export const OPEN_DESIGN_HOST_VERSION = 2;

export const OPEN_DESIGN_HOST_CLIENT_TYPES = Object.freeze({
  DESKTOP: "desktop",
} as const);

export type OpenDesignHostClientType =
  (typeof OPEN_DESIGN_HOST_CLIENT_TYPES)[keyof typeof OPEN_DESIGN_HOST_CLIENT_TYPES];

export type OpenDesignHostClient = {
  // BCP-47 locale string (e.g. "zh-CN", "pt-BR") the host process read from
  // the OS at startup. The renderer uses this so the packaged desktop app
  // can follow the OS language even when Chromium's built-in
  // `navigator.language` would have defaulted to en-US.
  osLocale?: string;
  platform?: string;
  type: OpenDesignHostClientType;
};

export type OpenDesignHostFailure = {
  details?: unknown;
  ok: false;
  reason: string;
};

export type CredentialKind = 'chat-provider' | 'media-provider' | 'cli-override';
export type CredentialMetadata = {
  ref: string;
  slot: string;
  kind: CredentialKind;
  label: string;
  mask: string;
  updatedAt: string;
};
export type SaveCredentialRequest = {
  slot: string;
  kind: CredentialKind;
  label: string;
  secret: string;
};
export type CredentialListResult =
  | { ok: true; credentials: CredentialMetadata[] }
  | { ok: false; reason: string };
export type CredentialSaveResult =
  | { ok: true; credential: CredentialMetadata }
  | { ok: false; reason: string };
export type CredentialDeleteResult =
  | { ok: true; deleted: boolean }
  | { ok: false; reason: string };
export type OpenDesignHostHandoffRootResult =
  | { ok: true; configured: true; displayName: string }
  | { ok: false; canceled: true }
  | OpenDesignHostFailure;

export type OpenDesignHostActionResult =
  | { ok: true }
  | OpenDesignHostFailure;

export type OpenDesignHostProjectImportInit = {
  designSystemId?: string | null;
  name?: string;
  skillId?: string | null;
};

export type OpenDesignHostProjectImportSuccess = {
  conversationId: string;
  entryFile: string | null;
  ok: true;
  projectId: string;
};

export type OpenDesignHostProjectImportResult =
  | OpenDesignHostProjectImportSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostProjectReplaceWorkingDirSuccess = {
  baseDir: string;
  entryFile: string | null;
  ok: true;
};

export type OpenDesignHostProjectReplaceWorkingDirResult =
  | OpenDesignHostProjectReplaceWorkingDirSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostPickWorkingDirSuccess = {
  baseDir: string;
  ok: true;
  // Single-use HMAC token (minted by the host main process for `baseDir`)
  // that the renderer threads into POST /api/projects/:id/working-dir once
  // the project exists. Lets the Home flow pick a folder before the project
  // is created without exposing the daemon's desktop-auth gate.
  token: string;
};

export type OpenDesignHostPickWorkingDirResult =
  | OpenDesignHostPickWorkingDirSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostPdfPrintOptions = {
  deck?: boolean;
};

export type OpenDesignHostCaptureClip = { x: number; y: number; width: number; height: number };
export type OpenDesignHostCaptureOptions = { clip?: OpenDesignHostCaptureClip };
export type OpenDesignHostCaptureSuccess = { dataUrl: string; h: number; ok: true; w: number };
export type OpenDesignHostCaptureResult = OpenDesignHostCaptureSuccess | OpenDesignHostFailure;

export type OpenDesignHostBrowserClearDataOptions = {
  cookies?: boolean;
  storage?: boolean;
};

export type OpenDesignHostBridge = {
  browser: {
    clearData(options?: OpenDesignHostBrowserClearDataOptions): Promise<OpenDesignHostActionResult>;
  };
  capture: {
    page(options?: OpenDesignHostCaptureOptions): Promise<OpenDesignHostCaptureResult>;
  };
  credentials?: {
    list(): Promise<CredentialListResult>;
    save(input: SaveCredentialRequest): Promise<CredentialSaveResult>;
    delete(ref: string): Promise<CredentialDeleteResult>;
  };
  handoff?: {
    selectRoot(projectId: string): Promise<OpenDesignHostHandoffRootResult>;
  };
  client: OpenDesignHostClient;
  pdf: {
    print(html: string, nonce?: string, options?: OpenDesignHostPdfPrintOptions): Promise<OpenDesignHostActionResult>;
  };
  pet: {
    setVisible(visible: boolean): void;
  };
  project: {
    pickAndImport(init?: OpenDesignHostProjectImportInit): Promise<OpenDesignHostProjectImportResult>;
    pickAndReplaceWorkingDir(projectId: string): Promise<OpenDesignHostProjectReplaceWorkingDirResult>;
    // Optional so older host builds still satisfy the bridge shape; callers
    // must feature-detect before invoking.
    pickWorkingDir?(): Promise<OpenDesignHostPickWorkingDirResult>;
  };
  shell: {
    openExternal(url: string): Promise<OpenDesignHostActionResult>;
    openPath(projectId: string): Promise<OpenDesignHostActionResult>;
  };
  version: typeof OPEN_DESIGN_HOST_VERSION;
};

export type OpenDesignHostGlobalScope = Record<string, unknown> & {
  window?: unknown;
};
