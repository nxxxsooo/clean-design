import { expect, test } from '@/playwright/suite';
import { openNewProjectModal } from '@/playwright/rail';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

test.describe.configure({ timeout: T.xlong });

const IMAGE_TEMPLATE = {
  id: 'editorial-poster',
  surface: 'image',
  title: 'Editorial Poster',
  summary: 'A punchy launch poster for a product announcement.',
  category: 'Marketing',
  tags: ['poster', 'launch'],
  model: 'gpt-image-1',
  aspect: '4:5',
  source: {
    repo: 'clean-design/test-prompts',
    license: 'MIT',
    author: 'Clean Design QA',
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await routeAgents(page, [
    {
      id: 'mock',
      name: 'Mock Agent',
      bin: 'mock-agent',
      available: true,
      version: 'test',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);
});

test('[P1] prompt template retry preserves the edited body in project metadata', async ({ page }) => {
  let detailRequests = 0;
  await page.route('**/api/prompt-templates', async (route) => {
    await route.fulfill({ json: { promptTemplates: [IMAGE_TEMPLATE] } });
  });
  await page.route('**/api/prompt-templates/image/editorial-poster', async (route) => {
    detailRequests += 1;
    if (detailRequests === 1) {
      await route.fulfill({ status: 500, body: 'template unavailable' });
      return;
    }
    await route.fulfill({
      json: {
        promptTemplate: {
          ...IMAGE_TEMPLATE,
          prompt: 'Original poster prompt with dramatic type and product photography.',
        },
      },
    });
  });

  await gotoEntryHome(page);
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-media').click();
  await page.getByTestId('new-project-media-surface-image').click();
  await page.getByTestId('new-project-name').fill('Prompt template retry metadata');

  await page.getByTestId('prompt-template-trigger').click();
  await page.getByTestId('prompt-template-search').fill('poster');
  await page.getByRole('option', { name: /Editorial Poster/i }).click();

  await expect(page.getByTestId('prompt-template-error')).toBeVisible();
  await page.getByTestId('prompt-template-retry').click();
  await expect(page.getByTestId('prompt-template-error')).toHaveCount(0);
  await expect(page.getByTestId('prompt-template-body')).toContainText('Original poster prompt');

  await page.getByTestId('prompt-template-body').fill('');
  await expect(page.getByTestId('prompt-template-empty-hint')).toBeVisible();
  await page.getByTestId('prompt-template-body').fill(
    'Edited QA prompt: bold poster, one hero product, crisp headline.',
  );
  await expect(page.getByTestId('create-project')).toBeEnabled();
  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/projects') &&
    response.request().method() === 'POST',
  );
  await page.getByTestId('create-project').click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();

  const project = await fetchCurrentProject(page);
  expect(project.metadata?.promptTemplate).toMatchObject({
    id: 'editorial-poster',
    surface: 'image',
    title: 'Editorial Poster',
    prompt: 'Edited QA prompt: bold poster, one hero product, crisp headline.',
  });
});

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Clean Design…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.long });
}

async function fetchCurrentProject(page: Page) {
  await expect(page).toHaveURL(/\/projects\/[^/]+/);
  const url = new URL(page.url());
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  expect(projectId).toBeTruthy();

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: {
      metadata?: {
        promptTemplate?: {
          id: string;
          surface: string;
          title: string;
          prompt: string;
        };
      };
    };
  };
  return body.project;
}
