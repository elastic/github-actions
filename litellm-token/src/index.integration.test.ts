import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCore = {
  saveState: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  setSecret: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

const mockMintLiteLLMToken = vi.fn();
const mockRevokeLiteLLMToken = vi.fn();

vi.mock(import('@actions/core'), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    ...mockCore,
  };
});

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

const actionEnvKeys = [
  'INPUT_BASE-URL',
  'INPUT_MASTER-KEY',
  'INPUT_MODELS',
  'INPUT_KEY-TTL',
  'INPUT_MAX-BUDGET',
  'INPUT_METADATA',
  'STATE_minted_api_key',
];

function setActionInput(name: string, value: string) {
  process.env[`INPUT_${name.toUpperCase()}`] = value;
}

describe('LiteLLM Token action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    for (const key of actionEnvKeys) {
      delete process.env[key];
    }
  });

  it('mints a token, saves it for cleanup, and only exposes api_key output', async () => {
    setActionInput('base-url', 'https://litellm.example.com');
    setActionInput('master-key', 'sk-master');
    setActionInput('models', 'llm-gateway/claude-opus-4-5');
    setActionInput('key-ttl', '30m');
    setActionInput('metadata', 'purpose=claude-review\nowner=security-ai');

    mockMintLiteLLMToken.mockResolvedValue('sk-short-lived');

    const run = await loadMainRun();

    await run();

    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-master');
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-short-lived');
    expect(mockCore.saveState).toHaveBeenCalledWith('minted_api_key', 'sk-short-lived');
    expect(mockCore.setOutput).toHaveBeenCalledTimes(1);
    expect(mockCore.setOutput).toHaveBeenCalledWith('api_key', 'sk-short-lived');
    expect(mockMintLiteLLMToken).toHaveBeenCalledWith({
      baseUrl: 'https://litellm.example.com',
      masterKey: 'sk-master',
      keyTTL: '30m',
      maxBudget: 5,
      models: ['llm-gateway/claude-opus-4-5'],
      metadata: { owner: 'security-ai', purpose: 'claude-review' },
    });
  });

  it('accepts single-line metadata input', async () => {
    setActionInput('base-url', 'https://litellm.example.com');
    setActionInput('master-key', 'sk-master');
    setActionInput('models', 'llm-gateway/claude-opus-4-5');
    setActionInput('metadata', 'purpose=claude-review');

    mockMintLiteLLMToken.mockResolvedValue('sk-short-lived');

    const run = await loadMainRun();

    await run();

    expect(mockMintLiteLLMToken).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { purpose: 'claude-review' },
      }),
    );
  });

  it('revokes the saved api key during post cleanup', async () => {
    setActionInput('base-url', 'https://litellm.example.com');
    setActionInput('master-key', 'sk-master');
    process.env.STATE_minted_api_key = 'sk-short-lived';

    const run = await loadPostRun();

    await run();

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

    expect(mockCore.setSecret).not.toHaveBeenCalled();
    expect(mockRevokeLiteLLMToken).not.toHaveBeenCalled();
    expect(mockCore.info).toHaveBeenCalledWith('No LiteLLM token was minted. Skipping post cleanup.');
  });
});
