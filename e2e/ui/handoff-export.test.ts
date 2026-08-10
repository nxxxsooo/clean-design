import { applyStandardMocks } from '@/playwright/mock-factory';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import type { Page } from '@playwright/test';

test.describe.configure({ timeout: T.long });

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error('clipboard denied by test')),
      },
    });
    document.execCommand = () => false;
  });
});

test('[P1] completed handoff remains available when clipboard copy fails', async ({ page }) => {
  const { projectId, conversationId } = await createProject(page);
  await seedHtmlArtifact(page, projectId);
  const packetPath = '/Users/test/Handoffs/browser-handoff/20260810-120000-abcd1234';
  const prompt = '# Implement the approved Clean Design reference\n\nInspect the receiving repository first.';
  const packetRequests: string[] = [];

  await page.route(`**/api/projects/${projectId}/handoff-root`, async (route) => {
    await route.fulfill({ json: { configured: true, displayName: 'Handoffs' } });
  });
  await page.route(`**/api/projects/${projectId}/handoff-packet`, async (route) => {
    packetRequests.push(route.request().postData() ?? '');
    await route.fulfill({
      json: {
        ok: true,
        packetPath,
        prompt,
        manifest: {
          schemaVersion: 1,
          packetId: '20260810-120000-abcd1234',
          createdAt: '2026-08-10T12:00:00.000Z',
          project: {
            id: projectId,
            name: 'Browser handoff',
            slug: 'browser-handoff',
            kind: 'prototype',
          },
          viewports: [],
          files: [],
          warnings: [{ code: 'pptx_failed', message: 'Editable PPTX could not be produced.' }],
        },
        warnings: [{ code: 'pptx_failed', message: 'Editable PPTX could not be produced.' }],
      },
    });
  });

  await page.goto(`/projects/${projectId}/files/handoff-reference.html?conversation=${conversationId}`);
  const rootButton = page.getByRole('button', { name: 'Choose handoff folder' });
  await expect(rootButton).toHaveAttribute('title', 'Handoff folder: Handoffs');

  await page.getByTestId('handoff-trigger').click();

  await expect.poll(() => packetRequests.length).toBe(1);
  expect(packetRequests[0]).toBe('{}');
  await expect(page.getByText('Handoff exported')).toBeVisible();
  await expect(page.getByText(packetPath)).toBeVisible();
  await expect(page.getByText('Editable PPTX could not be produced.')).toBeVisible();
  await expect(page.getByText('Clipboard copy failed. Select the prompt below.')).toBeVisible();

  const fallback = page.locator('textarea.handoff-prompt-fallback');
  await expect(fallback).toHaveValue(prompt);
  await fallback.focus();
  await expect.poll(() => fallback.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    return [textarea.selectionStart, textarea.selectionEnd];
  })).toEqual([0, prompt.length]);
});

async function seedHtmlArtifact(page: Page, projectId: string): Promise<void> {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: 'handoff-reference.html',
      content: '<!doctype html><title>Handoff reference</title><main><h1>Approved reference</h1></main>',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Handoff reference',
        entry: 'handoff-reference.html',
        renderer: 'html',
        exports: ['html'],
      },
    },
    timeout: T.medium,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function createProject(page: Page): Promise<{ projectId: string; conversationId: string }> {
  const id = `handoff-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await page.request.post('/api/projects', {
    data: {
      id,
      name: 'Browser handoff',
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype', nameSource: 'user' },
    },
    timeout: T.medium,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json() as {
    project?: { id?: string };
    conversationId?: string;
  };
  if (!body.project?.id || !body.conversationId) {
    throw new Error(`project create response missing identifiers: ${JSON.stringify(body)}`);
  }
  return { projectId: body.project.id, conversationId: body.conversationId };
}
