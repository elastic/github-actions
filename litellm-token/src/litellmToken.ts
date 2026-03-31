import { readFileSync } from 'node:fs';

import {
  errorResponseSchema,
  mintResponseSchema,
  type JsonObject,
  type MintInputs,
  type RevokeInputs,
} from './schema';

const REQUEST_TIMEOUT_MS = 30_000;

export const mintedApiKeyStateKey = 'minted_api_key';

export function getGitHubRuntimeMetadata(): JsonObject {
  const metadata: JsonObject = {};

  assignIfSet(metadata, 'github_repo', process.env.GITHUB_REPOSITORY);
  assignIfSet(metadata, 'github_workflow', process.env.GITHUB_WORKFLOW);
  assignIfSet(metadata, 'github_run_id', process.env.GITHUB_RUN_ID);
  assignIfSet(metadata, 'github_run_attempt', process.env.GITHUB_RUN_ATTEMPT);
  assignIfSet(metadata, 'github_actor', process.env.GITHUB_ACTOR);
  assignIfSet(metadata, 'github_event_name', process.env.GITHUB_EVENT_NAME);
  assignIfSet(metadata, 'github_workflow_run_url', getGitHubWorkflowRunUrl());

  const pullRequestNumber = getPullRequestNumber();
  if (pullRequestNumber !== undefined) {
    metadata.github_pull_request_number = pullRequestNumber;
  }

  return metadata;
}

function buildMintRequestBody(inputs: MintInputs): JsonObject {
  const requestBody: JsonObject = {
    models: inputs.models,
    duration: inputs.keyTTL,
    max_budget: inputs.maxBudget,
  };

  const mergedMetadata = {
    ...getGitHubRuntimeMetadata(),
    ...(inputs.metadata ?? {}),
  };

  if (Object.keys(mergedMetadata).length > 0) {
    requestBody.metadata = mergedMetadata;
  }

  return requestBody;
}

export async function mintLiteLLMToken(inputs: MintInputs): Promise<string> {
  try {
    const responseBody = await postJson(
      `${inputs.baseUrl}/key/generate`,
      buildMintRequestBody(inputs),
      inputs.masterKey,
    );

    const parsedResponse = mintResponseSchema.safeParse(responseBody);
    if (!parsedResponse.success) {
      throw new Error(
        parsedResponse.error.issues[0]?.path[0] === 'key'
          ? (parsedResponse.error.issues[0]?.message ?? 'LiteLLM mint response key was missing or empty.')
          : 'LiteLLM mint response was not a JSON object.',
      );
    }

    return parsedResponse.data.key;
  } catch (error) {
    throw wrapRequestError(error, 'LiteLLM mint failed');
  }
}

export async function revokeLiteLLMToken(inputs: RevokeInputs): Promise<void> {
  try {
    await postJson(`${inputs.baseUrl}/key/delete`, { keys: [inputs.apiKey] }, inputs.masterKey);
    return;
  } catch (deleteError) {
    if (!isRecoverableRevokeError(deleteError)) {
      throw wrapRequestError(deleteError, 'LiteLLM revoke failed while deleting api key');
    }

    const deleteMessage = `delete by api key: ${formatRequestError(deleteError)}`;

    try {
      await postJson(`${inputs.baseUrl}/key/block`, { key: inputs.apiKey }, inputs.masterKey);
      return;
    } catch (blockError) {
      if (!isRecoverableRevokeError(blockError)) {
        throw wrapRequestError(blockError, 'LiteLLM revoke failed while blocking api key');
      }

      throw new Error(
        `LiteLLM token cleanup did not confirm revocation: ${deleteMessage} | block by api key: ${formatRequestError(
          blockError,
        )}`,
        { cause: blockError },
      );
    }
  }
}

function getPullRequestNumber(): number | undefined {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return undefined;
  }

  try {
    const parsedEvent = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      number?: unknown;
      pull_request?: { number?: unknown };
    };

    const eventNumber = parsedEvent.pull_request?.number ?? parsedEvent.number;
    return typeof eventNumber === 'number' ? eventNumber : undefined;
  } catch {
    return undefined;
  }
}

function getGitHubWorkflowRunUrl(): string | undefined {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;

  if (!serverUrl || !repository || !runId) {
    return undefined;
  }

  return `${serverUrl.replace(/\/+$/, '')}/${repository}/actions/runs/${runId}`;
}

function assignIfSet(target: JsonObject, key: string, value: string | undefined) {
  if (value && value.trim().length > 0) {
    target[key] = value;
  }
}

function buildRequestInit(body: JsonObject, masterKey: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

async function postJson(url: string, body: JsonObject, masterKey: string): Promise<unknown> {
  try {
    const response = await fetch(url, buildRequestInit(body, masterKey));
    const responseBody = await parseResponseBody(response);
    if (!response.ok) {
      throw new LiteLLMRequestError(response.statusText || 'Request failed', {
        data: responseBody,
        status: response.status,
      });
    }

    return responseBody;
  } catch (error) {
    if (error instanceof LiteLLMRequestError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new LiteLLMRequestError(error.message, { cause: error });
    }

    throw error;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  if (rawBody.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function isRecoverableRevokeError(error: unknown): error is LiteLLMRequestError {
  if (!(error instanceof LiteLLMRequestError)) {
    return false;
  }

  return error.status === 400 || error.status === 404 || error.status === 422;
}

function formatRequestError(error: LiteLLMRequestError): string {
  const parsedData = errorResponseSchema.safeParse(error.data);
  const responseMessage = parsedData.success ? parsedData.data.message : error.message;

  return error.status ? `HTTP ${error.status}: ${responseMessage}` : responseMessage;
}

function wrapRequestError(error: unknown, prefix: string): Error {
  if (!(error instanceof LiteLLMRequestError)) {
    return error instanceof Error ? error : new Error(prefix);
  }

  return new Error(`${prefix}. ${formatRequestError(error)}`, { cause: error });
}

class LiteLLMRequestError extends Error {
  readonly data: unknown;
  readonly status?: number;

  constructor(message: string, options: { cause?: unknown; data?: unknown; status?: number } = {}) {
    super(message, { cause: options.cause });
    this.name = 'LiteLLMRequestError';
    this.data = options.data;
    this.status = options.status;
  }
}
