import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import { routeAgents } from '@/playwright/mock-factory';
import type { Locator, Page } from '@playwright/test';
import { openSettingsDialog } from '../lib/playwright/app.js';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;

test.describe.configure({ timeout: 30_000 });

function baseConfig(): Record<string, unknown> {
  return {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
  };
}

async function seedSettingsBase(page: Page) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: baseConfig() });

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true}',
    });
  });

  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.130.0',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config: baseConfig() }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/editors', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"editors":[]}' });
  });
  await page.route('**/api/media/config', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"providers":{}}' });
  });
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"skills":[]}' });
  });
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"designSystems":[]}' });
  });
  await page.route('**/api/projects', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"projects":[]}' });
  });
  await page.route('**/api/templates', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"templates":[]}' });
  });
  await page.route('**/api/prompt-templates', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"promptTemplates":[]}' });
  });
}

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Clean Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

async function openSettings(page: Page) {
  await gotoEntryHome(page);
  return openSettingsDialog(page);
}

async function openMemorySettings(page: Page) {
  const openedDialog = await openSettings(page);
  await openedDialog.getByRole('button', { name: /^Memory\b/ }).click();
  const dialog = page.locator('.modal-settings');
  await expect(dialog.getByRole('button', { name: 'Add or import memories' })).toBeVisible();
  await expect(dialog.getByText('Saved memory')).toBeVisible();
  return dialog;
}

async function openMemoryAddDialog(
  page: Page,
  tab: 'Work profile' | 'Add manually' = 'Work profile',
  settingsDialog?: Locator,
) {
  const settings = settingsDialog ?? await openMemorySettings(page);
  await settings.getByRole('button', { name: 'Add or import memories' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add or import memories' });
  await expect(dialog).toBeVisible();
  if (tab !== 'Work profile') {
    await dialog.getByRole('tab', { name: tab }).click();
  }
  return dialog;
}

test.describe('Settings Memory and Automations flows', () => {
  test('[P1] renders the new Memory information architecture with source tabs, saved stats, and tree summaries', async ({ page }) => {
    await seedSettingsBase(page);

    await page.route('**/api/memory', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          chatExtractionEnabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [
            {
              id: 'feedback_ui_density',
              name: 'Canvas review flow',
              description: 'Keep plugin setup terse and reproducible.',
              type: 'feedback',
              updatedAt: Date.now(),
            },
            {
              id: 'project_launch_brief',
              name: 'Weekly launch brief',
              description: 'Current release framing and stakeholders.',
              type: 'project',
              updatedAt: Date.now(),
            },
          ],
          extraction: null,
        }),
      });
    });

    await page.route('**/api/memory/tree', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tree: [
            {
              id: 'folder-feedback',
              parentId: null,
              path: '/FEEDBACK',
              name: 'Feedback',
              kind: 'folder',
              scope: 'global',
              sourcePacketIds: [],
              proposalIds: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              childrenCount: 1,
            },
            {
              id: 'feedback_ui_density',
              parentId: 'folder-feedback',
              path: '/FEEDBACK/canvas-review-flow',
              name: 'Canvas review flow',
              description: 'Keep plugin setup terse and reproducible.',
              kind: 'entry',
              type: 'feedback',
              scope: 'global',
              sourcePacketIds: [],
              proposalIds: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'folder-project',
              parentId: null,
              path: '/PROJECT',
              name: 'Project',
              kind: 'folder',
              scope: 'project',
              sourcePacketIds: [],
              proposalIds: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              childrenCount: 1,
            },
            {
              id: 'project_launch_brief',
              parentId: 'folder-project',
              path: '/PROJECT/weekly-launch-brief',
              name: 'Weekly launch brief',
              description: 'Current release framing and stakeholders.',
              kind: 'entry',
              type: 'project',
              scope: 'project',
              sourcePacketIds: [],
              proposalIds: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          extractions: [
            {
              id: 'extract-1',
              createdAt: new Date().toISOString(),
              status: 'applied',
              mode: 'chat',
              source: 'conversation',
              summary: 'Recovered launch preferences from a recent chat.',
              provider: { kind: 'openai', credentialSource: 'api' },
              stats: { created: 1, updated: 0, skipped: 0 },
            },
            {
              id: 'extract-2',
              createdAt: new Date().toISOString(),
              status: 'applied',
              mode: 'connector',
              source: 'connector',
              summary: 'Imported product context from connected apps.',
              provider: { kind: 'openai', credentialSource: 'api' },
              stats: { created: 1, updated: 0, skipped: 0 },
            },
          ],
        }),
      });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    const dialog = await openMemorySettings(page);
    const addDialog = await openMemoryAddDialog(page, 'Work profile', dialog);

    await expect(addDialog.getByRole('tab', { name: 'Work profile' })).toHaveAttribute('aria-selected', 'true');
    await expect(addDialog.getByRole('tab', { name: 'Add manually' })).toBeVisible();
    await expect(addDialog.getByRole('tab', { name: 'Import from apps' })).toBeVisible();
    await addDialog.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(dialog.getByText('Saved memory')).toBeVisible();
    await expect(dialog.getByText('2 saved')).toBeVisible();
    await expect(dialog.getByText('2 extractions')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'All 4' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Feedback 1' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Project 1' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Clear' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Refresh' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Advanced' }).click();
    const advancedDialog = page.getByRole('dialog', { name: 'Advanced' });
    await advancedDialog.getByText('Memory tree').click();
    const memoryTree = advancedDialog.locator('.memory-tree-advanced');
    await expect(memoryTree.getByText('Feedback', { exact: true })).toBeVisible();
    await expect(memoryTree.getByText('/FEEDBACK', { exact: true })).toBeVisible();
    await expect(memoryTree.getByText('Project', { exact: true })).toBeVisible();
    await expect(memoryTree.getByText('/PROJECT', { exact: true })).toBeVisible();
    await expect(memoryTree.getByText('Canvas review flow')).toBeVisible();
    await expect(memoryTree.getByText('Weekly launch brief')).toBeVisible();
  });

  test('[P1] edits and deletes saved memory while keeping type filters and counts in sync', async ({ page }) => {
    await seedSettingsBase(page);

    let entries = [
      {
        id: 'user_ui_preferences',
        name: 'UI preferences',
        description: 'Persistent UI rendering preferences',
        type: 'user',
        body: '- Prefer dark mode',
        updatedAt: Date.now(),
      },
      {
        id: 'feedback_density',
        name: 'Density feedback',
        description: 'Keep operational screens compact.',
        type: 'feedback',
        body: '- Prefer dense tables for operations',
        updatedAt: Date.now(),
      },
    ];
    const memoryTree = () => ({
      tree: [
        {
          id: 'folder-user',
          parentId: null,
          path: '/USER',
          name: 'User',
          kind: 'folder',
          scope: 'global',
          childrenCount: entries.filter((entry) => entry.type === 'user').length,
          sourcePacketIds: [],
          proposalIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...entries
          .filter((entry) => entry.type === 'user')
          .map((entry) => ({
            id: entry.id,
            parentId: 'folder-user',
            path: `/USER/${entry.id}`,
            name: entry.name,
            description: entry.description,
            kind: 'entry',
            type: entry.type,
            scope: 'global',
            sourcePacketIds: [],
            proposalIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date(entry.updatedAt).toISOString(),
          })),
        {
          id: 'folder-feedback',
          parentId: null,
          path: '/FEEDBACK',
          name: 'Feedback',
          kind: 'folder',
          scope: 'global',
          childrenCount: entries.filter((entry) => entry.type === 'feedback').length,
          sourcePacketIds: [],
          proposalIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...entries
          .filter((entry) => entry.type === 'feedback')
          .map((entry) => ({
            id: entry.id,
            parentId: 'folder-feedback',
            path: `/FEEDBACK/${entry.id}`,
            name: entry.name,
            description: entry.description,
            kind: 'entry',
            type: entry.type,
            scope: 'global',
            sourcePacketIds: [],
            proposalIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date(entry.updatedAt).toISOString(),
          })),
      ],
    });

    await page.route('**/api/memory', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          chatExtractionEnabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries,
          extraction: null,
        }),
      });
    });
    await page.route('**/api/memory/tree', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(memoryTree()) });
    });
    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"extractions":[]}' });
    });
    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });
    await page.route('**/api/memory/user_ui_preferences', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        const entry = entries.find((item) => item.id === 'user_ui_preferences')!;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entry }) });
        return;
      }
      if (method === 'PUT') {
        const body = route.request().postDataJSON() as {
          name: string;
          description: string;
          type: string;
          body: string;
        };
        entries = entries.map((entry) =>
          entry.id === 'user_ui_preferences'
            ? { ...entry, ...body, type: body.type as 'user' | 'feedback', updatedAt: Date.now() }
            : entry,
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ entry: entries.find((item) => item.id === 'user_ui_preferences') }),
        });
        return;
      }
      if (method === 'DELETE') {
        entries = entries.filter((entry) => entry.id !== 'user_ui_preferences');
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({ status: 405, body: '' });
    });

    const dialog = await openMemorySettings(page);
    await expect(dialog.getByText('2 saved')).toBeVisible();
    await dialog.getByRole('button', { name: 'User 1' }).click();
    await expect(dialog.getByText('UI preferences')).toBeVisible();
    await expect(dialog.getByText('Density feedback')).toHaveCount(0);

    const card = dialog.locator('.library-card', { hasText: 'UI preferences' }).first();
    await card.getByTitle('Edit').click();
    const editDialog = page.getByRole('dialog', { name: 'Add or import memories' });
    await expect(editDialog).toBeVisible();
    const editor = editDialog.locator('.memory-manual-panel');
    await editor.locator('input').nth(0).fill('Updated UI preferences');
    await editor.locator('input').nth(1).fill('Updated rendering preferences');
    await editor.locator('textarea').fill('- Prefer compact, high-contrast controls');
    await editDialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(dialog.getByText('Updated UI preferences')).toBeVisible();
    await expect(dialog.getByText('UI preferences', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'User 1' })).toBeVisible();

    await dialog.locator('.library-card', { hasText: 'Updated UI preferences' }).first().getByTitle('Delete').click();
    await expect(dialog.getByText('Updated UI preferences')).toHaveCount(0);
    await expect(dialog.getByText('1 saved')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'User 0' })).toBeVisible();

    await dialog.getByRole('button', { name: 'All 1' }).click();
    await expect(dialog.getByText('Density feedback')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Feedback 1' })).toBeVisible();
  });

  test('[P1] creates a memory entry and keeps it visible after reopening settings', async ({ page }) => {
    await seedSettingsBase(page);

    let enabled = true;
    let index = '# Memory\n';
    let entries: Array<{
      id: string;
      name: string;
      description: string;
      type: string;
      updatedAt: number;
      body?: string;
    }> = [];

    await page.route('**/api/memory', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled,
            rootDir: '/tmp/memory',
            index,
            entries: entries.map(({ body, ...summary }) => summary),
            extraction: null,
          }),
        });
        return;
      }
      if (method === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, string>;
        const entry = {
          id: 'user_ui_preferences',
          name: payload.name ?? '',
          description: payload.description ?? '',
          type: payload.type ?? 'user',
          body: payload.body ?? '',
          updatedAt: Date.now(),
        };
        entries = [entry];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ entry }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ extractions: [] }),
      });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    await page.route('**/api/memory/config', async (route) => {
      const payload = route.request().postDataJSON() as { enabled?: boolean };
      if (typeof payload.enabled === 'boolean') enabled = payload.enabled;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled, extraction: null }),
      });
    });

    const settingsDialog = await openMemorySettings(page);
    const dialog = await openMemoryAddDialog(page, 'Add manually', settingsDialog);
    await dialog.getByRole('button', { name: 'New memory' }).click();
    await dialog.getByPlaceholder('e.g. UI preferences').fill('UI preferences');
    await dialog.getByPlaceholder('One sentence — what is this memory about?').fill(
      'Persistent rendering preferences',
    );
    await dialog
      .getByPlaceholder(/- Rule one[\s\S]*When to apply: optional scope/)
      .fill('- Prefer dark mode');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog).toBeHidden();
    await expect(settingsDialog.locator('.library-card', { hasText: 'UI preferences' })).toBeVisible();

    await settingsDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const reopened = await openMemorySettings(page);
    await expect(reopened.getByText('UI preferences')).toBeVisible();
    await expect(reopened.getByText('Persistent rendering preferences')).toBeVisible();
  });

  test('[P1] disables memory injection and keeps the disabled banner after reopening settings', async ({ page }) => {
    await seedSettingsBase(page);

    let enabled = true;

    await page.route('**/api/memory', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }),
      });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ extractions: [] }),
      });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    await page.route('**/api/memory/config', async (route) => {
      const payload = route.request().postDataJSON() as { enabled?: boolean };
      if (typeof payload.enabled === 'boolean') enabled = payload.enabled;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled, extraction: null }),
      });
    });

    const dialog = await openMemorySettings(page);
    await dialog.getByLabel('Enable memory injection').uncheck();
    await expect(dialog.locator('.memory-disabled-banner')).toBeVisible();

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    const reopened = await openMemorySettings(page);
    await expect(reopened.locator('.memory-disabled-banner')).toBeVisible();
  });

  test('[P1] toggles Learn from chats and keeps the setting after reopening Memory', async ({ page }) => {
    await seedSettingsBase(page);

    let enabled = true;
    let chatExtractionEnabled = true;

    await page.route('**/api/memory', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled,
          chatExtractionEnabled,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }),
      });
    });

    await page.route('**/api/memory/tree', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tree: [] }),
      });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ extractions: [] }),
      });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    await page.route('**/api/memory/config', async (route) => {
      const payload = route.request().postDataJSON() as {
        enabled?: boolean;
        chatExtractionEnabled?: boolean;
      };
      if (typeof payload.enabled === 'boolean') enabled = payload.enabled;
      if (typeof payload.chatExtractionEnabled === 'boolean') {
        chatExtractionEnabled = payload.chatExtractionEnabled;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled, chatExtractionEnabled, extraction: null }),
      });
    });

    const dialog = await openMemorySettings(page);

    await dialog.getByRole('tab', { name: 'How it works' }).click();
    const toggle = dialog.getByRole('checkbox', {
      name: 'Learn from chats',
    });

    await expect(toggle).toBeChecked();
    await dialog.getByTitle('Learn from chats').click();
    await expect(toggle).not.toBeChecked();

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    const reopened = await openMemorySettings(page);
    await reopened.getByRole('tab', { name: 'How it works' }).click();
    await expect(
      reopened.getByRole('checkbox', { name: 'Learn from chats' }),
    ).not.toBeChecked();
  });

  test('[P1] refreshes and clears extraction history from Saved memory', async ({ page }) => {
    await seedSettingsBase(page);

    await page.addInitScript(() => {
      window.confirm = () => true;
    });

    let extractions = [
      {
        id: 'ex-1',
        phase: 'success',
        kind: 'llm',
        startedAt: Date.now(),
        finishedAt: Date.now() + 1200,
        userMessagePreview: 'Remember I prefer dark mode',
        proposedCount: 1,
        writtenCount: 1,
      },
    ];
    let extractionReads = 0;

    await page.route('**/api/memory', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          chatExtractionEnabled: true,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }),
      });
    });

    await page.route('**/api/memory/tree', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tree: [] }),
      });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        extractionReads += 1;
        const payload =
          extractionReads <= 2
            ? extractions
            : extractions.map((record, index) => ({
                ...record,
                userMessagePreview: index === 0 ? 'Remember I prefer dense dashboards' : record.userMessagePreview,
              }));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ extractions: payload }),
        });
        return;
      }
      if (method === 'DELETE') {
        extractions = [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ removed: 1 }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    const dialog = await openMemorySettings(page);
    await expect(dialog.getByText('Remember I prefer dark mode')).toBeVisible();

    await dialog.getByRole('button', { name: 'Refresh' }).click();
    await expect(dialog.getByText('Remember I prefer dense dashboards')).toBeVisible();

    await dialog.getByRole('button', { name: 'Clear' }).click();
    await expect(dialog.getByText('Remember I prefer dense dashboards')).toHaveCount(0);
  });

  test('[P1] keeps the memory editor open when creating a memory entry fails', async ({ page }) => {
    await seedSettingsBase(page);

    await page.route('**/api/memory', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            rootDir: '/tmp/memory',
            index: '# Memory\n',
            entries: [],
            extraction: null,
          }),
        });
        return;
      }
      if (method === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'provider unavailable' }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ extractions: [] }),
      });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    const settingsDialog = await openMemorySettings(page);
    const dialog = await openMemoryAddDialog(page, 'Add manually', settingsDialog);

    await dialog.getByRole('button', { name: 'New memory' }).click();
    await dialog.getByPlaceholder('e.g. UI preferences').fill('UI preferences');
    await dialog.getByPlaceholder('One sentence — what is this memory about?').fill(
      'Persistent rendering preferences',
    );
    await dialog
      .getByPlaceholder(/- Rule one[\s\S]*When to apply: optional scope/)
      .fill('- Prefer dark mode');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog.getByPlaceholder('e.g. UI preferences')).toHaveValue('UI preferences');
    await expect(dialog.locator('.memory-flash-pill')).toHaveCount(0);
    await expect(settingsDialog.getByText('No memory yet.')).toBeVisible();
  });

});
