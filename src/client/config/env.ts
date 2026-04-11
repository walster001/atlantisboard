/**
 * Browser-safe environment configuration
 * Replaces process.env usage in client code
 */

// Define process if it doesn't exist (for browser compatibility)
if (typeof process === 'undefined') {
  // @ts-expect-error - Defining process for browser
  globalThis.process = {
    env: {
      NODE_ENV: 'development',
      API_BASE_URL: '',
      SOCKET_URL: '',
    },
  };
}

export const env = {
  NODE_ENV: (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development') || 'development',
  API_BASE_URL: (typeof process !== 'undefined' ? process.env.API_BASE_URL : '') || '',
  SOCKET_URL: (typeof process !== 'undefined' ? process.env.SOCKET_URL : '') || '',
};
