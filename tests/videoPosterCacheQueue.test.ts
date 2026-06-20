import { afterEach, describe, expect, test } from 'bun:test';
import {
  getVideoPosterCacheQueueDepthForTests,
  resetVideoPosterCacheQueueForTests,
  scheduleVideoPosterCache,
} from '../src/server/services/attachmentService/videoPosterCache.js';

describe('videoPosterCache queue bounds', () => {
  const originalMaxQueue = process.env.VIDEO_POSTER_CACHE_MAX_QUEUE;

  afterEach(() => {
    if (originalMaxQueue == null) {
      delete process.env.VIDEO_POSTER_CACHE_MAX_QUEUE;
    } else {
      process.env.VIDEO_POSTER_CACHE_MAX_QUEUE = originalMaxQueue;
    }
    resetVideoPosterCacheQueueForTests();
  });

  test('drops oldest pending jobs when queue exceeds max size', () => {
    process.env.VIDEO_POSTER_CACHE_MAX_QUEUE = '2';
    resetVideoPosterCacheQueueForTests();

    scheduleVideoPosterCache({ objectName: 'a/video1.mp4', contentType: 'video/mp4' });
    scheduleVideoPosterCache({ objectName: 'a/video2.mp4', contentType: 'video/mp4' });
    scheduleVideoPosterCache({ objectName: 'a/video3.mp4', contentType: 'video/mp4' });

    expect(getVideoPosterCacheQueueDepthForTests()).toBe(2);
  });
});
