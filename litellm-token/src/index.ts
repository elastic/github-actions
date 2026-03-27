import * as path from 'node:path';

import * as core from '@actions/core';

import { mintInputSchema } from './schema';
import { mintLiteLLMToken, mintedApiKeyStateKey } from './litellmToken';

export async function run() {
  const rawInputs = {
    baseUrl: core.getInput('base-url', { required: true }),
    masterKey: core.getInput('master-key', { required: true }),
    models: core.getInput('models', { required: true }),
    keyTTL: core.getInput('key-ttl') || '15m',
    maxBudget: core.getInput('max-budget') || '5',
    metadata: core.getMultilineInput('metadata', { trimWhitespace: true }),
  };

  core.setSecret(rawInputs.masterKey);

  const parsedInputs = mintInputSchema.safeParse(rawInputs);
  if (!parsedInputs.success) {
    throw new Error(parsedInputs.error.issues[0]?.message ?? 'Invalid LiteLLM token inputs.');
  }

  const inputs = parsedInputs.data;
  const apiKey = await mintLiteLLMToken(inputs);

  core.setSecret(apiKey);
  core.saveState(mintedApiKeyStateKey, apiKey);
  core.setOutput('api_key', apiKey);
  core.info('Minted LiteLLM token.');
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
