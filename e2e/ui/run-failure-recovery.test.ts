import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';

import {
  createProjectViaApi,
  gotoProject,
  putAppConfig,
  seedBrowserConfig,
} from '@/playwright/app';
import { runErrorCard } from '@/playwright/chat';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

let codexRuntime: Awaited<ReturnType<typeof createFakeAgentRuntimes>>['codex'];

const CODEX_AGENT = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
};
const CLAUDE_AGENT = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
};
const ANTIGRAVITY_AGENT = {
  id: 'antigravity',
  name: 'Antigravity',
  bin: 'agy',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
};

test.describe.configure({ timeout: T.xlong });

test.beforeAll(async () => {
  const runtimes = await createFakeAgentRuntimes(['codex']);
  codexRuntime = runtimes.codex;
});

test('[P0] upstream outages keep generic Retry available', async ({ page }) => {
  await stubCatalogsEmpty(page);
  await stubRuntimeAgents(page);
  const root = join(tmpdir(), `clean-design-upstream-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const runtimes = await createFakeAgentRuntimes({ root: join(root, 'agents'), runtimeIds: ['claude'] });
  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'claude',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      claude: { model: 'default', reasoning: 'default' },
    },
    agentCliEnv: {
      claude: runtimes.claude.env,
    },
  };

  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const { projectId, conversationId } = await createFailureProject(page, 'upstream', 'Upstream outage recovery');
  await putFailedTurn(page, {
    projectId,
    conversationId,
    agentId: 'claude',
    detail: 'The model provider is temporarily unavailable.',
    code: 'UPSTREAM_UNAVAILABLE',
  });
  await gotoProject(page, projectId);

  await expect(page.getByRole('button', { name: /^Retry$|^重试$|^重試$/i }).first()).toBeVisible({ timeout: T.long });
  await expect(page.getByText(/Generation service unavailable|model provider is temporarily unavailable/i).first()).toBeVisible();
  await expect(page.getByText(/Model call failed/i)).toHaveCount(0);
});

test('[P1] zh-CN run failure guidance shows actionable copy and expandable raw source', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('open-design:locale', 'zh-CN');
    window.localStorage.setItem('open-design:locale-source', 'manual');
  });
  await stubCatalogsEmpty(page);
  await stubRuntimeAgents(page);

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      codex: { model: 'default', reasoning: 'default' },
    },
    agentCliEnv: {
      codex: codexRuntime.env,
    },
  };
  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const { projectId, conversationId } = await createFailureProject(page, 'prompt-too-large', 'Prompt too large guidance');
  const rawDetail = 'context window exceeded: estimated 250000 tokens for this run.';
  await putFailedTurn(page, {
    projectId,
    conversationId,
    agentId: 'codex',
    agentName: 'Codex CLI',
    detail: rawDetail,
    code: 'AGENT_PROMPT_TOO_LARGE',
  });

  await gotoProject(page, projectId);

  const card = runErrorCard(page);
  await expect(card).toContainText('内容过长', { timeout: T.long });
  await expect(card).toContainText('本轮输入超出了模型的上下文上限');
  await expect(page.getByRole('button', { name: /^重试$/ }).first()).toBeVisible();

  const sourceToggle = card.locator('.run-error__source-bar');
  await expect(sourceToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sourceToggle).toHaveAccessibleName(/展开报错源码/);
  await sourceToggle.click();
  await expect(sourceToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(sourceToggle).toHaveAccessibleName(/收起报错源码/);
  await expect(card.locator('.run-error__source-full')).toContainText(rawDetail);
});

test('[P0] Antigravity rate limits offer terminal model switching', async ({ page }) => {
  await stubCatalogsEmpty(page);
  await stubRuntimeAgents(page);
  let oauthLaunchCalls = 0;
  await page.route('**/api/agents/antigravity/oauth-launch', async (route) => {
    oauthLaunchCalls += 1;
    await route.fulfill({ status: 200, json: { ok: true } });
  });

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'antigravity',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      antigravity: { model: 'default', reasoning: 'default' },
    },
  };

  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const { projectId, conversationId } = await createFailureProject(page, 'antigravity', 'Antigravity rate limit recovery');
  await putFailedTurn(page, {
    projectId,
    conversationId,
    agentId: 'antigravity',
    detail: 'Switch to another Antigravity model before retrying this run.',
    code: 'RATE_LIMITED',
  });
  await gotoProject(page, projectId);

  const launchTerminal = page.getByRole('button', { name: /Switch model in terminal/i }).first();
  await expect(launchTerminal).toBeVisible({ timeout: T.long });
  await expect(page.getByRole('button', { name: /^Retry$|^重试$|^重試$/i }).first()).toBeVisible();

  await launchTerminal.click();
  await expect.poll(() => oauthLaunchCalls).toBe(1);
});

async function stubCatalogsEmpty(page: Page) {
  await page.route('**/api/skills', async (route) => route.fulfill({ json: { skills: [] } }));
  await page.route('**/api/design-templates', async (route) => route.fulfill({ json: { designTemplates: [] } }));
  await page.route('**/api/design-systems', async (route) => route.fulfill({ json: { designSystems: [] } }));
}

async function stubRuntimeAgents(page: Page) {
  await routeAgents(page, [CODEX_AGENT, CLAUDE_AGENT, ANTIGRAVITY_AGENT]);
}

async function createFailureProject(page: Page, prefix: string, name: string) {
  const projectId = `${prefix}-ui-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  const { conversationId } = await createProjectViaApi(page, projectId, name);
  const response = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/u-${projectId}`,
    {
      data: {
        role: 'user',
        content: 'please build something',
        createdAt: Date.now() - 2_000,
      },
    },
  );
  expect(response.ok(), `upsert user msg: ${await response.text()}`).toBeTruthy();
  return { projectId, conversationId };
}

async function putFailedTurn(
  page: Page,
  options: {
    projectId: string;
    conversationId: string;
    agentId: 'antigravity' | 'claude' | 'codex';
    agentName?: string;
    detail: string;
    code: string;
  },
) {
  const response = await page.request.put(
    `/api/projects/${options.projectId}/conversations/${options.conversationId}/messages/a-${options.projectId}`,
    {
      data: {
        role: 'assistant',
        content: '',
        agentId: options.agentId,
        ...(options.agentName ? { agentName: options.agentName } : {}),
        runId: `run-${options.projectId}`,
        runStatus: 'failed',
        createdAt: Date.now() - 1_000,
        startedAt: Date.now() - 1_000,
        preTurnFileNames: [],
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: options.detail,
            code: options.code,
          },
        ],
      },
    },
  );
  expect(response.ok(), `upsert assistant msg: ${await response.text()}`).toBeTruthy();
}
