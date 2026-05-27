import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { authApiMethods, type AuthApiMethods } from './api/authApiMethods.js';
import { workspaceApiMethods, type WorkspaceApiMethods } from './api/workspaceApiMethods.js';
import { boardApiMethods, type BoardApiMethods } from './api/boardApiMethods.js';
import { listApiMethods, type ListApiMethods } from './api/listApiMethods.js';
import { cardApiMethods, type CardApiMethods } from './api/cardApiMethods.js';
import { labelApiMethods, type LabelApiMethods } from './api/labelApiMethods.js';
import { checklistApiMethods, type ChecklistApiMethods } from './api/checklistApiMethods.js';
import { commentApiMethods, type CommentApiMethods } from './api/commentApiMethods.js';
import { activityApiMethods, type ActivityApiMethods } from './api/activityApiMethods.js';
import { inviteApiMethods, type InviteApiMethods } from './api/inviteApiMethods.js';
import { adminUserApiMethods, type AdminUserApiMethods } from './api/adminUserApiMethods.js';
import {
  adminSystemApiMethods,
  type AdminSystemApiMethods,
  invalidateFontsCatalogCache,
} from './api/adminSystemApiMethods.js';
import { adminBackupApiMethods, type AdminBackupApiMethods } from './api/adminBackupApiMethods.js';
import { adminDatabaseApiMethods, type AdminDatabaseApiMethods } from './api/adminDatabaseApiMethods.js';
import { userApiMethods, type UserApiMethods } from './api/userApiMethods.js';
import { importExportApiMethods, type ImportExportApiMethods } from './api/importExportApiMethods.js';
import { attachmentApiMethods, type AttachmentApiMethods } from './api/attachmentApiMethods.js';
import { themesApiMethods, type ThemesApiMethods } from './api/themesApiMethods.js';
import { API_BASE_URL } from './api/shared.js';
import { usesHttpOnlyAuth } from '../config/env.js';

interface CsrfRetryAxiosRequestConfig extends InternalAxiosRequestConfig {
  _csrfRetried?: boolean;
}
export { invalidateFontsCatalogCache };

/** Paths that do not require authentication; redirect to login is skipped on these. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify-email') ||
    pathname.startsWith('/invite/')
  );
}

function isCsrfError(error: AxiosError): boolean {
  if (error.response?.status !== 403) {
    return false;
  }
  const data = error.response.data;
  if (data == null || typeof data !== 'object' || !('error' in data)) {
    return false;
  }
  const code = (data as { error?: { code?: string } }).error?.code;
  return code === 'CSRF_TOKEN_MISSING' || code === 'CSRF_TOKEN_INVALID';
}

export class ApiClient {
  client: AxiosInstance;
  csrfToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Initialize CSRF token
    this.fetchCSRFToken().catch(() => {
      // Silently fail, will try again on next request
    });

    // Request interceptor to add auth token and CSRF token
    this.client.interceptors.request.use(
      async (config) => {
        if (!usesHttpOnlyAuth()) {
          const token = this.getToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }

        // Add CSRF token for state-changing requests
        if (config.method && ['post', 'put', 'patch', 'delete'].includes(config.method.toLowerCase())) {
          if (!this.csrfToken) {
            await this.fetchCSRFToken();
          }
          if (this.csrfToken) {
            config.headers['X-CSRF-Token'] = this.csrfToken;
          }
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling (CSRF retry once)
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as CsrfRetryAxiosRequestConfig | undefined;

        if (config && isCsrfError(error) && !config._csrfRetried) {
          try {
            await this.fetchCSRFToken();
            config._csrfRetried = true;
            return this.client.request(config);
          } catch {
            return Promise.reject(error);
          }
        }

        if (error.response?.status === 401) {
          this.clearToken();
          if (!isPublicPath(window.location.pathname)) {
            window.location.href = '/login';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async fetchCSRFToken(): Promise<void> {
    try {
      const response = await this.client.get('/csrf/token');
      if (response.data?.csrfToken) {
        this.csrfToken = response.data.csrfToken;
      }
    } catch {
      /* will try again on next request */
    }
  }

  getToken(): string | null {
    if (usesHttpOnlyAuth()) {
      return null;
    }
    return localStorage.getItem('token') || null;
  }

  clearToken(): void {
    if (!usesHttpOnlyAuth()) {
      localStorage.removeItem('token');
    }
  }

  setToken(token: string): void {
    if (usesHttpOnlyAuth()) {
      return;
    }
    localStorage.setItem('token', token);
  }
}

export interface ApiClient
  extends AuthApiMethods,
    WorkspaceApiMethods,
    BoardApiMethods,
    ListApiMethods,
    CardApiMethods,
    LabelApiMethods,
    ChecklistApiMethods,
    CommentApiMethods,
    ActivityApiMethods,
    InviteApiMethods,
    AdminUserApiMethods,
    AdminSystemApiMethods,
    AdminBackupApiMethods,
    AdminDatabaseApiMethods,
    UserApiMethods,
    ImportExportApiMethods,
    AttachmentApiMethods,
    ThemesApiMethods {}

Object.assign(ApiClient.prototype, authApiMethods);
Object.assign(ApiClient.prototype, workspaceApiMethods);
Object.assign(ApiClient.prototype, boardApiMethods);
Object.assign(ApiClient.prototype, listApiMethods);
Object.assign(ApiClient.prototype, cardApiMethods);
Object.assign(ApiClient.prototype, labelApiMethods);
Object.assign(ApiClient.prototype, checklistApiMethods);
Object.assign(ApiClient.prototype, commentApiMethods);
Object.assign(ApiClient.prototype, activityApiMethods);
Object.assign(ApiClient.prototype, inviteApiMethods);
Object.assign(ApiClient.prototype, adminUserApiMethods);
Object.assign(ApiClient.prototype, adminSystemApiMethods);
Object.assign(ApiClient.prototype, adminBackupApiMethods);
Object.assign(ApiClient.prototype, adminDatabaseApiMethods);
Object.assign(ApiClient.prototype, userApiMethods);
Object.assign(ApiClient.prototype, importExportApiMethods);
Object.assign(ApiClient.prototype, attachmentApiMethods);
Object.assign(ApiClient.prototype, themesApiMethods);

export const api = new ApiClient();
