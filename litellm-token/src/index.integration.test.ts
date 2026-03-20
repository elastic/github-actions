import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInputs: Record<string, string> = {};

const mockCore = {
  getInput: vi.fn((name: string) => mockInputs[name] ?? ''),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  setSecret: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

const mockLitellmToken = {
  mintLiteLLMToken: vi.fn(),
  revokeLiteLLMToken: vi.fn(),
};

vi.mock(import('@actions/core'), () => mockCore);
vi.mock(import('./litellmToken'), () => mockLitellmToken);

async function loadRun() {
  const module = await import('./index');
  return module.run;
}

describe('LiteLLM Token action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    for (const key of Object.keys(mockInputs)) {
      delete mockInputs[key];
    }
  });

  it('masks the minted api key and only exposes api_key output', async () => {
    Object.assign(mockInputs, {
      operation: 'mint',
      'base-url': 'https://litellm.example.com',
      'master-key': 'sk-master',
      models: 'llm-gateway/claude-opus-4-5',
      'key-ttl': '30m',
      metadata: '{"purpose":"claude-review"}',
    });

    mockLitellmToken.mintLiteLLMToken.mockResolvedValue('sk-short-lived');

    const run = await loadRun();

    await run();

    expect(mockCore.setSecret).toHaveBeenCalledTimes(2);
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-master');
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-short-lived');
    expect(mockCore.setOutput).toHaveBeenCalledTimes(1);
    expect(mockCore.setOutput).toHaveBeenCalledWith('api_key', 'sk-short-lived');
    expect(mockCore.getInput).toHaveBeenCalledWith('models');
    expect(mockLitellmToken.mintLiteLLMToken).toHaveBeenCalledWith({
      baseUrl: 'https://litellm.example.com',
      masterKey: 'sk-master',
      keyTTL: '30m',
      maxBudget: 5,
      models: ['llm-gateway/claude-opus-4-5'],
      metadata: { purpose: 'claude-review' },
      operation: 'mint',
    });
  });

  it('masks revoke secrets and fails when revocation is not confirmed', async () => {
    Object.assign(mockInputs, {
      operation: 'revoke',
      'base-url': 'https://litellm.example.com',
      'master-key': 'sk-master',
      'api-key': 'sk-short-lived',
    });

    mockLitellmToken.revokeLiteLLMToken.mockRejectedValue(
      new Error(
        'LiteLLM token cleanup did not confirm revocation: delete by api key: HTTP 404: api key not found | block by api key: HTTP 400: already blocked',
      ),
    );

    const run = await loadRun();

    await expect(run()).rejects.toThrow(
      'LiteLLM token cleanup did not confirm revocation: delete by api key: HTTP 404: api key not found | block by api key: HTTP 400: already blocked',
    );

    expect(mockCore.setSecret).toHaveBeenCalledTimes(2);
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-master');
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-short-lived');
    expect(mockCore.warning).not.toHaveBeenCalled();
    expect(mockLitellmToken.revokeLiteLLMToken).toHaveBeenCalledWith({
      baseUrl: 'https://litellm.example.com',
      masterKey: 'sk-master',
      apiKey: 'sk-short-lived',
      operation: 'revoke',
    });
  });
});
