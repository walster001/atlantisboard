/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { resolveResponsiveTierByWidth } from '../src/client/hooks/useResponsiveTier.js';

describe('responsive tier width mapping', () => {
  it('maps phone widths to mobile', () => {
    expect(resolveResponsiveTierByWidth(360)).toBe('mobile');
    expect(resolveResponsiveTierByWidth(767)).toBe('mobile');
  });

  it('maps tablet widths to tablet', () => {
    expect(resolveResponsiveTierByWidth(768)).toBe('tablet');
    expect(resolveResponsiveTierByWidth(1024)).toBe('tablet');
    expect(resolveResponsiveTierByWidth(1199)).toBe('tablet');
  });

  it('maps desktop widths to desktop', () => {
    expect(resolveResponsiveTierByWidth(1200)).toBe('desktop');
    expect(resolveResponsiveTierByWidth(1920)).toBe('desktop');
  });
});
