/**
 * API Client - Replaces Supabase client
 * Provides a compatibility layer that mimics Supabase client behavior
 */

import { getRealtimeClient } from './realtime';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';

// Ensure base URL doesn't have trailing slash
const normalizeBaseUrl = (url: string): string => {
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    
    // Load tokens from localStorage
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('access_token');
      this.refreshToken = localStorage.getItem('refresh_token');
    }
  }

  setAuth(accessToken: string | null, refreshToken?: string | null) {
    this.accessToken = accessToken;
    if (refreshToken !== undefined) {
      this.refreshToken = refreshToken;
    }
    
    if (typeof window !== 'undefined') {
      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
      } else {
        localStorage.removeItem('access_token');
      }
      
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
      } else if (refreshToken === null) {
        localStorage.removeItem('refresh_token');
      }
    }
  }

  clearAuth() {
    this.setAuth(null, null);
  }

  // Made public so TableQuery class can access it
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T | null; error: Error | null }> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle token refresh on 401
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry request with new token
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, {
            ...options,
            headers,
          });
          
          if (retryResponse.ok) {
            const data = await retryResponse.json();
            return { data, error: null };
          }
        }
      }

      if (!response.ok) {
        // Handle rate limiting specifically
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || response.headers.get('X-RateLimit-Reset');
          const errorMessage = retryAfter 
            ? `Too many requests. Please try again in ${retryAfter} seconds.`
            : 'Too many requests. Please try again later.';
          return {
            data: null,
            error: new Error(errorMessage),
          };
        }
        
        const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
        const errorMessage = errorData.error || errorData.message || errorData.errors?.[0] || `HTTP ${response.status}`;
        return {
          data: null,
          error: new Error(errorMessage),
        };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Network error'),
      };
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        this.clearAuth();
        return false;
      }

      const { accessToken, refreshToken: newRefreshToken } = await response.json();
      this.setAuth(accessToken, newRefreshToken);
      return true;
    } catch {
      this.clearAuth();
      return false;
    }
  }

  // Auth methods
  auth = {
    signInWithPassword: async (email: string, password: string) => {
      const result = await this.request<{
        user: { id: string; email: string; fullName: string | null; isAdmin: boolean };
        accessToken: string;
        refreshToken: string;
      }>('/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (result.data) {
        this.setAuth(result.data.accessToken, result.data.refreshToken);
      }

      return result;
    },

    signUp: async (email: string, password: string, fullName?: string) => {
      const result = await this.request<{
        user: { id: string; email: string; fullName: string | null; isAdmin: boolean };
        accessToken: string;
        refreshToken: string;
      }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName }),
      });

      if (result.data) {
        this.setAuth(result.data.accessToken, result.data.refreshToken);
      }

      return result;
    },

    signInWithOAuth: async (provider: 'google') => {
      // Redirect to OAuth provider
      const redirectUrl = `${this.baseUrl}/auth/${provider}`;
      window.location.href = redirectUrl;
    },

    signOut: async () => {
      if (this.refreshToken) {
        await this.request('/auth/signout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      }
      this.clearAuth();
    },

    getSession: async () => {
      if (!this.accessToken) {
        return { data: { session: null }, error: null };
      }

      // Verify token is still valid by making a request
      const result = await this.request<{
        id: string;
        email: string;
        fullName: string | null;
        isAdmin: boolean;
        avatarUrl: string | null;
      }>('/auth/me');
      
      if (result.error) {
        this.clearAuth();
        return { data: { session: null }, error: result.error };
      }

      if (!result.data) {
        this.clearAuth();
        return { data: { session: null }, error: new Error('No user data') };
      }

      return {
        data: {
          session: {
            access_token: this.accessToken,
            refresh_token: this.refreshToken,
            user: {
              id: result.data.id,
              email: result.data.email,
              app_metadata: {
                provider: (result.data as any).provider || 'email', // Use provider from API response
              },
              user_metadata: {
                avatar_url: result.data.avatarUrl,
                full_name: result.data.fullName,
                is_admin: result.data.isAdmin, // Include admin status in user metadata
              },
            },
          },
        },
        error: null,
      };
    },
  };

  // Database methods (mimics Supabase .from() syntax)
  from(table: string) {
    return new TableQuery(table, this);
  }

  // RPC methods (for database functions)
  rpc(functionName: string, params?: Record<string, unknown>) {
    return this.request(`/rpc/${functionName}`, {
      method: 'POST',
      body: params ? JSON.stringify(params) : undefined,
    });
  }

  // Functions (RPC endpoints)
  functions = {
    invoke: async (functionName: string, options?: { body?: unknown }) => {
      // Map function names to API endpoints
      const functionMap: Record<string, string> = {
        'verify-user-email': '/auth/verify-email',
        'generate-invite-token': '/boards/invites/generate',
        'redeem-invite-token': '/invites/redeem',
        'import-wekan-board': '/boards/import',
        'save-mysql-config': '/admin/mysql-config',
        'test-mysql-connection': '/admin/mysql-config/test',
        'create-board': '/boards',
      };

      const endpoint = functionMap[functionName] || `/functions/${functionName}`;
      const result = await this.request(endpoint, {
        method: 'POST',
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      return result;
    },
  };

  // Storage methods (mimics Supabase storage API)
  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: File | Blob, options?: { upsert?: boolean }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);

        const result = await this.request(`/storage/${bucket}/upload`, {
          method: 'POST',
          body: formData,
          headers: {}, // Let browser set Content-Type with boundary for FormData
        });

        if (result.error) {
          return { data: null, error: result.error };
        }

        const uploadResult = result.data as { path: string; url: string; publicUrl: string };
        return { 
          data: { 
            path: uploadResult.path, 
            fullPath: uploadResult.url,
            publicUrl: uploadResult.publicUrl 
          }, 
          error: null 
        };
      },

      remove: async (paths: string[]) => {
        const results = await Promise.all(
          paths.map(async (path) => {
            const result = await this.request(`/storage/${bucket}/${encodeURIComponent(path)}`, {
              method: 'DELETE',
            });
            return result;
          })
        );

        const errors = results.filter((r) => r.error);
        if (errors.length > 0) {
          return { data: null, error: errors[0].error };
        }

        return { data: paths, error: null };
      },

      getPublicUrl: async (path: string) => {
        // Fetch the actual public URL from the backend
        const result = await this.request<{ publicUrl: string }>(`/storage/${bucket}/${encodeURIComponent(path)}/public-url`, {
          method: 'GET',
        });

        if (result.error) {
          return { data: null, error: result.error };
        }

        return { data: { publicUrl: result.data?.publicUrl || '' } };
      },

      download: async (path: string) => {
        const result = await this.request(`/storage/${bucket}/${encodeURIComponent(path)}`, {
          method: 'GET',
        });

        if (result.error) {
          return { data: null, error: result.error };
        }

        // The endpoint redirects to signed URL, so we need to fetch it
        const response = await fetch(`${this.baseUrl}/storage/${bucket}/${encodeURIComponent(path)}`, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });

        if (!response.ok) {
          return { data: null, error: new Error(`Download failed: ${response.statusText}`) };
        }

        const blob = await response.blob();
        return { data: blob, error: null };
      },
    }),
  };

  // Realtime WebSocket client
  get realtime() {
    const client = getRealtimeClient(this.baseUrl);
    
    // Sync auth token
    if (this.accessToken) {
      client.setAuth(this.accessToken);
    }
    
    return {
      setAuth: async (token: string | null) => {
        client.setAuth(token);
        this.accessToken = token;
        if (token) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('access_token', token);
          }
        } else {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('access_token');
          }
        }
        return Promise.resolve();
      },
      channel: (topic: string) => {
        return client.channel(topic);
      },
      removeChannel: (channel: any) => {
        if (typeof channel === 'string') {
          client.removeChannel(channel);
        } else if (channel?.topic) {
          client.removeChannel(channel.topic);
        }
      },
      disconnect: () => {
        client.disconnect();
      },
    };
  }
}

// Table query builder (mimics Supabase query builder)
class TableQuery {
  private table: string;
  private client: ApiClient;
  private filters: Array<{ field: string; operator: string; value: unknown }> = [];
  private selectFields: string[] = [];
  private orderBy?: { field: string; ascending: boolean };
  private limitCount?: number;
  private offsetCount?: number;
  private countOnly: boolean = false;

  constructor(table: string, client: ApiClient) {
    this.table = table;
    this.client = client;
  }

  select(fields?: string) {
    if (fields === '*') {
      this.selectFields = [];
    } else if (fields) {
      this.selectFields = fields.split(',').map((f) => f.trim());
    }
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, operator: 'eq', value });
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ field, operator: 'neq', value });
    return this;
  }

  gt(field: string, value: unknown) {
    this.filters.push({ field, operator: 'gt', value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ field, operator: 'gte', value });
    return this;
  }

  lt(field: string, value: unknown) {
    this.filters.push({ field, operator: 'lt', value });
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push({ field, operator: 'lte', value });
    return this;
  }

  like(field: string, value: string) {
    this.filters.push({ field, operator: 'like', value });
    return this;
  }

  ilike(field: string, value: string) {
    this.filters.push({ field, operator: 'ilike', value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ field, operator: 'in', value: values });
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push({ field, operator: 'is', value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy = {
      field,
      ascending: options?.ascending ?? true,
    };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single() {
    this.limitCount = 1;
    return this;
  }

  maybeSingle() {
    this.limitCount = 1;
    return this;
  }

  count(mode: 'exact' | 'estimated' = 'exact') {
    this.countOnly = true;
    // 'estimated' could be used for future optimization with approximate counts
    // For now, we always use exact count
    return this;
  }

  private buildQueryParams(): string {
    const params = new URLSearchParams();

    if (this.selectFields.length > 0) {
      params.append('select', this.selectFields.join(','));
    }

    this.filters.forEach((filter) => {
      params.append(`${filter.field}`, `${filter.operator}.${filter.value}`);
    });

    if (this.orderBy) {
      params.append('order', `${this.orderBy.field}.${this.orderBy.ascending ? 'asc' : 'desc'}`);
    }

    if (this.limitCount !== undefined) {
      params.append('limit', this.limitCount.toString());
    }

    if (this.offsetCount !== undefined) {
      params.append('offset', this.offsetCount.toString());
    }

    return params.toString();
  }

  async insert(data: unknown | unknown[]) {
    const result = await this.client.request(`/db/${this.table}`, {
      method: 'POST',
      body: JSON.stringify(Array.isArray(data) ? data : [data]),
    });

    if (result.data && Array.isArray(result.data) && result.data.length === 1) {
      return { data: result.data[0], error: result.error };
    }

    return result;
  }

  async update(data: Partial<unknown>) {
    const query = this.buildQueryParams();
    const result = await this.client.request(`/db/${this.table}?${query}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });

    return result;
  }

  async delete() {
    const query = this.buildQueryParams();
    const result = await this.client.request(`/db/${this.table}?${query}`, {
      method: 'DELETE',
    });

    return result;
  }

  then<T>(
    onFulfilled?: (value: { data: T | null; error: Error | null }) => unknown,
    onRejected?: (reason: unknown) => unknown
  ): Promise<{ data: T | null; error: Error | null }> {
    const query = this.buildQueryParams();
    const url = `/db/${this.table}?${query}`;
    console.log('[TableQuery.then] Executing query:', url);
    
    const promise = (async () => {
      try {
        // For count queries, return the number directly
        if (this.countOnly) {
          const result = await this.client.request<number>(`${url}&count=true`);
          const response: { data: T | null; error: Error | null } = { 
            data: (result.data ?? 0) as unknown as T, 
            error: result.error 
          };
          console.log('[TableQuery.then] Count query result:', response);
          return response;
        }

        console.log('[TableQuery.then] Making request to:', url);
        const result = await this.client.request<T[]>(url);
        console.log('[TableQuery.then] Request completed, result:', result);

        // Handle single() and maybeSingle()
        if (this.limitCount === 1) {
          if (Array.isArray(result.data)) {
            if (result.data.length === 0) {
              const response: { data: T | null; error: Error | null } = { data: null, error: null };
              console.log('[TableQuery.then] Empty array result (maybeSingle):', response);
              return response;
            }
            const singleData = result.data[0] as T;
            console.log('[TableQuery.then] Single result data:', singleData);
            const response: { data: T | null; error: Error | null } = { data: singleData, error: null };
            console.log('[TableQuery.then] Single result response:', response);
            return response;
          }
        }

        const response: { data: T | null; error: Error | null } = { data: result.data as T | null, error: result.error };
        console.log('[TableQuery.then] Final response:', response);
        return response;
      } catch (error) {
        console.error('[TableQuery.then] Exception in then():', error);
        throw error;
      }
    })();

    // Properly handle the callbacks for thenable protocol
    // When await is used, JavaScript calls then() with callbacks
    // We need to chain the promise and call the callbacks
    if (onFulfilled || onRejected) {
      return promise.then(onFulfilled, onRejected) as Promise<{ data: T | null; error: Error | null }>;
    }

    return promise as Promise<{ data: T | null; error: Error | null }>;
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export types for compatibility
export type { ApiClient };

