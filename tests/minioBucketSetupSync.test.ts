import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MINIO_BUCKET_NAMES } from '../src/shared/constants/minioBuckets.js';

const SETUP_SCRIPT_PATH = join(process.cwd(), 'docker/minio/prod-setup.sh');
const POLICY_PATH = join(process.cwd(), 'docker/minio/app-readwrite-policy.json');

describe('minio bucket setup sync', () => {
  test('prod-setup.sh contains every MINIO_BUCKET_NAMES entry', () => {
    const scriptText = readFileSync(SETUP_SCRIPT_PATH, 'utf8');
    for (const bucketName of MINIO_BUCKET_NAMES) {
      expect(scriptText).toContain(bucketName);
    }
  });

  test('app-readwrite-policy.json allows multipart uploads for scoped app user', () => {
    const policyText = readFileSync(POLICY_PATH, 'utf8');
    expect(policyText).toContain('s3:AbortMultipartUpload');
    expect(policyText).toContain('s3:ListMultipartUploadParts');
    expect(policyText).toContain('s3:ListBucketMultipartUploads');
  });

  test('prod-setup.sh refreshes IAM policy on redeploy', () => {
    const scriptText = readFileSync(SETUP_SCRIPT_PATH, 'utf8');
    expect(scriptText).toContain('mc admin policy rm myminio kanboard-app-rw');
    expect(scriptText).toContain('mc admin policy create myminio kanboard-app-rw');
  });
});
