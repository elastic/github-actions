import { beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_URL = 'https://litellm.example.com';
const MASTER_KEY = 'sk-master';
const MODEL = 'llm-gateway/claude-opus-4-5';
const KEY_TTL = '30m';
const MINTED_API_KEY = 'sk-short-lived';
const MULTILINE_METADATA = 'purpose=claude-review\nowner=security-ai';
const SINGLE_LINE_METADATA = 'purpose=claude-review';

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

function setDefaultActionInputs() {
  setActionInput('base-url', BASE_URL);
  setActionInput('master-key', MASTER_KEY);
  setActionInput('models', MODEL);
  setActionInput('key-ttl', KEY_TTL);
}

describe('LiteLLM Token action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    for (const key of actionEnvKeys) {
      delete process.env[key];
    }

    setDefaultActionInputs();
  });

  it('mints a token, saves it for cleanup, and only exposes api_key output', async () => {
    setActionInput('metadata', MULTILINE_METADATA);

    mockMintLiteLLMToken.mockResolvedValue(MINTED_API_KEY);

    const run = await loadMainRun();

    await run();

    expect(mockCore.setSecret).toHaveBeenCalledWith(MASTER_KEY);
    expect(mockCore.setSecret).toHaveBeenCalledWith(MINTED_API_KEY);
    expect(mockCore.saveState).toHaveBeenCalledWith('minted_api_key', MINTED_API_KEY);
    expect(mockCore.setOutput).toHaveBeenCalledTimes(1);
    expect(mockCore.setOutput).toHaveBeenCalledWith('api_key', MINTED_API_KEY);
    expect(mockMintLiteLLMToken).toHaveBeenCalledWith({
      baseUrl: BASE_URL,
      masterKey: MASTER_KEY,
      keyTTL: KEY_TTL,
      maxBudget: 5,
      models: [MODEL],
      metadata: { owner: 'security-ai', purpose: 'claude-review' },
    });
  });

  it('accepts single-line metadata input', async () => {
    setActionInput('metadata', SINGLE_LINE_METADATA);

    mockMintLiteLLMToken.mockResolvedValue(MINTED_API_KEY);

    const run = await loadMainRun();

    await run();

    expect(mockMintLiteLLMToken).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { purpose: 'claude-review' },
      }),
    );
  });

  it('revokes the saved api key during post cleanup', async () => {
    process.env.STATE_minted_api_key = MINTED_API_KEY;

    const run = await loadPostRun();

    await run();

    expect(mockCore.setSecret).toHaveBeenCalledWith(MASTER_KEY);
    expect(mockCore.setSecret).toHaveBeenCalledWith(MINTED_API_KEY);
    expect(mockRevokeLiteLLMToken).toHaveBeenCalledWith({
      baseUrl: BASE_URL,
      masterKey: MASTER_KEY,
      apiKey: MINTED_API_KEY,
    });
  });

  it('skips post cleanup when there is no saved api key', async () => {
    const run = await loadPostRun();

    await run();

    expect(mockCore.setSecret).not.toHaveBeenCalled();
    expect(mockRevokeLiteLLMToken).not.toHaveBeenCalled();
  });
});
