/**
 * Browser API Type Definitions
 * 
 * Type definitions for browser APIs that may not be available in all environments
 * or may not be fully typed in TypeScript's DOM types.
 */

/**
 * EyeDropper API interface
 * https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper_API
 */
export interface EyeDropper {
  open(): Promise<{ sRGBHex: string }>;
}

/**
 * Extended Window interface to include EyeDropper API
 */
declare global {
  interface Window {
    EyeDropper?: { new (): EyeDropper };
  }
}

