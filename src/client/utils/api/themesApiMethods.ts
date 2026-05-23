import type { BoardThemeDefinition } from '../../../shared/boardTheme.js';
import type { ApiClient } from '../api.js';

export interface ThemesCatalogResponse {
  readonly systemThemes: BoardThemeDefinition[];
  readonly customThemes: BoardThemeDefinition[];
  readonly themes: BoardThemeDefinition[];
}

export interface ThemesApiMethods {
  getThemes(boardId?: string): Promise<ThemesCatalogResponse>;
}

export const themesApiMethods: ThemesApiMethods = {
  async getThemes(this: ApiClient, boardId) {
    const params = new URLSearchParams();
    if (boardId != null && boardId.trim() !== '') {
      params.set('boardId', boardId.trim());
    }
    const query = params.toString();
    const response = await this.client.get(`/themes${query !== '' ? `?${query}` : ''}`);
    return response.data as ThemesCatalogResponse;
  },
};
