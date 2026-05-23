import type { BoardExportFormat } from '../../../shared/export/boardExportFormats.js';
import type { ApiClient } from '../api.js';
import { downloadBlob, parseContentDispositionFilename } from '../downloadBlob.js';

export interface ImportExportApiMethods {
  importTrello(
    file: File,
    workspaceId?: string,
    defaultUncolouredCardColour?: string,
    preflight?: import('../../../shared/import/importPreflight.js').ImportPreflightPayload,
  ): Promise<{ message: string; jobId: string }>;
  importWekan(
    file: File,
    defaultUncolouredCardColour?: string,
    preflight?: import('../../../shared/import/importPreflight.js').ImportPreflightPayload,
  ): Promise<{ message: string; jobId: string }>;
  importCSV(
    file: File,
    boardId: string,
    delimiter?: ',' | '\t',
    defaultUncolouredCardColour?: string,
  ): Promise<{ message: string; jobId: string }>;
  importAtlantisboard(
    file: File,
    workspaceId?: string,
  ): Promise<{ message: string; jobId: string }>;
  getImportJobStatus(jobId: string): Promise<{ job: unknown }>;
  exportBoard(boardId: string, format: BoardExportFormat): Promise<string>;
  exportBoardAsJSON(boardId: string): Promise<void>;
  exportBoardAsCSV(boardId: string, columns?: string[]): Promise<void>;
}

async function downloadBoardExportResponse(
  response: { data: Blob; headers: Record<string, unknown> },
  fallbackFilename: string,
): Promise<string> {
  const disposition =
    typeof response.headers['content-disposition'] === 'string'
      ? response.headers['content-disposition']
      : undefined;
  const filename = parseContentDispositionFilename(disposition, fallbackFilename);
  downloadBlob(response.data, filename);
  return filename;
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

  async importAtlantisboard(this: ApiClient, file, workspaceId) {
    const formData = new FormData();
    formData.append('file', file);
    if (workspaceId) formData.append('workspaceId', workspaceId);
    const response = await this.client.post('/import/atlantisboard', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { message: string; jobId: string };
  },

  async getImportJobStatus(this: ApiClient, jobId) {
    const response = await this.client.get(`/import/jobs/${jobId}`);
    return response.data as { job: unknown };
  },

  async exportBoard(this: ApiClient, boardId, format) {
    const response = await this.client.get(`/export/boards/${boardId}/${format}`, { responseType: 'blob' });
    return downloadBoardExportResponse(response, `board-${boardId}.${format === 'csv' ? 'csv' : 'json'}`);
  },

  async exportBoardAsJSON(this: ApiClient, boardId) {
    await this.exportBoard(boardId, 'atlantisboard');
  },

  async exportBoardAsCSV(this: ApiClient, boardId, columns) {
    const params = columns != null && columns.length > 0 ? `?columns=${columns.join(',')}` : '';
    const response = await this.client.get(`/export/boards/${boardId}/csv${params}`, { responseType: 'blob' });
    await downloadBoardExportResponse(response, `board-${boardId}.csv`);
  },
};
