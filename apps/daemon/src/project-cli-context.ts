type JsonObject = Record<string, unknown>;

interface ActiveContext {
  active?: boolean;
  projectId?: string;
  projectName?: string | null;
  fileName?: string | null;
  ageMs?: number | null;
}

interface ProjectSummary {
  id: string;
  name: string;
}

interface ProjectsPayload {
  projects?: ProjectSummary[];
}

export type ResolvedProject = {
  id: string;
  name: string;
  source: 'uuid' | 'id' | 'exact' | 'slug' | 'substring';
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`daemon ${response.status} on ${url}: ${body || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function resolveProjectId(baseUrl: string, value: string): Promise<ResolvedProject> {
  if (UUID_RE.test(value)) return { id: value, name: value, source: 'uuid' };
  const payload = await getJson<ProjectsPayload>(`${baseUrl}/api/projects`);
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  if (projects.length === 0) throw new Error('no projects on this daemon');

  const normalize = (input: unknown) => String(input || '')
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[\s_-]+/g, '-');
  const lower = value.toLowerCase();
  const normalized = normalize(value);

  const idMatch = projects.find((project) => project.id === value);
  if (idMatch) return { id: idMatch.id, name: idMatch.name, source: 'id' };
  const exact = projects.filter((project) => project.name.toLowerCase() === lower);
  if (exact.length === 1) return { ...exact[0]!, source: 'exact' };
  const slugged = projects.filter((project) => normalize(project.name) === normalized);
  if (slugged.length === 1) return { ...slugged[0]!, source: 'slug' };
  const partial = projects.filter((project) => project.name.toLowerCase().includes(lower));
  if (partial.length === 1) return { ...partial[0]!, source: 'substring' };
  if (partial.length > 1) {
    throw new Error(`multiple projects match "${value}": ${partial.map((project) => `${project.name} (${project.id})`).join(', ')}`);
  }
  throw new Error(`no project matches "${value}"`);
}

export async function resolveProjectArg(
  baseUrl: string,
  value: unknown,
): Promise<{ id: string; resolved: ResolvedProject | null; active: ActiveContext | null }> {
  if (typeof value === 'string' && value.length > 0) {
    const resolved = await resolveProjectId(baseUrl, value);
    return { id: resolved.id, resolved, active: null };
  }
  const active = await getJson<ActiveContext>(`${baseUrl}/api/active`).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`project omitted and active context lookup failed: ${message}`);
  });
  if (!active.active || !active.projectId) {
    throw new Error('project omitted and Clean Design has no active project; pass --project <id-or-name>');
  }
  return { id: active.projectId, resolved: null, active };
}

export function withActiveEcho<T extends JsonObject>(
  payload: T,
  active: ActiveContext | null,
  resolved?: ResolvedProject | null,
): T & JsonObject {
  const result = active
    ? {
        ...payload,
        usedActiveContext: {
          projectId: active.projectId,
          projectName: active.projectName ?? null,
          fileName: active.fileName ?? null,
          ageMs: active.ageMs ?? null,
        },
      }
    : payload;
  if (resolved && (resolved.source === 'slug' || resolved.source === 'substring')) {
    return { ...result, resolvedProject: { id: resolved.id, name: resolved.name } };
  }
  return result;
}
