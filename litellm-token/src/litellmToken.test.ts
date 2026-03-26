import axios, { AxiosError } from 'axios';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getGitHubRuntimeMetadata, mintLiteLLMToken, revokeLiteLLMToken } from './litellmToken';
import { mintInputSchema, revokeInputSchema } from './schema';

const BASE_URL = 'https://litellm.example.com';
const MASTER_KEY = 'sk-master';
const MODEL = 'llm-gateway/claude-opus-4-5';
const KEY_TTL = '30m';
const MAX_BUDGET = '2.5';
const DEFAULT_BUDGET = '5';
const INVALID_BUDGET = 'not-a-number';
const GENERATED_API_KEY = 'sk-short-lived';
const GITHUB_REPOSITORY = 'elastic/kibana';
const GITHUB_SERVER_URL = 'https://github.com';
const GITHUB_RUN_ID = '12345';
const GITHUB_RUN_ATTEMPT = '2';
const GITHUB_WORKFLOW = 'reviewer:claude';
const GITHUB_ACTOR = 'reviewer-bot';
const GITHUB_EVENT_NAME = 'pull_request_target';
const GITHUB_PR_NUMBER = 42;
const REVIEW_METADATA = ['purpose=claude-review', 'owner=security-ai'];
const DEFAULT_MINT_RAW_INPUTS = {
  baseUrl: BASE_URL,
  masterKey: MASTER_KEY,
  models: MODEL,
  keyTTL: KEY_TTL,
  maxBudget: MAX_BUDGET,
};
const DEFAULT_REVOKE_RAW_INPUTS = {
  baseUrl: BASE_URL,
  masterKey: MASTER_KEY,
  apiKey: GENERATED_API_KEY,
};

describe('litellmToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getGitHubRuntimeMetadata', () => {
    it('reads workflow metadata and pull request number from the event payload', () => {
      const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'litellm-token-'));
      const eventPath = path.join(eventDir, 'event.json');
      const originalEnv = {
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
        GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW,
        GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
        GITHUB_RUN_ATTEMPT: process.env.GITHUB_RUN_ATTEMPT,
        GITHUB_ACTOR: process.env.GITHUB_ACTOR,
        GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
        GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
        GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
      };

      try {
        process.env.GITHUB_REPOSITORY = GITHUB_REPOSITORY;
        process.env.GITHUB_WORKFLOW = GITHUB_WORKFLOW;
        process.env.GITHUB_RUN_ID = GITHUB_RUN_ID;
        process.env.GITHUB_RUN_ATTEMPT = GITHUB_RUN_ATTEMPT;
        process.env.GITHUB_ACTOR = GITHUB_ACTOR;
        process.env.GITHUB_EVENT_NAME = GITHUB_EVENT_NAME;
        process.env.GITHUB_EVENT_PATH = eventPath;
        process.env.GITHUB_SERVER_URL = GITHUB_SERVER_URL;
        fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: GITHUB_PR_NUMBER } }));

        const metadata = getGitHubRuntimeMetadata();

        expect(metadata).toEqual({
          github_repo: GITHUB_REPOSITORY,
          github_workflow: GITHUB_WORKFLOW,
          github_run_id: GITHUB_RUN_ID,
          github_run_attempt: GITHUB_RUN_ATTEMPT,
          github_actor: GITHUB_ACTOR,
          github_event_name: GITHUB_EVENT_NAME,
          github_workflow_run_url: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
          github_pull_request_number: GITHUB_PR_NUMBER,
        });
      } finally {
        restoreEnvVar('GITHUB_REPOSITORY', originalEnv.GITHUB_REPOSITORY);
        restoreEnvVar('GITHUB_WORKFLOW', originalEnv.GITHUB_WORKFLOW);
        restoreEnvVar('GITHUB_RUN_ID', originalEnv.GITHUB_RUN_ID);
        restoreEnvVar('GITHUB_RUN_ATTEMPT', originalEnv.GITHUB_RUN_ATTEMPT);
        restoreEnvVar('GITHUB_ACTOR', originalEnv.GITHUB_ACTOR);
        restoreEnvVar('GITHUB_EVENT_NAME', originalEnv.GITHUB_EVENT_NAME);
        restoreEnvVar('GITHUB_EVENT_PATH', originalEnv.GITHUB_EVENT_PATH);
        restoreEnvVar('GITHUB_SERVER_URL', originalEnv.GITHUB_SERVER_URL);
        fs.rmSync(eventDir, { force: true, recursive: true });
      }
    });
  });

  describe('mintInputSchema', () => {
    it('normalizes trailing slashes in base-url', () => {
      expect(
        parseMintInput({
          baseUrl: `${BASE_URL}///`,
        }).baseUrl,
      ).toBe(BASE_URL);
    });

    it('throws when no models are provided', () => {
      const result = mintInputSchema.safeParse({
        ...DEFAULT_MINT_RAW_INPUTS,
        models: ' ,  , ',
      });

      expectValidationFailure(result, 'models');
    });

    it('parses metadata entries into a flat string map', () => {
      const parsed = parseMintInput({
        metadata: [...REVIEW_METADATA, 'pr=1234'],
      });

      expect(parsed.metadata).toEqual({
        owner: 'security-ai',
        pr: '1234',
        purpose: 'claude-review',
      });
    });

    it('throws when metadata does not use key=value format', () => {
      const result = mintInputSchema.safeParse({
        ...DEFAULT_MINT_RAW_INPUTS,
        metadata: ['not-a-pair'],
      });

      expectValidationFailure(result, 'metadata');
    });

    it('throws when a metadata key is blank', () => {
      const result = mintInputSchema.safeParse({
        ...DEFAULT_MINT_RAW_INPUTS,
        metadata: [' =claude-review'],
      });

      expectValidationFailure(result, 'metadata');
    });

    it('throws when a metadata entry is empty', () => {
      const result = mintInputSchema.safeParse({
        ...DEFAULT_MINT_RAW_INPUTS,
        metadata: ['purpose=claude-review', '   '],
      });

      expectValidationFailure(result, 'metadata');
    });

    it('throws when max-budget is not a valid number', () => {
      const result = mintInputSchema.safeParse({
        ...DEFAULT_MINT_RAW_INPUTS,
        maxBudget: INVALID_BUDGET,
      });

      expectValidationFailure(result, 'maxBudget');
    });
  });

  describe('mintLiteLLMToken', () => {
    it('posts a mint request and returns the generated key details', async () => {
      const originalEnv = {
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
        GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
        GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
      };
      const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { key: GENERATED_API_KEY },
      } as Awaited<ReturnType<typeof axios.post>>);

      try {
        process.env.GITHUB_REPOSITORY = GITHUB_REPOSITORY;
        process.env.GITHUB_RUN_ID = GITHUB_RUN_ID;
        process.env.GITHUB_SERVER_URL = GITHUB_SERVER_URL;

        const apiKey = await mintLiteLLMToken(parseMintInput({ metadata: REVIEW_METADATA }));

        expect(postSpy).toHaveBeenCalledWith(
          `${BASE_URL}/key/generate`,
          expect.objectContaining({
            models: [MODEL],
            duration: KEY_TTL,
            max_budget: 2.5,
            metadata: expect.objectContaining({
              github_repo: GITHUB_REPOSITORY,
              github_run_id: GITHUB_RUN_ID,
              github_workflow_run_url: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
              owner: 'security-ai',
              purpose: 'claude-review',
            }),
          }),
          {
            headers: {
              Authorization: `Bearer ${MASTER_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 30_000,
          },
        );
        expect(apiKey).toBe(GENERATED_API_KEY);
      } finally {
        restoreEnvVar('GITHUB_REPOSITORY', originalEnv.GITHUB_REPOSITORY);
        restoreEnvVar('GITHUB_RUN_ID', originalEnv.GITHUB_RUN_ID);
        restoreEnvVar('GITHUB_SERVER_URL', originalEnv.GITHUB_SERVER_URL);
      }
    });

    it('wraps mint transport failures without exposing the master key', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(
        createAxiosError(403, { message: 'denied' }, 'Request failed'),
      );

      const error = await getThrownError(mintLiteLLMToken(parseMintInput({ maxBudget: DEFAULT_BUDGET })));

      expect(error).toBeInstanceOf(Error);
      expect(error.message).not.toContain(MASTER_KEY);
      expect(error.cause).toBeInstanceOf(AxiosError);
      expect((error.cause as AxiosError).response?.status).toBe(403);
    });

    it('throws when the mint response is not a JSON object', async () => {
      vi.spyOn(axios, 'post').mockResolvedValue({
        data: ['bad-response'],
      } as Awaited<ReturnType<typeof axios.post>>);

      await expect(mintLiteLLMToken(parseMintInput({ maxBudget: DEFAULT_BUDGET }))).rejects.toBeInstanceOf(
        Error,
      );
    });

    it('throws when the mint response key is blank', async () => {
      vi.spyOn(axios, 'post').mockResolvedValue({
        data: { key: '   ' },
      } as Awaited<ReturnType<typeof axios.post>>);

      await expect(mintLiteLLMToken(parseMintInput({ maxBudget: DEFAULT_BUDGET }))).rejects.toBeInstanceOf(
        Error,
      );
    });
  });

  describe('revokeLiteLLMToken', () => {
    it('deletes the api key when delete succeeds', async () => {
      const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { deleted: true },
      } as Awaited<ReturnType<typeof axios.post>>);

      await revokeLiteLLMToken(parseRevokeInput());

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith(
        `${BASE_URL}/key/delete`,
        { keys: [GENERATED_API_KEY] },
        {
          headers: {
            Authorization: `Bearer ${MASTER_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
    });

    it('blocks the api key when delete fails recoverably', async () => {
      const postSpy = vi
        .spyOn(axios, 'post')
        .mockRejectedValueOnce(createAxiosError(404, { message: 'key not found' }))
        .mockResolvedValueOnce({
          data: { blocked: true },
        } as Awaited<ReturnType<typeof axios.post>>);

      await revokeLiteLLMToken(parseRevokeInput());

      expect(postSpy).toHaveBeenCalledTimes(2);
      expect(postSpy).toHaveBeenNthCalledWith(
        1,
        `${BASE_URL}/key/delete`,
        { keys: [GENERATED_API_KEY] },
        {
          headers: {
            Authorization: `Bearer ${MASTER_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
      expect(postSpy).toHaveBeenNthCalledWith(
        2,
        `${BASE_URL}/key/block`,
        { key: GENERATED_API_KEY },
        {
          headers: {
            Authorization: `Bearer ${MASTER_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
    });

    it('throws combined diagnostics when delete and block both fail recoverably', async () => {
      vi.spyOn(axios, 'post')
        .mockRejectedValueOnce(createAxiosError(404, { message: 'api key not found' }))
        .mockRejectedValueOnce(createAxiosError(400, { message: 'already blocked' }));

      const error = await getThrownError(revokeLiteLLMToken(parseRevokeInput()));

      expect(error).toBeInstanceOf(Error);
      expect(error.cause).toBeInstanceOf(AxiosError);
      expect((error.cause as AxiosError).response?.status).toBe(400);
    });
  });
});

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function parseMintInput(overrides: Partial<typeof DEFAULT_MINT_RAW_INPUTS & { metadata?: string[] }> = {}) {
  return mintInputSchema.parse({
    ...DEFAULT_MINT_RAW_INPUTS,
    ...overrides,
  });
}

function parseRevokeInput(overrides: Partial<typeof DEFAULT_REVOKE_RAW_INPUTS> = {}) {
  return revokeInputSchema.parse({
    ...DEFAULT_REVOKE_RAW_INPUTS,
    ...overrides,
  });
}

function expectValidationFailure(result: ReturnType<typeof mintInputSchema.safeParse>, expectedPath: string) {
  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(result.error.issues).toHaveLength(1);
  expect(result.error.issues[0]?.path).toEqual([expectedPath]);
}

async function getThrownError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as Error & { cause?: unknown };
  }

  throw new Error('Expected promise to reject.');
}

function createAxiosError(status: number, data: unknown, message = 'Request failed'): AxiosError {
  return new AxiosError(
    message,
    'ERR_BAD_REQUEST',
    {
      headers: { Authorization: 'Bearer sk-master' },
      timeout: 30_000,
    } as any,
    undefined,
    {
      status,
      data,
      statusText: 'Request failed',
      headers: {},
      config: {} as any,
    } as any,
  );
}
