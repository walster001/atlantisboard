import { describe, expect, it } from 'bun:test';
import { isMediaElementVolumeProgrammable } from '../src/client/components/card/cardDescriptionAudioVolumeControl.js';

describe('cardDescriptionAudioVolumeControl', () => {
  it('reports volume programmability from the runtime environment', () => {
    expect(typeof isMediaElementVolumeProgrammable()).toBe('boolean');
  });
});
