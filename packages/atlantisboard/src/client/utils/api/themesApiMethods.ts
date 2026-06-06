import type { BoardThemeDefinition } from '../../../shared/boardTheme.js';
import type { ApiClient } from '../api.js';

export interface ThemesCatalogResponse {
  readonly systemThemes: BoardThemeDefinition[];
  readonly customThemes: BoardThemeDefinition[];
  readonly themes: BoardThemeDefinition[];
}

export interface ThemesApiMethods {
  getThemes(): Promise<ThemesCatalogResponse>;
}

export const themesApiMethods: ThemesApiMethods = {
  async getThemes(this: ApiClient) {
    const response = await this.client.get('/themes');
    return response.data as ThemesCatalogResponse;
  },
};
