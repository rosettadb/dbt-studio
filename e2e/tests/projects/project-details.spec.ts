/**
 * Project Details Screen Tests
 *
 * The /app route once a project is open: side panel tabs, the empty editor,
 * the file tree root, and the Create Pipeline modal (blank template only, as
 * community templates need GitHub).
 */

import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';

const PROJECT = 'test_project';

const openCreatePipelineModal = async (window: Page) => {
  // The sidebar button is wrapped in a tooltip, which becomes its name
  await window
    .getByRole('button', {
      name: /Create a pipeline to run jobs on the cloud|Create Pipeline/,
    })
    .first()
    .click();
  const dialog = window.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('Project Details', () => {
  test('should show the explorer panel tabs and the empty editor', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);

    await expect(window.getByRole('tab', { name: 'Explorer' })).toBeVisible();
    await expect(window.getByRole('tab', { name: 'Search' })).toBeVisible();
    await expect(window.getByRole('tab', { name: /Git/ })).toBeVisible();
    await expect(window.getByRole('tab', { name: 'Database' })).toBeVisible();

    await expect(
      window.getByText('Please select a file from the explorer on the left!'),
    ).toBeVisible();
  });

  test('should list the project folder in the file tree', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);

    await expect(window.getByTitle(PROJECT).first()).toBeVisible();
    await expect(window.getByTitle('rosetta').first()).toBeVisible();
    await expect(
      window.getByPlaceholder('Search files or folders...'),
    ).toBeVisible();
  });

  test('should show the Database tab state for the linked connection', async ({
    electronApp,
  }) => {
    const window = await openProject(electronApp, PROJECT);

    await window.getByRole('tab', { name: 'Database' }).click();

    await expect(window.getByText('Active Connection')).toBeVisible();
    await expect(window.getByText('test_db')).toBeVisible();
    await expect(window.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Change Connection' }),
    ).toBeVisible();
  });

  test.describe('Create Pipeline modal', () => {
    test('should list the built-in templates and gate Next on a selection', async ({
      electronApp,
    }) => {
      const window = await openProject(electronApp, PROJECT);
      const dialog = await openCreatePipelineModal(window);

      await expect(dialog.getByText('Create Pipeline')).toBeVisible();
      await expect(dialog.getByText('Create Blank')).toBeVisible();
      // exact: the file path caption also contains "generic"
      await expect(dialog.getByText('Generic', { exact: true })).toBeVisible();
      await expect(dialog.getByText('Browse Templates')).toBeVisible();

      const next = dialog.getByRole('button', { name: 'Next' });
      await expect(next).toBeDisabled();

      await dialog.getByText('Generic', { exact: true }).click();
      await expect(next).toBeEnabled();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
    });

    test('should create a blank pipeline file on disk', async ({
      electronApp,
      userData,
    }) => {
      const window = await openProject(electronApp, PROJECT);
      const pipelineFile = path.join(
        userData,
        'projects',
        PROJECT,
        'rosetta',
        'pipelines',
        'pipeline-blank.yml',
      );
      expect(fs.existsSync(pipelineFile)).toBe(false);

      const dialog = await openCreatePipelineModal(window);
      await dialog.getByText('Create Blank').click();
      await dialog.getByRole('button', { name: 'Next' }).click();

      await expect(dialog.getByText('Choose Location')).toBeVisible();
      await expect(
        dialog.getByText('Pipeline will be created at:'),
      ).toBeVisible();
      await dialog
        .getByRole('button', { name: 'Create Pipeline', exact: true })
        .click();

      await expect(
        window
          .locator('.Toastify__toast--success')
          .filter({ hasText: 'Pipeline created successfully.' }),
      ).toBeVisible();
      await expect(dialog).toBeHidden();
      await expect.poll(() => fs.existsSync(pipelineFile)).toBe(true);
      expect(fs.readFileSync(pipelineFile, 'utf8')).toContain(
        'name: "Pipeline"',
      );

      // The new file shows up in the tree
      await expect(
        window.getByText('pipeline-blank.yml').first(),
      ).toBeVisible();
    });

    test('should warn before overriding an existing pipeline', async ({
      electronApp,
      userData,
    }) => {
      const window = await openProject(electronApp, PROJECT);
      const pipelinesDir = path.join(
        userData,
        'projects',
        PROJECT,
        'rosetta',
        'pipelines',
      );
      const pipelineFile = path.join(pipelinesDir, 'pipeline-blank.yml');

      // Seed an existing pipeline with the same file name
      fs.mkdirSync(pipelinesDir, { recursive: true });
      fs.writeFileSync(pipelineFile, 'name: "Existing"\njobs: []\n');

      const dialog = await openCreatePipelineModal(window);
      await dialog.getByText('Create Blank').click();
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog
        .getByRole('button', { name: 'Create Pipeline', exact: true })
        .click();

      await expect(window.getByText('Pipeline Already Exists')).toBeVisible();

      // Cancelling keeps the original content
      await window
        .getByRole('dialog')
        .filter({ hasText: 'Pipeline Already Exists' })
        .getByRole('button', { name: 'Cancel' })
        .click();
      await expect(window.getByText('Pipeline Already Exists')).toBeHidden();
      expect(fs.readFileSync(pipelineFile, 'utf8')).toContain('Existing');
    });
  });
});
