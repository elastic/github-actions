import { z } from 'zod';

export type JsonObject = Record<string, unknown>;

const jsonObjectSchema: z.ZodType<JsonObject> = z.object({}).catchall(z.unknown());

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
        message: 'Input "max-budget" must be a valid number.',
      });
      return z.NEVER;
    }

    return parsedValue;
  }),
  metadata: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value?.trim()) {
        return undefined;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Input "metadata" must be valid JSON.',
        });
        return z.NEVER;
      }

      const result = jsonObjectSchema.safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Input "metadata" must be a JSON object.',
        });
        return z.NEVER;
      }

      return result.data;
    }),
};

const revokeFields = {
  apiKey: z.string().min(1, 'Input "api-key" is required.'),
};

export const mintInputSchema = commonInputSchema.extend(mintFields);
export const revokeInputSchema = commonInputSchema.extend(revokeFields);

export const actionInputSchema = z.discriminatedUnion('operation', [
  mintInputSchema.extend({
    operation: z.literal('mint'),
  }),
  revokeInputSchema.extend({
    operation: z.literal('revoke'),
  }),
]);

export const mintResponseSchema = z.object({
  key: z.string().refine((value) => value.trim().length > 0, {
    message: 'LiteLLM mint response key was missing or empty.',
  }),
});

export const errorResponseSchema = z.object({
  message: z.string(),
});

export type MintInputs = z.infer<typeof mintInputSchema>;
export type RevokeInputs = z.infer<typeof revokeInputSchema>;
