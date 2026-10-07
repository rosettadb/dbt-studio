/**
 * ChatGPT subscription sign-in (Plan 71) in the Add AI Provider dialog.
 *
 * The browser login and provider save are replaced in the main process, so
 * the test needs no ChatGPT account, no network and no keychain. It checks
 * the dialog: the sign-in button replaces the API key, the waiting gate,
 * cancel, a completed sign-in, and that Create Provider sends only the
 * pending login ID (never a key) and doesn't activate the provider.
 */

import { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/electron-seeded.fixture';
import { openProject } from '../../helpers/window.helper';
import { NavigationSidebarComponent } from '../../page-objects/components/NavigationSidebar';

type SavedProvider = {
  name: string;
  type: string;
  config: string;
  isActive?: boolean;
};

const mockChatGptMainProcess = (electronApp: ElectronApplication) =>
  electronApp.evaluate(({ ipcMain }) => {
    const state: {
      finish?: (result: unknown) => void;
      correlationId?: string;
      send?: (payload: unknown) => void;
      saved: unknown[];
    } = { saved: [] };
    (global as any).chatGptE2E = state;

    ipcMain.removeHandler('ai:chatgpt-auth:start');
    ipcMain.handle('ai:chatgpt-auth:start', (event, request) => {
      state.correlationId = request.correlationId;
      state.send = (payload) =>
        event.sender.send('ai:chatgpt-auth:event', payload);
      state.send({ correlationId: request.correlationId, status: 'started' });
      state.send({
        correlationId: request.correlationId,
        status: 'waiting_for_browser',
      });
      return new Promise((resolve) => {
        state.finish = resolve;
      });
    });

    ipcMain.removeHandler('ai:chatgpt-auth:cancel');
    ipcMain.handle('ai:chatgpt-auth:cancel', (_event, correlationId) => {
      state.send?.({
        correlationId,
        status: 'cancelled',
        error: 'Sign-in cancelled.',
      });
      state.finish?.({ ok: false, message: 'Sign-in cancelled.' });
    });

    ipcMain.removeHandler('ai:chatgpt-auth:discard-pending');
    ipcMain.handle('ai:chatgpt-auth:discard-pending', () => undefined);

    ipcMain.removeHandler('ai:provider:save');
    ipcMain.handle('ai:provider:save', (_event, provider) => {
      state.saved.push(provider);
      return { id: 99, ...provider };
    });
  });

const completeSignIn = (electronApp: ElectronApplication) =>
  electronApp.evaluate(() => {
    const state = (global as any).chatGptE2E;
    if (!state?.send) throw new Error('mocked sign-in handler was not called');
    state.send({ correlationId: state.correlationId, status: 'completed' });
    state.finish({
      ok: true,
      loginId: 'login-1',
      email: 'ada@example.com',
      planType: 'plus',
    });
  });

const savedProviders = (electronApp: ElectronApplication) =>
  electronApp.evaluate(
    () => (global as any).chatGptE2E.saved as SavedProvider[],
  );

const openAddProviderDialog = async (electronApp: ElectronApplication) => {
  const window = await openProject(electronApp, 'test_project');
  // Opening a project re-registers the AI handlers, so replace them after.
  await mockChatGptMainProcess(electronApp);
  await new NavigationSidebarComponent(window).goToSettings();
  await window.getByText('AI Settings', { exact: true }).click();
  await window.getByRole('button', { name: 'Add Your First Provider' }).click();
  const dialog = window.getByRole('dialog', { name: /Add AI Provider/ });
  await expect(dialog).toBeVisible();
  return { window, dialog };
};

const chooseChatGpt = async (window: Page) => {
  const dialog = window.getByRole('dialog', { name: /Add AI Provider/ });
  await dialog.getByRole('combobox').first().click();
  await window
    .getByRole('option', { name: /ChatGPT \(subscription\)/ })
    .click();
};

test.describe('ChatGPT subscription sign-in', () => {
  test('replaces the API key with a sign-in button', async ({
    electronApp,
  }) => {
    const { window, dialog } = await openAddProviderDialog(electronApp);

    await chooseChatGpt(window);

    await expect(dialog.getByLabel('Provider Name')).toHaveValue('ChatGPT');
    await expect(
      dialog.getByRole('button', { name: 'Sign in with ChatGPT' }),
    ).toBeVisible();
    await expect(dialog.getByLabel(/API Key/)).toHaveCount(0);
    await expect(
      dialog.getByText('Sign in with ChatGPT to test'),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Create Provider' }),
    ).toBeDisabled();
  });

  test('cancels, signs in, and creates an inactive provider without a key', async ({
    electronApp,
  }) => {
    const { window, dialog } = await openAddProviderDialog(electronApp);
    await chooseChatGpt(window);

    // Waiting gate, then Cancel.
    await dialog.getByRole('button', { name: 'Sign in with ChatGPT' }).click();
    await expect(
      window.getByText('Finish signing in in your browser.'),
    ).toBeVisible();
    await window
      .getByRole('button', { name: 'Cancel', exact: true })
      .last()
      .click();
    await expect(
      window.getByText('Finish signing in in your browser.'),
    ).toBeHidden();
    await expect(dialog.getByText('Sign-in cancelled.')).toBeVisible();

    // Sign in again and complete it.
    await dialog.getByRole('button', { name: 'Sign in with ChatGPT' }).click();
    await expect(
      window.getByText('Finish signing in in your browser.'),
    ).toBeVisible();
    await completeSignIn(electronApp);
    await expect(dialog.getByText('ada@example.com')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Use a different account' }),
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Create Provider' }).click();
    await expect(dialog).toBeHidden();

    const saved = await savedProviders(electronApp);
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('openai-codex');
    expect(saved[0].isActive).toBe(false);
    const config = JSON.parse(saved[0].config);
    expect(config).toMatchObject({
      pendingLoginId: 'login-1',
      accountEmail: 'ada@example.com',
      planType: 'plus',
    });
    expect(config).not.toHaveProperty('apiKey');
  });
});
