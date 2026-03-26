import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInputs: Record<string, string> = {};
const mockState: Record<string, string> = {};

const mockCore = {
  getInput: vi.fn((name: string) => mockInputs[name] ?? ''),
  getState: vi.fn((name: string) => mockState[name] ?? ''),
  saveState: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  setSecret: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

const mockMintLiteLLMToken = vi.fn();
const mockRevokeLiteLLMToken = vi.fn();

vi.mock(import('@actions/core'), () => mockCore);
vi.mock(import('./litellmToken'), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    mintLiteLLMToken: mockMintLiteLLMToken,
    revokeLiteLLMToken: mockRevokeLiteLLMToken,
  };
});

async function loadMainRun() {
  const module = await import('./index');
  return module.run;
}

async function loadPostRun() {
  const module = await import('./post');
  return module.run;
}

describe('LiteLLM Token action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    for (const key of Object.keys(mockInputs)) {
      delete mockInputs[key];
    }

    for (const key of Object.keys(mockState)) {
      delete mockState[key];
    }
  });

  it('mints a token, saves it for cleanup, and only exposes api_key output', async () => {
    Object.assign(mockInputs, {
      'base-url': 'https://litellm.example.com',
      'master-key': 'sk-master',
      models: 'llm-gateway/claude-opus-4-5',
      'key-ttl': '30m',
      metadata: '{"purpose":"claude-review"}',
    });

    mockMintLiteLLMToken.mockResolvedValue('sk-short-lived');

    const run = await loadMainRun();

    await run();

    expect(mockCore.setSecret).toHaveBeenCalledTimes(2);
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-master');
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-short-lived');
    expect(mockCore.saveState).toHaveBeenCalledTimes(1);
    expect(mockCore.saveState).toHaveBeenCalledWith('minted_api_key', 'sk-short-lived');
    expect(mockCore.setOutput).toHaveBeenCalledTimes(1);
    expect(mockCore.setOutput).toHaveBeenCalledWith('api_key', 'sk-short-lived');
    expect(mockCore.getInput).toHaveBeenCalledWith('models', { required: true });
    expect(mockMintLiteLLMToken).toHaveBeenCalledWith({
      baseUrl: 'https://litellm.example.com',
      masterKey: 'sk-master',
      keyTTL: '30m',
      maxBudget: 5,
      models: ['llm-gateway/claude-opus-4-5'],
      metadata: { purpose: 'claude-review' },
    });
  });

  it('revokes the saved api key during post cleanup', async () => {
    Object.assign(mockInputs, {
      'base-url': 'https://litellm.example.com',
      'master-key': 'sk-master',
    });
    mockState.minted_api_key = 'sk-short-lived';

    const run = await loadPostRun();

    await run();

    expect(mockCore.setSecret).toHaveBeenCalledTimes(2);
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-master');
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-short-lived');
    expect(mockRevokeLiteLLMToken).toHaveBeenCalledWith({
      baseUrl: 'https://litellm.example.com',
      masterKey: 'sk-master',
      apiKey: 'sk-short-lived',
    });
  });

  it('skips post cleanup when there is no saved api key', async () => {
    const run = await loadPostRun();

    await run();

    expect(mockCore.getInput).not.toHaveBeenCalled();
    expect(mockCore.setSecret).not.toHaveBeenCalled();
    expect(mockRevokeLiteLLMToken).not.toHaveBeenCalled();
    expect(mockCore.info).toHaveBeenCalledWith('No LiteLLM token was minted. Skipping post cleanup.');
  });
});
