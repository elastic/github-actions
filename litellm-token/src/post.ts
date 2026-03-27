import * as path from 'node:path';

import * as core from '@actions/core';

import { revokeInputSchema } from './schema';
import { revokeLiteLLMToken, mintedApiKeyStateKey } from './litellmToken';

export async function run() {
  const apiKey = core.getState(mintedApiKeyStateKey).trim();
  if (!apiKey) {
    core.info('No LiteLLM token was minted. Skipping post cleanup.');
    return;
  }

  const rawInputs = {
    baseUrl: core.getInput('base-url', { required: true }),
    masterKey: core.getInput('master-key', { required: true }),
    apiKey,
  };

  core.setSecret(rawInputs.masterKey);
  core.setSecret(rawInputs.apiKey);

  const parsedInputs = revokeInputSchema.safeParse(rawInputs);
  if (!parsedInputs.success) {
    throw new Error(parsedInputs.error.issues[0]?.message ?? 'Invalid LiteLLM cleanup inputs.');
  }

  const inputs = parsedInputs.data;
  await revokeLiteLLMToken(inputs);
  core.info('Revoked LiteLLM token.');
}

function isDirectExecution(): boolean {
  const scriptPath = process.argv[1];

  return scriptPath !== undefined && typeof __filename !== 'undefined' && path.resolve(scriptPath) === __filename;
}

if (isDirectExecution()) {
  void run().catch((error) => {
    core.setFailed(error instanceof Error ? error.message : 'Unexpected error');
  });
}
