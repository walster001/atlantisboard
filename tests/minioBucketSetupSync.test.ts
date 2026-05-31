import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MINIO_BUCKET_NAMES } from '../src/shared/constants/minioBuckets.js';

const SETUP_SCRIPT_PATH = join(process.cwd(), 'docker/minio/prod-setup.sh');

describe('minio bucket setup sync', () => {
  test('prod-setup.sh contains every MINIO_BUCKET_NAMES entry', () => {
    const scriptText = readFileSync(SETUP_SCRIPT_PATH, 'utf8');
    for (const bucketName of MINIO_BUCKET_NAMES) {
      expect(scriptText).toContain(bucketName);
    }
  });
});
