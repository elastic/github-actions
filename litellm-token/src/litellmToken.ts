import axios, { AxiosError } from 'axios';
import * as fs from 'fs';

import {
  errorResponseSchema,
  mintResponseSchema,
  type JsonObject,
  type MintInputs,
  type RevokeInputs,
} from './schema';

const REQUEST_TIMEOUT_MS = 30_000;

export function getGitHubRuntimeMetadata(): JsonObject {
  const metadata: JsonObject = {};

  assignIfSet(metadata, 'github_repository', process.env.GITHUB_REPOSITORY);
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

export function buildMintRequestBody(inputs: MintInputs): JsonObject {
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
  let response;
  try {
    response = await axios.post(
      `${inputs.baseUrl}/key/generate`,
      buildMintRequestBody(inputs),
      buildRequestConfig(inputs.masterKey),
    );
  } catch (error) {
    throw wrapAxiosError(error, 'LiteLLM mint failed');
  }

  const parsedResponse = mintResponseSchema.safeParse(response.data);
  if (!parsedResponse.success) {
    throw new Error(
      parsedResponse.error.issues[0]?.path[0] === 'key'
        ? parsedResponse.error.issues[0]?.message ?? 'LiteLLM mint response key was missing or empty.'
        : 'LiteLLM mint response was not a JSON object.',
    );
  }

  return parsedResponse.data.key;
}

export async function revokeLiteLLMToken(inputs: RevokeInputs): Promise<void> {
  try {
    await axios.post(
      `${inputs.baseUrl}/key/delete`,
      { keys: [inputs.apiKey] },
      buildRequestConfig(inputs.masterKey),
    );
    return;
  } catch (deleteError) {
    if (!isRecoverableRevokeError(deleteError)) {
      throw wrapAxiosError(deleteError, 'LiteLLM revoke failed while deleting api key');
    }

    const deleteMessage = `delete by api key: ${formatAxiosError(deleteError)}`;

    try {
      await axios.post(
        `${inputs.baseUrl}/key/block`,
        { key: inputs.apiKey },
        buildRequestConfig(inputs.masterKey),
      );
      return;
    } catch (blockError) {
      if (!isRecoverableRevokeError(blockError)) {
        throw wrapAxiosError(blockError, 'LiteLLM revoke failed while blocking api key');
      }

      throw new Error(
        `LiteLLM token cleanup did not confirm revocation: ${deleteMessage} | block by api key: ${formatAxiosError(
          blockError,
        )}`,
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
    const parsedEvent = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as {
      number?: unknown;
      pull_request?: { number?: unknown };
    };

    const eventNumber = parsedEvent.pull_request?.number ?? parsedEvent.number;
    return typeof eventNumber === 'number' ? eventNumber : undefined;
  } catch (error) {
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

function buildRequestConfig(masterKey: string) {
  return {
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json',
    },
    timeout: REQUEST_TIMEOUT_MS,
  };
}

function isRecoverableRevokeError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  return status === 400 || status === 404 || status === 422;
}

function formatAxiosError(error: AxiosError): string {
  const status = error.response?.status;
  const data = error.response?.data;
  const parsedData = errorResponseSchema.safeParse(data);
  const responseMessage =
    typeof data === 'string' ? data : parsedData.success ? parsedData.data.message : error.message;

  return status ? `HTTP ${status}: ${responseMessage}` : responseMessage;
}

function wrapAxiosError(error: unknown, prefix: string): Error {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error : new Error(prefix);
  }

  return new Error(`${prefix}. ${formatAxiosError(error)}`);
}
