import type {
  OpenDesignHostActionResult,
  OpenDesignHostBrowserClearDataOptions,
  OpenDesignHostCaptureOptions,
  OpenDesignHostCaptureResult,
  OpenDesignHostFailure,
  OpenDesignHostGlobalScope,
  OpenDesignHostHandoffRootResult,
  OpenDesignHostPdfPrintOptions,
  OpenDesignHostPickWorkingDirResult,
  OpenDesignHostProjectImportInit,
  OpenDesignHostProjectImportResult,
  OpenDesignHostProjectReplaceWorkingDirResult,
} from "./protocol.js";
import { getOpenDesignHost } from "./detection.js";
import type {
  CredentialDeleteResult,
  CredentialListResult,
  CredentialSaveResult,
  SaveCredentialRequest,
} from './protocol.js';

/**
 * @module actions
 *
 * Renderer-facing wrappers over the host bridge. Each resolves the bridge from
 * scope, invokes the capability, and returns a host-owned result (or a uniform
 * "host is not available" failure). Covers shell, browser, capture, project,
 * pdf, and pet action surfaces.
 */

/** @internal Build a normalized host failure result. */
function failure(reason: string, details?: unknown): OpenDesignHostFailure {
  return {
    ...(details === undefined ? {} : { details }),
    ok: false,
    reason,
  };
}

/** @internal Uniform failure for when the host bridge is absent. */
function unavailable(reason: string): OpenDesignHostFailure {
  return failure(reason);
}

export async function listHostCredentials(
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<CredentialListResult> {
  const credentials = getOpenDesignHost(scope)?.credentials;
  return credentials?.list() ?? { ok: false, reason: 'protected credential storage is unavailable' };
}

export async function saveHostCredential(
  input: SaveCredentialRequest,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<CredentialSaveResult> {
  const credentials = getOpenDesignHost(scope)?.credentials;
  return credentials?.save(input) ?? { ok: false, reason: 'protected credential storage is unavailable' };
}

export async function deleteHostCredential(
  ref: string,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<CredentialDeleteResult> {
  const credentials = getOpenDesignHost(scope)?.credentials;
  return credentials?.delete(ref) ?? { ok: false, reason: 'protected credential storage is unavailable' };
}

export async function selectHostHandoffRoot(
  projectId: string,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostHandoffRootResult> {
  const handoff = getOpenDesignHost(scope)?.handoff;
  return handoff?.selectRoot(projectId) ?? { ok: false, reason: 'desktop handoff picker is unavailable' };
}

/** Open an external URL through the host shell. */
export async function openHostExternalUrl(url: string, scope: OpenDesignHostGlobalScope = globalThis): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.shell.openExternal(url);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Reveal a project's path through the host shell. */
export async function openHostProjectPath(projectId: string, scope: OpenDesignHostGlobalScope = globalThis): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.shell.openPath(projectId);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Clear host browser data (cookies and/or storage). */
export async function clearHostBrowserData(
  options?: OpenDesignHostBrowserClearDataOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.browser.clearData(options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Capture the host page (optionally clipped) as a data URL. */
export async function captureHostPage(
  options?: OpenDesignHostCaptureOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostCaptureResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.capture.page(options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Pick and import a project through the host's native dialog. */
export async function pickAndImportHostProject(
  init?: OpenDesignHostProjectImportInit,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostProjectImportResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.project.pickAndImport(init);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Pick and replace a project's working directory through the host. */
export async function pickAndReplaceHostProjectWorkingDir(
  projectId: string,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostProjectReplaceWorkingDirResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.project.pickAndReplaceWorkingDir(projectId);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

// Picks a folder via the host's native dialog and returns the chosen path
// plus a single-use token, WITHOUT touching any project. The Home flow uses
// this to let the user choose a working directory before the project exists;
// the token is later spent on POST /api/projects/:id/working-dir.
export async function pickHostWorkingDir(
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostPickWorkingDirResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  if (typeof host.project.pickWorkingDir !== "function") {
    return unavailable("host build does not support pickWorkingDir");
  }
  try {
    return await host.project.pickWorkingDir();
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Print HTML to PDF through the host. */
export async function printHostPdf(
  html: string,
  nonce?: string,
  options?: OpenDesignHostPdfPrintOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.pdf.print(html, nonce, options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Toggle host pet visibility. */
export function setHostPetVisible(visible: boolean, scope: OpenDesignHostGlobalScope = globalThis): OpenDesignHostActionResult {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    host.pet.setVisible(visible);
    return { ok: true };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
