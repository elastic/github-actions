import axios, { AxiosError } from 'axios';
import * as fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildMintRequestBody,
  getGitHubRuntimeMetadata,
  mintLiteLLMToken,
  revokeLiteLLMToken,
} from './litellmToken';
import { mintInputSchema, revokeInputSchema } from './schema';

const eventPath = '/tmp/litellm-token-event.json';

describe('litellmToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getGitHubRuntimeMetadata', () => {
    it('reads workflow metadata and pull request number from the event payload', () => {
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
        process.env.GITHUB_REPOSITORY = 'elastic/kibana';
        process.env.GITHUB_WORKFLOW = 'reviewer:claude';
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_RUN_ATTEMPT = '2';
        process.env.GITHUB_ACTOR = 'reviewer-bot';
        process.env.GITHUB_EVENT_NAME = 'pull_request_target';
        process.env.GITHUB_EVENT_PATH = eventPath;
        process.env.GITHUB_SERVER_URL = 'https://github.com';
        fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 42 } }));

        const metadata = getGitHubRuntimeMetadata();

        expect(metadata).toEqual({
          github_repository: 'elastic/kibana',
          github_workflow: 'reviewer:claude',
          github_run_id: '12345',
          github_run_attempt: '2',
          github_actor: 'reviewer-bot',
          github_event_name: 'pull_request_target',
          github_workflow_run_url: 'https://github.com/elastic/kibana/actions/runs/12345',
          github_pull_request_number: 42,
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
        fs.rmSync(eventPath, { force: true });
      }
    });
  });

  describe('buildMintRequestBody', () => {
    it('merges runtime and explicit metadata into the mint payload', () => {
      const originalEnv = {
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
        GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
        GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
      };
      try {
        process.env.GITHUB_REPOSITORY = 'elastic/kibana';
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_SERVER_URL = 'https://github.com';

        expect(
          buildMintRequestBody(
            mintInputSchema.parse({
              baseUrl: 'https://litellm.example.com',
              masterKey: 'sk-master',
              models: 'llm-gateway/claude-opus-4-5',
              keyTTL: '30m',
              maxBudget: '2.5',
              metadata: '{"purpose":"claude-review"}',
            }),
          ),
        ).toEqual({
          models: ['llm-gateway/claude-opus-4-5'],
          duration: '30m',
          max_budget: 2.5,
          metadata: {
            github_repository: 'elastic/kibana',
            github_run_id: '12345',
            github_workflow_run_url: 'https://github.com/elastic/kibana/actions/runs/12345',
            purpose: 'claude-review',
          },
        });
      } finally {
        restoreEnvVar('GITHUB_REPOSITORY', originalEnv.GITHUB_REPOSITORY);
        restoreEnvVar('GITHUB_RUN_ID', originalEnv.GITHUB_RUN_ID);
        restoreEnvVar('GITHUB_SERVER_URL', originalEnv.GITHUB_SERVER_URL);
      }
    });
  });

  describe('mintInputSchema', () => {
    it('normalizes trailing slashes in base-url', () => {
      expect(
        mintInputSchema.parse({
          baseUrl: 'https://litellm.example.com///',
          masterKey: 'sk-master',
          models: 'llm-gateway/claude-opus-4-5',
          keyTTL: '30m',
          maxBudget: '2.5',
        }).baseUrl,
      ).toBe('https://litellm.example.com');
    });

    it('throws when no models are provided', () => {
      const result = mintInputSchema.safeParse({
        baseUrl: 'https://litellm.example.com',
        masterKey: 'sk-master',
        models: ' ,  , ',
        keyTTL: '30m',
        maxBudget: '2.5',
      });

      const issueMessage = result.success ? undefined : result.error.issues[0]?.message;
      expect(result.success).toBe(false);
      expect(issueMessage).toBe('A mint operation requires at least one model.');
    });

    it('throws when metadata is not valid JSON', () => {
      const result = mintInputSchema.safeParse({
        baseUrl: 'https://litellm.example.com',
        masterKey: 'sk-master',
        models: 'llm-gateway/claude-opus-4-5',
        keyTTL: '30m',
        maxBudget: '2.5',
        metadata: '{not-json}',
      });

      const issueMessage = result.success ? undefined : result.error.issues[0]?.message;
      expect(result.success).toBe(false);
      expect(issueMessage).toBe('Input "metadata" must be valid JSON.');
    });

    it('throws when metadata is not a JSON object', () => {
      const result = mintInputSchema.safeParse({
        baseUrl: 'https://litellm.example.com',
        masterKey: 'sk-master',
        models: 'llm-gateway/claude-opus-4-5',
        keyTTL: '30m',
        maxBudget: '2.5',
        metadata: '["bad"]',
      });

      const issueMessage = result.success ? undefined : result.error.issues[0]?.message;
      expect(result.success).toBe(false);
      expect(issueMessage).toBe('Input "metadata" must be a JSON object.');
    });

    it('throws when max-budget is not a valid number', () => {
      const result = mintInputSchema.safeParse({
        baseUrl: 'https://litellm.example.com',
        masterKey: 'sk-master',
        models: 'llm-gateway/claude-opus-4-5',
        keyTTL: '30m',
        maxBudget: 'not-a-number',
      });

      const issueMessage = result.success ? undefined : result.error.issues[0]?.message;
      expect(result.success).toBe(false);
      expect(issueMessage).toBe('Input "max-budget" must be a valid number.');
    });
  });

  describe('mintLiteLLMToken', () => {
    it('posts a mint request and returns the generated key details', async () => {
      const baseUrl = 'https://litellm.example.com';
      const originalEnv = {
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
        GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
        GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
      };
      const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { key: 'sk-short-lived' },
      } as Awaited<ReturnType<typeof axios.post>>);

      try {
        process.env.GITHUB_REPOSITORY = 'elastic/kibana';
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_SERVER_URL = 'https://github.com';

        const apiKey = await mintLiteLLMToken(
          mintInputSchema.parse({
            baseUrl,
            masterKey: 'sk-master',
            models: 'llm-gateway/claude-opus-4-5',
            keyTTL: '30m',
            maxBudget: '2.5',
            metadata: '{"purpose":"claude-review"}',
          }),
        );

        expect(postSpy).toHaveBeenCalledWith(
          `${baseUrl}/key/generate`,
          {
            models: ['llm-gateway/claude-opus-4-5'],
            duration: '30m',
            max_budget: 2.5,
            metadata: {
              github_repository: 'elastic/kibana',
              github_run_id: '12345',
              github_workflow_run_url: 'https://github.com/elastic/kibana/actions/runs/12345',
              purpose: 'claude-review',
            },
          },
          {
            headers: {
              Authorization: 'Bearer sk-master',
              'Content-Type': 'application/json',
            },
            timeout: 30_000,
          },
        );
        expect(apiKey).toBe('sk-short-lived');
      } finally {
        restoreEnvVar('GITHUB_REPOSITORY', originalEnv.GITHUB_REPOSITORY);
        restoreEnvVar('GITHUB_RUN_ID', originalEnv.GITHUB_RUN_ID);
        restoreEnvVar('GITHUB_SERVER_URL', originalEnv.GITHUB_SERVER_URL);
      }
    });

    it('wraps mint transport failures without exposing the master key and sets a timeout', async () => {
      const postSpy = vi
        .spyOn(axios, 'post')
        .mockRejectedValue(createAxiosError(403, { message: 'denied' }, 'Request failed'));

      await expect(
        mintLiteLLMToken(
          mintInputSchema.parse({
            baseUrl: 'https://litellm.example.com',
            masterKey: 'sk-master',
            models: 'llm-gateway/claude-opus-4-5',
            keyTTL: '30m',
            maxBudget: '5',
          }),
        ),
      ).rejects.toThrow('LiteLLM mint failed. HTTP 403: denied');

      expect(postSpy.mock.calls[0]?.[2]).toEqual(
        expect.objectContaining({
          timeout: 30_000,
        }),
      );
    });

    it('throws when the mint response is not a JSON object', async () => {
      vi.spyOn(axios, 'post').mockResolvedValue({
        data: ['bad-response'],
      } as Awaited<ReturnType<typeof axios.post>>);

      await expect(
        mintLiteLLMToken(
          mintInputSchema.parse({
            baseUrl: 'https://litellm.example.com',
            masterKey: 'sk-master',
            models: 'llm-gateway/claude-opus-4-5',
            keyTTL: '30m',
            maxBudget: '5',
          }),
        ),
      ).rejects.toThrow('LiteLLM mint response was not a JSON object.');
    });

    it('throws when the mint response key is blank', async () => {
      vi.spyOn(axios, 'post').mockResolvedValue({
        data: { key: '   ' },
      } as Awaited<ReturnType<typeof axios.post>>);

      await expect(
        mintLiteLLMToken(
          mintInputSchema.parse({
            baseUrl: 'https://litellm.example.com',
            masterKey: 'sk-master',
            models: 'llm-gateway/claude-opus-4-5',
            keyTTL: '30m',
            maxBudget: '5',
          }),
        ),
      ).rejects.toThrow('LiteLLM mint response key was missing or empty.');
    });
  });

  describe('revokeLiteLLMToken', () => {
    it('deletes the api key when delete succeeds', async () => {
      const baseUrl = 'https://litellm.example.com';
      const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { deleted: true },
      } as Awaited<ReturnType<typeof axios.post>>);

      await revokeLiteLLMToken(
        revokeInputSchema.parse({
          baseUrl,
          masterKey: 'sk-master',
          apiKey: 'sk-short-lived',
        }),
      );

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith(
        `${baseUrl}/key/delete`,
        { keys: ['sk-short-lived'] },
        {
          headers: {
            Authorization: 'Bearer sk-master',
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
    });

    it('blocks the api key when delete fails recoverably', async () => {
      const baseUrl = 'https://litellm.example.com';
      const postSpy = vi
        .spyOn(axios, 'post')
        .mockRejectedValueOnce(createAxiosError(404, { message: 'key not found' }))
        .mockResolvedValueOnce({
          data: { blocked: true },
        } as Awaited<ReturnType<typeof axios.post>>);

      await revokeLiteLLMToken(
        revokeInputSchema.parse({
          baseUrl,
          masterKey: 'sk-master',
          apiKey: 'sk-short-lived',
        }),
      );

      expect(postSpy).toHaveBeenCalledTimes(2);
      expect(postSpy).toHaveBeenNthCalledWith(
        1,
        `${baseUrl}/key/delete`,
        { keys: ['sk-short-lived'] },
        {
          headers: {
            Authorization: 'Bearer sk-master',
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
      expect(postSpy).toHaveBeenNthCalledWith(
        2,
        `${baseUrl}/key/block`,
        { key: 'sk-short-lived' },
        {
          headers: {
            Authorization: 'Bearer sk-master',
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
    });

    it('throws combined diagnostics when delete and block both fail recoverably', async () => {
      const baseUrl = 'https://litellm.example.com';
      const postSpy = vi
        .spyOn(axios, 'post')
        .mockRejectedValueOnce(createAxiosError(404, { message: 'api key not found' }))
        .mockRejectedValueOnce(createAxiosError(400, { message: 'already blocked' }));

      await expect(
        revokeLiteLLMToken(
          revokeInputSchema.parse({
            baseUrl,
            masterKey: 'sk-master',
            apiKey: 'sk-short-lived',
          }),
        ),
      ).rejects.toThrow(
        'LiteLLM token cleanup did not confirm revocation: delete by api key: HTTP 404: api key not found | block by api key: HTTP 400: already blocked',
      );

      expect(postSpy).toHaveBeenCalledTimes(2);
    });

    it('sets a timeout on revoke requests', async () => {
      const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { deleted: true },
      } as Awaited<ReturnType<typeof axios.post>>);

      await revokeLiteLLMToken(
        revokeInputSchema.parse({
          baseUrl: 'https://litellm.example.com',
          masterKey: 'sk-master',
          apiKey: 'sk-short-lived',
        }),
      );

      expect(postSpy.mock.calls).toHaveLength(1);
      expect(postSpy.mock.calls[0]?.[2]).toEqual(
        expect.objectContaining({
          timeout: 30_000,
        }),
      );
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
