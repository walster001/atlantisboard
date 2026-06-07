import { z } from 'zod';
import type { BoardThemeDefinition } from '../../../shared/boardTheme.js';
import { type PublicLoginBranding } from '../../../shared/types/loginBranding.js';
import { type PublicAppBranding } from '../../../shared/types/appBranding.js';
import { type PublicLoginOptions } from '../../../shared/types/loginOptions.js';
import { type ApiClient } from '../api.js';

export const authUserResponseSchema = z.object({
  user: z.unknown(),
});

export type AuthUserResponse = z.infer<typeof authUserResponseSchema>;

export function parseAuthUserResponse(data: unknown): AuthUserResponse {
  return authUserResponseSchema.parse(data);
}

export const loginResponseSchema = z.object({
  token: z.string().optional(),
  user: z.unknown(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export function parseLoginResponse(data: unknown): LoginResponse {
  return loginResponseSchema.parse(data);
}

export const clientAuthUserSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  username: z.string(),
  displayName: z.string(),
  profilePicture: z.string().optional(),
  isAppAdmin: z.boolean().optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'auto']),
    notifications: z.boolean(),
    language: z.string(),
    notificationPreferences: z.record(z.string(), z.unknown()),
    homeWorkspaceOrder: z.array(z.string()).optional(),
    homeBoardOrderByWorkspace: z.record(z.string(), z.array(z.string())).optional(),
    customBoardThemes: z.array(z.unknown()).optional(),
  }),
  emailVerified: z.boolean(),
});

export interface ClientAuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  profilePicture?: string;
  isAppAdmin?: boolean;
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    notifications: boolean;
    language: string;
    notificationPreferences: Record<string, unknown>;
    homeWorkspaceOrder?: string[];
    homeBoardOrderByWorkspace?: Record<string, string[]>;
    customBoardThemes?: BoardThemeDefinition[];
  };
  emailVerified: boolean;
}

export function parseClientAuthUser(user: unknown): ClientAuthUser {
  const parsed = clientAuthUserSchema.parse(user);
  const result: ClientAuthUser = {
    id: parsed.id,
    email: parsed.email,
    username: parsed.username,
    displayName: parsed.displayName,
    preferences: {
      theme: parsed.preferences.theme,
      notifications: parsed.preferences.notifications,
      language: parsed.preferences.language,
      notificationPreferences: parsed.preferences.notificationPreferences,
    },
    emailVerified: parsed.emailVerified,
  };
  if (parsed.profilePicture !== undefined) {
    result.profilePicture = parsed.profilePicture;
  }
  if (parsed.isAppAdmin !== undefined) {
    result.isAppAdmin = parsed.isAppAdmin;
  }
  if (parsed.preferences.homeWorkspaceOrder !== undefined) {
    result.preferences.homeWorkspaceOrder = parsed.preferences.homeWorkspaceOrder;
  }
  if (parsed.preferences.homeBoardOrderByWorkspace !== undefined) {
    result.preferences.homeBoardOrderByWorkspace = parsed.preferences.homeBoardOrderByWorkspace;
  }
  if (parsed.preferences.customBoardThemes !== undefined) {
    result.preferences.customBoardThemes = parsed.preferences.customBoardThemes as BoardThemeDefinition[];
  }
  return result;
}

export function toUserDbPreferences(preferences: ClientAuthUser['preferences']): {
  theme: 'light' | 'dark' | 'auto';
  notifications: boolean;
  language: string;
  notificationPreferences: Record<string, unknown>;
  homeWorkspaceOrder?: string[];
  homeBoardOrderByWorkspace?: Record<string, string[]>;
} {
  const base: {
    theme: 'light' | 'dark' | 'auto';
    notifications: boolean;
    language: string;
    notificationPreferences: Record<string, unknown>;
    homeWorkspaceOrder?: string[];
    homeBoardOrderByWorkspace?: Record<string, string[]>;
  } = {
    theme: preferences.theme,
    notifications: preferences.notifications,
    language: preferences.language,
    notificationPreferences: preferences.notificationPreferences,
  };
  if (preferences.homeWorkspaceOrder !== undefined) {
    base.homeWorkspaceOrder = preferences.homeWorkspaceOrder;
  }
  if (preferences.homeBoardOrderByWorkspace !== undefined) {
    base.homeBoardOrderByWorkspace = preferences.homeBoardOrderByWorkspace;
  }
  return base;
}

export interface AuthApiMethods {
  register(data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }): Promise<unknown>;
  login(email: string, password: string): Promise<LoginResponse>;
  oauthExchange(): Promise<AuthUserResponse>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<AuthUserResponse>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  verifyEmail(token: string): Promise<unknown>;
  resendVerification(email: string): Promise<void>;
  getLoginOptions(): Promise<PublicLoginOptions>;
  getLoginBranding(): Promise<{ branding: PublicLoginBranding }>;
  getAppBranding(): Promise<{ appBranding: PublicAppBranding }>;
  uploadBrandingFile(
    file: File,
    type: 'logo' | 'favicon' | 'home-nav-icon' | 'home-bg-image' | 'board-nav-icon'
  ): Promise<{ url: string }>;
  deleteBrandingFile(url: string): Promise<void>;
}

export const authApiMethods: AuthApiMethods = {
  async register(this: ApiClient, data) {
    const response = await this.client.post('/auth/register', data);
    if (response.data && typeof response.data === 'object' && 'token' in response.data) {
      const token = (response.data as { token?: string }).token;
      if (token) {
        this.setToken(token);
      }
    }
    return response.data;
  },

  async oauthExchange(this: ApiClient): Promise<AuthUserResponse> {
    const response = await this.client.post('/auth/oauth/exchange');
    const data = response.data;
    if (data != null && typeof data === 'object' && 'token' in data) {
      const token = (data as { token?: unknown }).token;
      if (typeof token === 'string' && token.length > 0) {
        this.setToken(token);
      }
    }
    return parseAuthUserResponse(data);
  },

  async login(this: ApiClient, email, password) {
    const response = await this.client.post('/auth/login', { email, password });
    // Server regenerates session and issues a new CSRF token on successful login.
    await this.ensureCsrfToken();
    const data = response.data;
    if (data != null && typeof data === 'object' && 'token' in data) {
      const token = (data as { token?: unknown }).token;
      if (typeof token === 'string' && token.length > 0) {
        this.setToken(token);
      }
    }
    return parseLoginResponse(data);
  },

  async logout(this: ApiClient) {
    await this.client.post('/auth/logout');
    this.clearToken();
  },

  async getCurrentUser(this: ApiClient) {
    const response = await this.client.get('/auth/me');
    return parseAuthUserResponse(response.data);
  },

  async forgotPassword(this: ApiClient, email) {
    await this.client.post('/auth/forgot-password', { email });
  },

  async resetPassword(this: ApiClient, token, password) {
    await this.client.post('/auth/reset-password', { token, password });
  },

  async verifyEmail(this: ApiClient, token) {
    await this.ensureCsrfToken();
    const response = await this.client.post('/auth/verify-email', { token });
    const data = parseLoginResponse(response.data);
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async resendVerification(this: ApiClient, email) {
    await this.client.post('/auth/resend-verification', { email });
  },

  async getLoginOptions(this: ApiClient) {
    const response = await this.client.get<PublicLoginOptions>('/auth/login-options');
    return response.data;
  },

  async getLoginBranding(this: ApiClient) {
    const response = await this.client.get<{ branding: PublicLoginBranding }>(
      '/auth/login-branding'
    );
    return response.data;
  },

  async getAppBranding(this: ApiClient) {
    const response = await this.client.get<{ appBranding: PublicAppBranding }>(
      '/auth/app-branding'
    );
    return response.data;
  },

  async uploadBrandingFile(this: ApiClient, file, type) {
    const form = new FormData();
    form.append('file', file);
    /** Must not use default `application/json` — axios would stringify FormData and multer sees no file. */
    const response = await this.client.post<{ url: string }>(
      `/admin/branding/upload?type=${type}`,
      form,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  async deleteBrandingFile(this: ApiClient, url) {
    await this.client.delete('/admin/branding/file', {
      data: { url },
    });
  },
};
