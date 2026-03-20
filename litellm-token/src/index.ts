import * as core from '@actions/core';

import { actionInputSchema } from './schema';
import { mintLiteLLMToken, revokeLiteLLMToken } from './litellmToken';

export async function run() {
  const rawInputs = {
    operation: core.getInput('operation', { required: true }).trim().toLowerCase(),
    baseUrl: core.getInput('base-url', { required: true }),
    masterKey: core.getInput('master-key', { required: true }),
    keyTTL: core.getInput('key-ttl') || '15m',
    maxBudget: core.getInput('max-budget') || '5',
    models: core.getInput('models'),
    metadata: core.getInput('metadata') || undefined,
    apiKey: core.getInput('api-key'),
  };

  maskSecret(rawInputs.masterKey);
  maskSecret(rawInputs.apiKey);

  if (rawInputs.operation !== 'mint' && rawInputs.operation !== 'revoke') {
    throw new Error(`Unsupported operation "${rawInputs.operation}". Expected "mint" or "revoke".`);
  }

  const parsedInputs = actionInputSchema.safeParse(rawInputs);
  if (!parsedInputs.success) {
    throw new Error(parsedInputs.error.issues[0]?.message ?? 'Invalid LiteLLM token inputs.');
  }

  const inputs = parsedInputs.data;

  if (inputs.operation === 'mint') {
    const apiKey = await mintLiteLLMToken(inputs);

    core.setSecret(apiKey);
    core.setOutput('api_key', apiKey);
    core.info('Minted LiteLLM token.');
    return;
  }

  if (inputs.operation === 'revoke') {
    await revokeLiteLLMToken(inputs);

    core.info('Revoked LiteLLM token.');
  }
}

function maskSecret(value: string | undefined) {
  if (value) {
    core.setSecret(value);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unexpected error';
}

if (require.main === module) {
  run().catch((error) => {
    core.setFailed(getErrorMessage(error));
  });
}
