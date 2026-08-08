import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appConfigDir } from '../app-config.js';
import { resolveProjectRootFromNestedModule } from '../project-root.js';
import { TrustedHandoffRootStore } from './trusted-roots.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const handoffDataRoot = appConfigDir(resolveProjectRootFromNestedModule(moduleDir));

export const trustedHandoffRootStore = new TrustedHandoffRootStore(
  path.join(handoffDataRoot, 'trusted-handoff-roots.json'),
  { applicationDataRoots: [handoffDataRoot] },
);
