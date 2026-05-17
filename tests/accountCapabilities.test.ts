/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  accountCapabilitiesFromFlags,
  flagsFromAccountCapabilities,
} from '../src/shared/accountCapabilities.js';

describe('account capabilities', () => {
  it('maps flags to capability keys and back', () => {
    const caps = accountCapabilitiesFromFlags({
      canImportBoards: true,
      canCreateWorkspace: false,
    });
    expect(caps).toEqual(['import.display']);
    expect(flagsFromAccountCapabilities(caps)).toEqual({
      canImportBoards: true,
      canCreateWorkspace: false,
    });
  });

  it('returns both flags when both capabilities are set', () => {
    const caps = accountCapabilitiesFromFlags({
      canImportBoards: true,
      canCreateWorkspace: true,
    });
    expect(caps).toContain('import.display');
    expect(caps).toContain('workspaces.create');
    expect(flagsFromAccountCapabilities(caps).canImportBoards).toBe(true);
    expect(flagsFromAccountCapabilities(caps).canCreateWorkspace).toBe(true);
  });
});
