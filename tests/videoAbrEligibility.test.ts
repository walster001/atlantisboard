import { afterEach, describe, expect, it } from 'bun:test';
import {
  isVideoAbrEligible,
  resetVideoAbrEligibilityCacheForTests,
  VIDEO_ABR_MIN_VCPU_DEFAULT,
} from '../src/server/services/attachmentService/videoAbrEligibility.js';

describe('videoAbrEligibility', () => {
  const priorEnabled = process.env.VIDEO_ABR_ENABLED;
  const priorMin = process.env.VIDEO_ABR_MIN_VCPU;

  afterEach(() => {
    if (priorEnabled === undefined) {
      delete process.env.VIDEO_ABR_ENABLED;
    } else {
      process.env.VIDEO_ABR_ENABLED = priorEnabled;
    }
    if (priorMin === undefined) {
      delete process.env.VIDEO_ABR_MIN_VCPU;
    } else {
      process.env.VIDEO_ABR_MIN_VCPU = priorMin;
    }
    resetVideoAbrEligibilityCacheForTests();
  });

  it('defaults min vCPU threshold to 4', () => {
    expect(VIDEO_ABR_MIN_VCPU_DEFAULT).toBe(4);
  });

  it('honours VIDEO_ABR_ENABLED=false', () => {
    process.env.VIDEO_ABR_ENABLED = 'false';
    expect(isVideoAbrEligible()).toBe(false);
  });

  it('honours VIDEO_ABR_ENABLED=true', () => {
    process.env.VIDEO_ABR_ENABLED = 'true';
    expect(isVideoAbrEligible()).toBe(true);
  });
});
