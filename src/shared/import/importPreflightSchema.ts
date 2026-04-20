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

export const inlineButtonIconReplacementSchema = z.object({
  iconSrc: z.string().min(1),
  replacementDataUrl: z.string().startsWith('data:image/'),
});

export const importPreflightPayloadSchema = z.object({
  userDecisions: z.array(importUserDecisionSchema).default([]),
  unmappedUserPolicy: unmappedUserPolicySchema.default('map_to_importer'),
  inlineButtonIconReplacements: z.array(inlineButtonIconReplacementSchema).optional(),
});

export type ImportPreflightPayloadParsed = z.infer<typeof importPreflightPayloadSchema>;

