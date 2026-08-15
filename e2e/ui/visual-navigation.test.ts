import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import {
  captureVisual,
  configureVisualPage,
  gotoVisualHome,
  waitForVisualFonts,
} from '@/playwright/visual';

test('[P2] captures the projects page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-projects').click();
  await expect(page).toHaveURL(/\/projects$/);
  const projects = page.getByTestId('entry-view-projects');
  await expect(projects.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(projects.getByText('Launchpad dashboard').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-projects');
});

test('[P2] captures the projects kanban surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-projects').click();
  const projects = page.getByTestId('entry-view-projects');
  await projects.getByTestId('designs-view-kanban').click();
  await expect(projects.getByTestId('designs-view-kanban')).toHaveAttribute('aria-pressed', 'true');
  await expect(projects.getByText('Launchpad dashboard').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-projects-kanban');
});

test('[P2] captures the design systems page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await expect(page.getByTestId('design-systems-tab')).toBeVisible();
  await page.getByRole('tab', { name: 'Official presets' }).click();
  await expect(page.getByTestId('design-system-card-agentic')).toBeVisible();
  await expect(page.getByTestId('design-system-card-airbnb')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-design-systems');
});

test('[P2] captures the design system detail preview surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await page.getByRole('tab', { name: 'Official presets' }).click();
  await page.getByTestId('design-system-card-agentic').click();
  const detail = page.getByTestId('design-system-detail-agentic');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('design-kit-view-agentic')).toBeVisible();
  await expect(detail.getByTestId('design-kit-logo-section')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-design-system-detail');
});
