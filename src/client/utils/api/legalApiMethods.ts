import { z } from 'zod';
import type { ApiClient } from '../api.js';

export const privacyPolicyDocumentSchema = z.object({
  version: z.string(),
  markdown: z.string(),
  html: z.string(),
});

export type PrivacyPolicyDocument = z.infer<typeof privacyPolicyDocumentSchema>;

export interface LegalApiMethods {
  getPrivacyPolicy(): Promise<PrivacyPolicyDocument>;
}

export const legalApiMethods: LegalApiMethods = {
  async getPrivacyPolicy(this: ApiClient) {
    const response = await this.client.get('/legal/privacy-policy');
    return privacyPolicyDocumentSchema.parse(response.data);
  },
};
