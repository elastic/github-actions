import { beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_URL = 'https://litellm.example.com';
const MASTER_KEY = 'sk-master';
const MODEL = 'llm-gateway/claude-opus-4-5';
const KEY_TTL = '30m';
const MINTED_API_KEY = 'sk-short-lived';
const MULTILINE_METADATA = 'purpose=claude-review\nowner=security-ai';
const SINGLE_LINE_METADATA = 'purpose=claude-review';

const mockCore = {
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

const actionEnvKeys = [
  'INPUT_OPERATION',
  'INPUT_BASE-URL',
  'INPUT_MASTER-KEY',
  'INPUT_MODELS',
  'INPUT_KEY-TTL',
  'INPUT_MAX-BUDGET',
  'INPUT_METADATA',
  'INPUT_API-KEY',
];

function setActionInput(name: string, value: string) {
  process.env[`INPUT_${name.toUpperCase()}`] = value;
}

function setDefaultMintInputs() {
  setActionInput('base-url', BASE_URL);
  setActionInput('master-key', MASTER_KEY);
  setActionInput('models', MODEL);
  setActionInput('key-ttl', KEY_TTL);
}

function setDefaultRevokeInputs() {
  setActionInput('operation', 'revoke');
  setActionInput('base-url', BASE_URL);
  setActionInput('master-key', MASTER_KEY);
  setActionInput('api-key', MINTED_API_KEY);
}

describe('LiteLLM Token action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    for (const key of actionEnvKeys) {
      delete process.env[key];
    }

    setDefaultMintInputs();
  });

  describe('mint operation', () => {
    it('mints a token and exposes api_key output', async () => {
      setActionInput('metadata', MULTILINE_METADATA);

      mockMintLiteLLMToken.mockResolvedValue(MINTED_API_KEY);

      const run = await loadMainRun();

      await run();

      expect(mockCore.setSecret).toHaveBeenCalledWith(MASTER_KEY);
      expect(mockCore.setSecret).toHaveBeenCalledWith(MINTED_API_KEY);
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

    it('defaults to mint when operation is not set', async () => {
      mockMintLiteLLMToken.mockResolvedValue(MINTED_API_KEY);

      const run = await loadMainRun();

      await run();

      expect(mockMintLiteLLMToken).toHaveBeenCalled();
      expect(mockRevokeLiteLLMToken).not.toHaveBeenCalled();
    });
  });

  describe('revoke operation', () => {
    it('revokes the provided api key', async () => {
      setDefaultRevokeInputs();

      const run = await loadMainRun();

      await run();

      expect(mockCore.setSecret).toHaveBeenCalledWith(MASTER_KEY);
      expect(mockCore.setSecret).toHaveBeenCalledWith(MINTED_API_KEY);
      expect(mockRevokeLiteLLMToken).toHaveBeenCalledWith({
        baseUrl: BASE_URL,
        masterKey: MASTER_KEY,
        apiKey: MINTED_API_KEY,
      });
      expect(mockCore.setOutput).not.toHaveBeenCalled();
    });
  });

  describe('unknown operation', () => {
    it('throws for an unrecognized operation', async () => {
      setActionInput('operation', 'destroy');

      const run = await loadMainRun();

      await expect(run()).rejects.toThrow();
      expect(mockMintLiteLLMToken).not.toHaveBeenCalled();
      expect(mockRevokeLiteLLMToken).not.toHaveBeenCalled();
    });
  });

  it('does not auto-run the main entrypoint when imported in tests', async () => {
    await import('./index');

    expect(mockMintLiteLLMToken).not.toHaveBeenCalled();
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });
});
