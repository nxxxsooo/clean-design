import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import {
  CLOUDFLARE_PAGES_PROVIDER_ID,
  DEFAULT_DEPLOY_PROVIDER_ID,
  deployProjectFile,
  fetchAgentsStream,
  fetchCloudflarePagesZones,
  fetchDeployConfig,
  fetchAppVersionInfo,
  fetchPluginExampleHtml,
  fetchPluginPreviewHtml,
  fetchProjectDesignSystemPackageAudit,
  fetchProjectFileText,
  fetchSkillExample,
  isDeployProviderId,
  openFolderDialog,
  updateDeployConfig,
  uploadProjectFiles,
  writeProjectTextFileDetailed,
} from '../../src/providers/registry';

function agentStreamResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

describe('fetchAgentsStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('collects streamed agents only after the terminal done event', async () => {
    const agent = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        `event: agent\ndata: ${JSON.stringify(agent)}\n\n` +
          'event: done\ndata: {}\n\n',
      )),
    );
    const onAgent = vi.fn();

    await expect(fetchAgentsStream({ onAgent })).resolves.toEqual([agent]);
    expect(onAgent).toHaveBeenCalledWith(agent);
  });

  it('throws when the stream emits an error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        'event: error\ndata: {"error":"agent probe failed"}\n\n',
      )),
    );

    await expect(fetchAgentsStream({ onAgent: vi.fn() }))
      .rejects.toThrow('agent probe failed');
  });

  it('throws when the stream closes before the terminal done event', async () => {
    const agent = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        `event: agent\ndata: ${JSON.stringify(agent)}\n\n`,
      )),
    );

    await expect(fetchAgentsStream({ onAgent: vi.fn() }))
      .rejects.toThrow('agents stream ended before done');
  });
});

describe('fetchAppVersionInfo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns version info from the daemon response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        version: { version: '1.2.3', channel: 'beta', packaged: true, platform: 'darwin', arch: 'arm64' },
      }), { status: 200 })),
    );

    await expect(fetchAppVersionInfo()).resolves.toEqual({
      version: '1.2.3',
      channel: 'beta',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
    });
  });

  it('returns null when version info is unavailable or malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ version: { version: '1.2.3' } }), { status: 200 })),
    );

    await expect(fetchAppVersionInfo()).resolves.toBeNull();
  });
});

describe('writeProjectTextFileDetailed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('surfaces daemon save errors instead of collapsing them to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        error: { code: 'ARTIFACT_REGRESSION', message: 'new artifact is smaller than the prior version' },
      }), { status: 422, headers: { 'Content-Type': 'application/json' } })),
    );

    await expect(writeProjectTextFileDetailed('project-1', 'preview.html', '<html></html>')).resolves.toEqual({
      ok: false,
      status: 422,
      code: 'ARTIFACT_REGRESSION',
      message: 'new artifact is smaller than the prior version',
    });
  });
});

describe('openFolderDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the legacy fail-soft behavior unless throwOnError is requested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ error: 'Could not open folder picker: zenity is not installed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )),
    );

    await expect(openFolderDialog()).resolves.toBeNull();
  });

  it('throws daemon picker messages when throwOnError is requested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ error: 'Could not open folder picker: zenity is not installed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )),
    );

    await expect(openFolderDialog({ throwOnError: true }))
      .rejects.toThrow('Could not open folder picker: zenity is not installed');
  });
});

describe('fetchSkillExample', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Regression coverage for nexu-io/open-design#897. Skills declared with
  // a non-html `od.preview.type` ship no fetchable HTML — the daemon's
  // /example endpoint only resolves HTML files and 404s for everything
  // else, which left the gallery stuck on a misleading "Couldn't load
  // this example. The example HTML failed to fetch." state. The dispatch
  // now short-circuits at the data layer so the modal can render a calm
  // "no shipped preview" placeholder without firing a doomed network
  // call.
  it('short-circuits without a fetch when previewType is not html', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('hatch-pet', 'image')).resolves.toEqual({
      unavailable: true,
      kind: 'image',
    });
    await expect(
      fetchSkillExample('dcf-valuation', 'markdown'),
    ).resolves.toEqual({ unavailable: true, kind: 'markdown' });

    // The doomed-call is the bug we're fixing — assert no network call
    // was made for either non-html dispatch.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to html fetch when previewType is omitted (legacy callers)', async () => {
    const fetchMock = vi.fn(
      async () => new Response('<html><body>ok</body></html>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('blog-post')).resolves.toEqual({
      html: '<html><body>ok</body></html>',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/blog-post/example');
  });

  it('treats missing html previews as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('design-brief', 'html')).resolves.toEqual({
      unavailable: true,
      kind: 'html',
    });
    // Confirm the dispatch did call through to the daemon for the html
    // path (i.e. the short-circuit above only catches non-html types).
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/design-brief/example');
  });

  it('forwards real html preview fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('design-brief', 'html')).resolves.toEqual({
      error: 'HTTP 500',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/design-brief/example');
  });
});

// Plugin previews use the same daemon contract as skill examples (the
// daemon returns 404 when the manifest declares a preview entry but no
// file ships at that path). Skills already map that 404 to
// { unavailable: true, kind: 'html' } per #897 so the modal renders a
// calm "no shipped preview" placeholder instead of "Couldn't load this
// example. The example HTML failed to fetch." Plugins lacked the
// symmetric treatment, so bundled plugins like `example-live-artifact`
// surfaced the misleading error from the Home Community grid even
// though the catalog simply ships no example HTML for that plugin.
describe('fetchPluginPreviewHtml', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats missing previews as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('preview not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ unavailable: true, kind: 'html' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-live-artifact/preview',
    );
  });

  it('forwards real preview fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ error: 'HTTP 500' });
  });

  it('returns html on success', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('<html><body>preview</body></html>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ html: '<html><body>preview</body></html>' });
  });
});

describe('fetchPluginExampleHtml', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats missing example stems as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('example not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginExampleHtml('example-live-artifact', 'index'),
    ).resolves.toEqual({ unavailable: true, kind: 'html' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-live-artifact/example/index',
    );
  });

  it('forwards real example fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginExampleHtml('example-live-artifact', 'index'),
    ).resolves.toEqual({ error: 'HTTP 500' });
  });
});

describe('fetchProjectFileText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('can bypass caches when fetching source text', async () => {
    const fetchMock = vi.fn(async () => new Response('<svg />', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchProjectFileText('project-1', 'diagram.svg', {
        cache: 'no-store',
        cacheBustKey: '1710000000-2',
      }),
    ).resolves.toBe('<svg />');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/diagram.svg?cacheBust=1710000000-2',
      { cache: 'no-store' },
    );
  });

  it('logs HTTP failure context before returning null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404, statusText: 'Not Found' })));

    await expect(fetchProjectFileText('project-1', 'missing.svg')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[fetchProjectFileText] failed:',
      expect.objectContaining({
        name: 'missing.svg',
        projectId: 'project-1',
        status: 404,
        statusText: 'Not Found',
        url: '/api/projects/project-1/raw/missing.svg',
      }),
    );
  });

  it('logs thrown fetch errors before returning null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('network down');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw error;
    }));

    await expect(fetchProjectFileText('project-1', 'diagram.svg')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[fetchProjectFileText] failed:',
      expect.objectContaining({
        error,
        name: 'diagram.svg',
        projectId: 'project-1',
        url: '/api/projects/project-1/raw/diagram.svg',
      }),
    );
  });
});

describe('fetchProjectDesignSystemPackageAudit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the daemon package audit for a project', async () => {
    const audit = {
      ok: false,
      projectPath: '/tmp/project',
      filesInspected: 4,
      errors: [{
        severity: 'error',
        code: 'ui_kit_index_missing_runtime_bootstrap',
        message: 'UI kit must mount.',
        path: 'ui_kits/app/index.html',
      }],
      warnings: [],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ audit }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectDesignSystemPackageAudit('ds acme')).resolves.toEqual(audit);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/ds%20acme/design-system-package-audit',
      { cache: 'no-store' },
    );
  });

  it('returns null when the audit endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));

    await expect(fetchProjectDesignSystemPackageAudit('missing')).resolves.toBeNull();
  });
});

describe('uploadProjectFiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats every response entry as a success regardless of originalName drift', async () => {
    // Simulates an encoding edge case: the browser File.name carries a
    // composed CJK name (NFC) but multer round-trips it through latin1 and
    // returns a slightly different decoded form. The old name-equality
    // matching marked these as failed even though the server stored them.
    const composed = '测试.pdf';
    const decomposed = '测试.pdf'; // pretend the server returned a normalized variant
    const file = new File(['hello'], composed, { type: 'application/pdf' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        files: [
          {
            name: 'mxk7-test.pdf',
            path: 'mxk7-test.pdf',
            size: 5,
            originalName: decomposed,
          },
        ],
      }), { status: 200 })),
    );

    const result = await uploadProjectFiles('project-1', [file]);

    expect(result.failed).toEqual([]);
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0]).toMatchObject({
      path: 'mxk7-test.pdf',
      name: decomposed,
      size: 5,
    });
  });

  it('marks the unmatched tail as failed when the server drops files mid-flight', async () => {
    const a = new File(['a'], 'a.txt', { type: 'text/plain' });
    const b = new File(['b'], 'b.txt', { type: 'text/plain' });
    const c = new File(['c'], 'c.txt', { type: 'text/plain' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        files: [
          { name: 't1-a.txt', path: 't1-a.txt', size: 1, originalName: 'a.txt' },
          { name: 't2-b.txt', path: 't2-b.txt', size: 1, originalName: 'b.txt' },
        ],
      }), { status: 200 })),
    );

    const result = await uploadProjectFiles('project-1', [a, b, c]);

    expect(result.uploaded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ name: 'c.txt' });
  });
});

describe('deploy provider registry helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recognizes Vercel and Cloudflare Pages provider ids only', () => {
    expect(isDeployProviderId(DEFAULT_DEPLOY_PROVIDER_ID)).toBe(true);
    expect(isDeployProviderId(CLOUDFLARE_PAGES_PROVIDER_ID)).toBe(true);
    expect(isDeployProviderId('netlify')).toBe(false);
    expect(isDeployProviderId(null)).toBe(false);
  });

  it('fetches provider-specific deploy config via query string', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      teamId: '',
      teamSlug: '',
      accountId: 'account-123',
      projectName: '',
      target: 'preview',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID)).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      accountId: 'account-123',
      projectName: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/config?providerId=cloudflare-pages');
  });

  it('fetches Cloudflare Pages zones from the deploy helper route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
      cloudflarePages: { lastZoneId: 'zone-1', lastDomainPrefix: 'demo' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCloudflarePagesZones()).resolves.toEqual({
      zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
      cloudflarePages: { lastZoneId: 'zone-1', lastDomainPrefix: 'demo' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/cloudflare-pages/zones');
  });

  it('sends Cloudflare Pages config fields without dropping provider-specific metadata', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      teamId: '',
      teamSlug: '',
      accountId: 'account-123',
      projectName: '',
      target: 'preview',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateDeployConfig({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      token: 'cf-token',
      accountId: 'account-123',
    })).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      accountId: 'account-123',
      projectName: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        token: 'cf-token',
        accountId: 'account-123',
      }),
    });
  });

  it('passes the selected Cloudflare Pages provider id and custom domain through deploy requests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'deployment-row-1',
      projectId: 'project-1',
      fileName: 'index.html',
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://open-design-preview.pages.dev',
      deploymentId: 'cf-deployment-1',
      deploymentCount: 1,
      target: 'preview',
      status: 'ready',
      createdAt: 1,
      updatedAt: 2,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID, {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      }),
    ).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'cf-deployment-1',
      url: 'https://open-design-preview.pages.dev',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        cloudflarePages: {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          domainPrefix: 'demo',
        },
      }),
    });
  });

  it('forwards the selected deploy target through deploy requests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'deployment-row-2',
      projectId: 'project-1',
      fileName: 'index.html',
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://open-design-preview.pages.dev',
      deploymentId: 'cf-deployment-2',
      deploymentCount: 1,
      target: 'production',
      status: 'ready',
      createdAt: 1,
      updatedAt: 2,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deployProjectFile(
        'project-1',
        'index.html',
        CLOUDFLARE_PAGES_PROVIDER_ID,
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          domainPrefix: 'demo',
        },
        'production',
      ),
    ).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'cf-deployment-2',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        cloudflarePages: {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          domainPrefix: 'demo',
        },
        target: 'production',
      }),
    });
  });

  it('carries the HTTP status as an error .code when a failed deploy has only a human message', async () => {
    // The provider/daemon returns a message but no structured code; the wrapper
    // must still surface the status so analytics (deployErrorCode reads `.code`
    // first) can bucket it instead of collapsing to the generic "Error".
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'Cloudflare rejected the request' } }),
      { status: 403 },
    )));
    await deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID).then(
      () => { throw new Error('expected deploy to reject'); },
      (err: unknown) => {
        expect((err as { code?: string }).code).toBe('HTTP_403');
        expect((err as Error).message).toBe('Cloudflare rejected the request');
      },
    );
  });

  it('prefers a structured provider error code over the HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'quota exceeded', code: 'RATE_LIMITED' } }),
      { status: 429 },
    )));
    await deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID).then(
      () => { throw new Error('expected deploy to reject'); },
      (err: unknown) => expect((err as { code?: string }).code).toBe('RATE_LIMITED'),
    );
  });

  it('ignores the daemon\'s generic BAD_REQUEST envelope and buckets by the real HTTP status', async () => {
    // The daemon deploy route wraps every non-404 provider failure as
    // `error.code = 'BAD_REQUEST'` but keeps the real HTTP status (403/429/5xx).
    // The wrapper must NOT let BAD_REQUEST win, or every failure collapses to one
    // code — it falls back to the real status instead.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Cloudflare returned 403' } }),
      { status: 403 },
    )));
    await deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID).then(
      () => { throw new Error('expected deploy to reject'); },
      (err: unknown) => expect((err as { code?: string }).code).toBe('HTTP_403'),
    );
  });

  it('ignores the daemon\'s FILE_NOT_FOUND envelope and buckets a 404 as HTTP_404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'FILE_NOT_FOUND', message: 'file not found' } }),
      { status: 404 },
    )));
    await deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID).then(
      () => { throw new Error('expected deploy to reject'); },
      (err: unknown) => expect((err as { code?: string }).code).toBe('HTTP_404'),
    );
  });
});
