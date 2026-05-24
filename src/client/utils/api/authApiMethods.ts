import { type PublicLoginBranding } from '../../../shared/types/loginBranding.js';
import { type PublicAppBranding } from '../../../shared/types/appBranding.js';
import { type PublicLoginOptions } from '../../../shared/types/loginOptions.js';
import { type ApiClient } from '../api.js';

export interface AuthApiMethods {
  register(data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }): Promise<unknown>;
  login(email: string, password: string): Promise<{ token?: string; user: unknown }>;
  oauthExchange(): Promise<{ user: unknown }>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<unknown>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
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

  async oauthExchange(this: ApiClient): Promise<{ user: unknown }> {
    const response = await this.client.post('/auth/oauth/exchange');
    const data = response.data;
    if (data != null && typeof data === 'object' && 'token' in data) {
      const token = (data as { token?: unknown }).token;
      if (typeof token === 'string' && token.length > 0) {
        this.setToken(token);
      }
    }
    return data as { user: unknown };
  },

  async login(this: ApiClient, email, password) {
    const response = await this.client.post('/auth/login', { email, password });
    const data = response.data;
    if (data != null && typeof data === 'object' && 'token' in data) {
      const token = (data as { token?: unknown }).token;
      if (typeof token === 'string' && token.length > 0) {
        this.setToken(token);
      }
    }
    return data as { token?: string; user: unknown };
  },

  async logout(this: ApiClient) {
    await this.client.post('/auth/logout');
    this.clearToken();
  },

  async getCurrentUser(this: ApiClient) {
    const response = await this.client.get('/auth/me');
    return response.data;
  },

  async forgotPassword(this: ApiClient, email) {
    await this.client.post('/auth/forgot-password', { email });
  },

  async resetPassword(this: ApiClient, token, password) {
    await this.client.post('/auth/reset-password', { token, password });
  },

  async verifyEmail(this: ApiClient, token) {
    await this.client.get('/auth/verify-email', { params: { token } });
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
