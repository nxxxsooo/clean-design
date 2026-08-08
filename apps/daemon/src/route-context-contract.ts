import type { ServerContext } from './server-context.js';
import type { RegisterActiveContextRoutesDeps } from './routes/active-context.js';
import type { RegisterChatRoutesDeps } from './routes/chat.js';
import type { RegisterFinalizeRoutesDeps, RegisterImportRoutesDeps, RegisterProjectExportRoutesDeps } from './import-export-routes.js';
import type { RegisterGenuiRoutesDeps } from './routes/genui.js';
import type { RegisterHandoffRoutesDeps } from './routes/handoff.js';
import type { RegisterHostToolsRoutesDeps } from './routes/host-tools.js';
import type { RegisterLiveArtifactRoutesDeps } from './routes/live-artifact.js';
import type { RegisterMediaRoutesDeps } from './routes/media.js';
import type { RegisterMemoryRoutesDeps } from './routes/memory.js';
import type { RegisterProjectArtifactRoutesDeps, RegisterProjectFileRoutesDeps, RegisterProjectRoutesDeps, RegisterProjectUploadRoutesDeps } from './routes/project/index.js';
import type { RegisterRunRoutesDeps } from './routes/runs.js';
import type { RegisterStaticResourceRoutesDeps } from './routes/static-resource.js';
import type { RegisterXaiRoutesDeps } from './routes/xai.js';

type AllRegisteredRouteDeps =
  & RegisterActiveContextRoutesDeps
  & RegisterChatRoutesDeps
  & RegisterFinalizeRoutesDeps
  & RegisterGenuiRoutesDeps
  & RegisterHandoffRoutesDeps
  & RegisterHostToolsRoutesDeps
  & RegisterImportRoutesDeps
  & RegisterLiveArtifactRoutesDeps
  & RegisterMediaRoutesDeps
  & RegisterMemoryRoutesDeps
  & RegisterProjectArtifactRoutesDeps
  & RegisterProjectExportRoutesDeps
  & RegisterProjectFileRoutesDeps
  & RegisterProjectRoutesDeps
  & RegisterProjectUploadRoutesDeps
  & RegisterRunRoutesDeps
  & RegisterStaticResourceRoutesDeps
  & RegisterXaiRoutesDeps;

type Assert<T extends true> = T;
type ServerContextCoversRouteDeps = Assert<ServerContext extends AllRegisteredRouteDeps ? true : false>;

export function assertServerContextSatisfiesRoutes(ctx: ServerContextCoversRouteDeps extends true ? ServerContext : never): void {
  void ctx;
}
