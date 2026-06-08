import { z } from 'zod';

export const unmappedUserPolicySchema = z.enum([
  'map_to_importer',
  'discard_unmapped',
  'create_placeholders',
]);

export const importUserDecisionSchema = z.object({
  sourceUserId: z.string().min(1),
  mappedUserId: z.string().min(1).optional(),
  discard: z.boolean().optional(),
});

export const importSourceRoleMappingSchema = z.object({
  sourceRoleKey: z.string().trim().min(1).max(80),
  targetRoleKey: z.string().trim().min(1).max(80),
});

const importInlineButtonColorSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[#(),.%/\-\s0-9a-zA-Z]+$/);

export const inlineButtonIconReplacementSchema = z
  .object({
    iconSrc: z.string().min(1),
    replacementDataUrl: z.string().startsWith('data:image/'),
  })
  .refine(
    (value) => typeof value.replacementDataUrl === 'string' && value.replacementDataUrl.trim() !== '',
    { message: 'Inline button replacement requires an icon upload' },
  );

export const inlineButtonImportColorOverridesSchema = z
  .object({
    textColor: importInlineButtonColorSchema.optional(),
    bgColor: importInlineButtonColorSchema.optional(),
  })
  .refine((value) => value.textColor != null || value.bgColor != null, {
    message: 'Inline button colour override requires text and/or background colour',
  });

export const importPreflightPayloadSchema = z.object({
  userDecisions: z.array(importUserDecisionSchema).default([]),
  unmappedUserPolicy: unmappedUserPolicySchema.default('discard_unmapped'),
  sourceRoleMappings: z.array(importSourceRoleMappingSchema).optional(),
  inlineButtonIconReplacements: z.array(inlineButtonIconReplacementSchema).optional(),
  inlineButtonImportColorOverrides: inlineButtonImportColorOverridesSchema.optional(),
});

export type ImportPreflightPayloadParsed = z.infer<typeof importPreflightPayloadSchema>;

