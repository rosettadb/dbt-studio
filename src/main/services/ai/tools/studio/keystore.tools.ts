import { tool } from 'ai';
import { z } from 'zod';
import SecureStorageService from '../../../secureStorage.service';

// Never store an empty string - SecureStorageService.setCredential treats an
// empty password as a delete, and an empty value also wouldn't be visible as
// a distinct entry in the "Run with env" keystore picker.
const PLACEHOLDER_SENTINEL = '__PLACEHOLDER__';

export function createStudioKeystoreTools() {
  return {
    studio_keystore_register_placeholder: tool({
      description:
        'Register a placeholder keystore entry (empty/dummy value, never a real secret) ' +
        'for an env var a pipeline needs (e.g. TF_VAR_project_id for a newly added ' +
        'terraform@v1 step), so it appears in the local "Run with env" dialog\'s keystore ' +
        'picker for the user to fill in with the real value later. Never call this with a ' +
        'real secret value - if the user has already told you the real value, ask them to ' +
        'enter it via the Run with env dialog or Settings > Keystore instead.',
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(200)
          .describe('Env var name, e.g. "TF_VAR_project_id"'),
        environment: z
          .string()
          .min(1)
          .max(100)
          .default('dev')
          .describe(
            'Environment group for the keystore tab, e.g. "dev", "stage", "prod"',
          ),
      }),
      execute: async ({ name, environment }) => {
        const key = `${environment}.${name}`;
        const existing = await SecureStorageService.getCredential(key);
        if (existing !== null) {
          return { success: true, key, created: false };
        }

        await SecureStorageService.setCredential(key, PLACEHOLDER_SENTINEL);

        const environments = await SecureStorageService.getEnvironments();
        if (!environments.includes(environment)) {
          await SecureStorageService.setEnvironments([
            ...environments,
            environment,
          ]);
        }

        return { success: true, key, created: true };
      },
    }),
  };
}

export const STUDIO_KEYSTORE_TOOL_NAMES = {
  studio_keystore_register_placeholder: true,
} as const;
