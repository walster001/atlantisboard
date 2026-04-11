/**
 * Client logger — no-op by default to avoid DevTools stringify / main-thread cost on hot paths.
 * Wire to an error-tracking service here if needed.
 */

export const logger = {
  info: (_message?: string, _data?: unknown): void => {
    void _message;
    void _data;
  },
  error: (
    _data?: { error?: unknown; [key: string]: unknown },
    _message?: string,
  ): void => {
    void _data;
    void _message;
  },
  warn: (_message?: string, _data?: unknown): void => {
    void _message;
    void _data;
  },
  debug: (_message?: string, _data?: unknown): void => {
    void _message;
    void _data;
  },
};
