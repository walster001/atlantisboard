import type { ImportPreflightPayload } from '../../../shared/import/importPreflight.js';
import type { ApiClient } from '../api.js';

export interface ImportExportApiMethods {
  importTrello(
    file: File,
    workspaceId?: string,
    defaultUncolouredCardColour?: string,
    preflight?: ImportPreflightPayload,
  ): Promise<{ message: string; jobId: string }>;
  importWekan(
    file: File,
    defaultUncolouredCardColour?: string,
    preflight?: ImportPreflightPayload,
  ): Promise<{ message: string; jobId: string }>;
  importCSV(
    file: File,
    boardId: string,
    delimiter?: ',' | '\t',
    defaultUncolouredCardColour?: string,
  ): Promise<{ message: string; jobId: string }>;
  getImportJobStatus(jobId: string): Promise<{ job: unknown }>;
  exportBoardAsJSON(boardId: string): Promise<void>;
  exportBoardAsCSV(boardId: string, columns?: string[]): Promise<void>;
}

export const importExportApiMethods: ImportExportApiMethods = {
  async importTrello(this: ApiClient, file, workspaceId, defaultUncolouredCardColour, preflight) {
    const formData = new FormData();
    formData.append('file', file);
    if (workspaceId) formData.append('workspaceId', workspaceId);
    if (defaultUncolouredCardColour) formData.append('defaultUncolouredCardColour', defaultUncolouredCardColour);
    if (preflight !== undefined) formData.append('preflight', JSON.stringify(preflight));
    const response = await this.client.post('/import/trello', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { message: string; jobId: string };
  },

  async importWekan(this: ApiClient, file, defaultUncolouredCardColour, preflight) {
    const formData = new FormData();
    formData.append('file', file);
    if (defaultUncolouredCardColour) formData.append('defaultUncolouredCardColour', defaultUncolouredCardColour);
    if (preflight !== undefined) formData.append('preflight', JSON.stringify(preflight));
    const response = await this.client.post('/import/wekan', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { message: string; jobId: string };
  },

  async importCSV(this: ApiClient, file, boardId, delimiter, defaultUncolouredCardColour) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('boardId', boardId);
    if (delimiter) formData.append('delimiter', delimiter);
    if (defaultUncolouredCardColour) formData.append('defaultUncolouredCardColour', defaultUncolouredCardColour);
    const response = await this.client.post('/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { message: string; jobId: string };
  },

  async getImportJobStatus(this: ApiClient, jobId) {
    const response = await this.client.get(`/import/jobs/${jobId}`);
    return response.data as { job: unknown };
  },

  async exportBoardAsJSON(this: ApiClient, boardId) {
    const response = await this.client.get(`/export/boards/${boardId}/json`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `board-${boardId}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async exportBoardAsCSV(this: ApiClient, boardId, columns) {
    const params = columns && columns.length > 0 ? `?columns=${columns.join(',')}` : '';
    const response = await this.client.get(`/export/boards/${boardId}/csv${params}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `board-${boardId}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
