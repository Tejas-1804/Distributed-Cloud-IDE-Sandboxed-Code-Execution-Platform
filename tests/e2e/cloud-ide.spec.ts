import { expect, test } from '@playwright/test';

test.describe('Distributed Cloud IDE E2E Flow', () => {
  test('opens dashboard, creates workspace, runs JavaScript in local worker, and views monitoring', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Your development workspace.')).toBeVisible();

    await page.getByRole('button', { name: /New workspace/i }).click();
    await page.getByPlaceholder('e.g., api-sandbox').fill(`E2E-JS-${Date.now()}`);
    await page.getByRole('button', { name: /JavaScript/i }).click();
    await page.getByRole('button', { name: /Create workspace/i }).click();

    await expect(page).toHaveURL(/\/workspace\//);
    await expect(page.getByRole('button', { name: /^Run$/i })).toBeVisible();

    // Switch execution mode to Local Worker so E2E executes cleanly even without Docker
    await page.getByLabel('Execution mode').selectOption('local');
    await page.getByRole('button', { name: /^Run$/i }).click();

    await expect(page.getByText('Completed')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Monitoring Dashboard/i }).click();
    await expect(page).toHaveURL(/\/monitoring/);
    await expect(page.getByText('Platform Monitoring & Telemetry')).toBeVisible();
  });
});
