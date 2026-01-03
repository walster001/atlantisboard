/**
 * Storage Helper - Direct Backend S3/MinIO Storage Operations
 * 
 * Provides direct API calls to backend storage endpoints without Supabase abstraction.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';

export interface UploadResult {
  path: string;
  url: string;
  publicUrl: string;
}

export interface StorageResult<T> {
  data: T | null;
  error: Error | null;
}

/**
 * Upload a file to storage
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob
): Promise<StorageResult<UploadResult>> {
  const accessToken = localStorage.getItem('access_token');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);

  try {
    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/storage/${bucket}/upload`, {
      method: 'POST',
      body: formData,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
      return {
        data: null,
        error: new Error(errorData.error || errorData.message || `HTTP ${response.status}`),
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

/**
 * Extract storage path from a storage URL
 * Handles both MinIO/S3 format and API proxy format
 * 
 * MinIO format: http://localhost:9000/atlantisboard-branding/path/to/file.png
 * API proxy format: /api/storage/branding/path/to/file.png
 * 
 * @param url - The storage URL
 * @param bucket - The bucket name (e.g., 'branding', 'fonts', 'card-attachments')
 * @returns The storage path, or null if extraction fails
 */
export function extractStoragePathFromUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  
  // Try MinIO/S3 format first: ${prefix}-${bucket}/path
  // Look for pattern like "-branding/" or "-fonts/" etc.
  const minioPattern = `-${bucket}/`;
  const minioIndex = url.indexOf(minioPattern);
  if (minioIndex !== -1) {
    const path = url.substring(minioIndex + minioPattern.length);
    return path || null;
  }
  
  // Fall back to API proxy format: /api/storage/${bucket}/path
  const apiPattern = `/api/storage/${bucket}/`;
  const apiIndex = url.indexOf(apiPattern);
  if (apiIndex !== -1) {
    const path = url.substring(apiIndex + apiPattern.length);
    // Decode URI component in case it was encoded
    try {
      return decodeURIComponent(path) || null;
    } catch {
      return path || null;
    }
  }
  
  return null;
}

/**
 * Delete a file from storage
 */
export async function deleteFile(
  bucket: string,
  path: string
): Promise<StorageResult<string[]>> {
  const accessToken = localStorage.getItem('access_token');
  
  try {
    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/storage/${bucket}/${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
      return {
        data: null,
        error: new Error(errorData.error || errorData.message || `HTTP ${response.status}`),
      };
    }

    return { data: [path], error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Network error'),
    };
  }
}

