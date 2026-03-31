import { z } from 'zod';

export type JsonObject = Record<string, unknown>;
export type StringMap = Record<string, string>;

function parseMetadataEntries(entries: string[], ctx: z.RefinementCtx): StringMap | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const metadata: StringMap = {};

  for (const entry of entries) {
    const trimmedEntry = entry.trim();
    if (trimmedEntry.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message: 'Input "metadata" entries must not be empty.',
      });
      return z.NEVER;
    }

    const separatorIndex = trimmedEntry.indexOf('=');
    if (separatorIndex === -1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message: 'Input "metadata" entries must use key=value format.',
      });
      return z.NEVER;
    }

    const key = trimmedEntry.slice(0, separatorIndex).trim();
    if (key.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message: 'Input "metadata" keys must not be blank.',
      });
      return z.NEVER;
    }

    metadata[key] = trimmedEntry.slice(separatorIndex + 1).trim();
  }

  return metadata;
}

const commonInputSchema = z.object({
  baseUrl: z
    .string()
    .min(1, 'Input "base-url" is required.')
    .transform((value) => value.replace(/\/+$/, '')),
  masterKey: z.string().min(1, 'Input "master-key" is required.'),
});

const mintFields = {
  models: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .refine((value) => value.length > 0, {
      message: 'A mint operation requires at least one model.',
    }),
  keyTTL: z.string().min(1, 'Input "key-ttl" is required.'),
  maxBudget: z.string().transform((value, ctx) => {
    const parsedValue = Number.parseFloat(value);
    if (!Number.isFinite(parsedValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message: 'Input "max-budget" must be a valid number.',
      });
      return z.NEVER;
    }

    return parsedValue;
  }),
  metadata: z
    .array(z.string())
    .optional()
    .transform((value, ctx) => parseMetadataEntries(value ?? [], ctx)),
};

const revokeFields = {
  apiKey: z.string().min(1, 'Saved LiteLLM api key is required for post cleanup.'),
};

export const mintInputSchema = commonInputSchema.extend(mintFields);
export const revokeInputSchema = commonInputSchema.extend(revokeFields);

export const mintResponseSchema = z.object({
  key: z.string().refine((value) => value.trim().length > 0, {
    message: 'LiteLLM mint response key was missing or empty.',
  }),
});

export const errorResponseSchema = z
  .union([
    z.string(),
    z.object({
      message: z.string(),
    }),
    z.object({
      error: z.object({
        message: z.string(),
      }),
    }),
  ])
  .transform((value) => ({
    message: typeof value === 'string' ? value : 'message' in value ? value.message : value.error.message,
  }));

export type MintInputs = z.infer<typeof mintInputSchema>;
export type RevokeInputs = z.infer<typeof revokeInputSchema>;
