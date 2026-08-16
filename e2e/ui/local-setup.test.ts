import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';

import {
  openSettingsDialog,
  waitForLoadingToClear,
} from '@/playwright/app';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

const LOCAL_CLI_LABEL = /Local CLI|本机 CLI|本地 CLI/i;
const MODEL_POPOVER_SELECTOR = '.model-select-searchable__popover';
const STORAGE_KEY = 'clean-design:config';

test.describe.configure({ timeout: T.xlong });

test('[P0] @critical first local setup selects an allowlisted CLI and persists its model', async ({ page }) => {
  await openFirstSetup(page, {
    mode: 'daemon',
    agentId: null,
    agentModels: {},
  });

  const dialog = await openSettingsDialog(page);
  await dialog.getByRole('tab', { name: LOCAL_CLI_LABEL }).click();

  const codex = dialog.getByTestId('settings-agent-select-codex');
  await expect(codex).toBeVisible();
  await codex.click();
  await dialog.getByRole('combobox', { name: 'Model', exact: true }).click();
  await page
    .getByTestId('settings-agent-model-popover-codex')
    .getByRole('option', { name: /GPT 5\.5/i })
    .click();

  await expect.poll(() => readStoredConfig(page)).toMatchObject({
    mode: 'daemon',
    agentId: 'codex',
    agentModels: {
      codex: { model: 'gpt-5.6-sol' },
    },
  });

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const reopened = await openSettingsDialog(page);
  await reopened.getByRole('tab', { name: LOCAL_CLI_LABEL }).click();
  await reopened.getByTestId('settings-agent-select-codex').click();
  await expect(reopened.getByRole('combobox', { name: 'Model', exact: true })).toContainText(/GPT 5\.5/i);
});

test('[P1] first BYOK setup discovers models, tests the provider, and persists selection', async ({ page }) => {
  const modelRequests: Array<Record<string, unknown>> = [];
  const connectionRequests: Array<Record<string, unknown>> = [];

  await page.route('**/api/provider/models', async (route) => {
    modelRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 14,
        models: [
          { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
        ],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    connectionRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 27,
        model: 'claude-opus-4-8',
        sample: 'Connected',
      },
    });
  });

  await openFirstSetup(page, {
    mode: 'api',
    apiProtocol: 'anthropic',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: null,
    agentModels: {},
  });

  const dialog = await openSettingsDialog(page);
  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await dialog.getByRole('tab', { name: 'Anthropic', exact: true }).click();

  const apiKey = dialog.getByLabel('API key');
  await apiKey.fill('anthropic-test-key');
  await apiKey.blur();
  await expect(dialog.getByText('Loaded 2 models from your account.')).toBeVisible();
  await expect.poll(() => modelRequests).toContainEqual(expect.objectContaining({
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'anthropic-test-key',
  }));

  const model = modelCombobox(dialog);
  await model.click();
  await page
    .locator(MODEL_POPOVER_SELECTOR)
    .last()
    .getByRole('option', { name: /Claude Opus 4\.8/ })
    .click();

  await dialog.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /Connected/ })).toBeVisible();
  await expect.poll(() => connectionRequests).toContainEqual(expect.objectContaining({
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'anthropic-test-key',
    model: 'claude-opus-4-8',
  }));

  await expect.poll(() => readStoredConfig(page)).toMatchObject({
    mode: 'api',
    apiProtocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
  });

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const reopened = await openSettingsDialog(page);
  await expect(reopened.getByRole('tab', { name: 'Anthropic', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(modelCombobox(reopened)).toContainText(/Claude Opus 4\.8/i);
});

async function openFirstSetup(page: Page, overrides: Record<string, unknown>) {
  const config = {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'anthropic',
    apiVersion: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: null,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
    ...overrides,
  };
  let appConfig = { ...config };

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      appConfig = {
        ...appConfig,
        ...(route.request().postDataJSON() as Record<string, unknown>),
      };
      await route.fulfill({ json: { config: appConfig } });
      return;
    }
    await route.fulfill({ json: { config: appConfig } });
  });
  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      models: [
        { id: 'default', label: 'Default' },
        { id: 'gpt-5.6-sol', label: 'GPT 5.6 Sol' },
      ],
    },
    {
      id: 'claude',
      name: 'Claude Code',
      bin: 'claude',
      available: true,
      version: '2.1.0',
      models: [{ id: 'default', label: 'Default' }],
    },
    {
      id: 'antigravity',
      name: 'Antigravity',
      bin: 'agy',
      available: true,
      version: '1.0.0',
      models: [{ id: 'default', label: 'Default' }],
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      bin: 'opencode',
      available: true,
      version: '1.0.0',
      models: [{ id: 'default', label: 'Default' }],
    },
    {
      id: 'pi',
      name: 'Pi',
      bin: 'pi',
      available: true,
      version: '1.0.0',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/skills', async (route) => route.fulfill({ json: { skills: [] } }));
  await page.route('**/api/design-templates', async (route) => route.fulfill({ json: { designTemplates: [] } }));
  await page.route('**/api/design-systems', async (route) => route.fulfill({ json: { designSystems: [] } }));
  await page.route('**/api/templates', async (route) => route.fulfill({ json: { templates: [] } }));
  await page.route('**/api/prompt-templates', async (route) => route.fulfill({ json: { templates: [] } }));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
}

function modelCombobox(scope: Page | Locator) {
  return scope.getByRole('combobox', { name: 'Model', exact: true });
}

async function readStoredConfig(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}
