/**
 * Storage Service - S3-Compatible File Storage
 * 
 * Handles file uploads, downloads, and deletions using S3-compatible storage.
 * Supports MinIO for local development and AWS S3 or other S3-compatible services for production.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { env } from '../config/env.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

class StorageService {
  private s3Client: S3Client | null = null;
  private bucketPrefix: string;

  constructor() {
    this.bucketPrefix = env.S3_BUCKET_PREFIX || 'atlantisboard';

    // Initialize S3 client if credentials are provided
    if (env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY) {
      this.s3Client = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY,
          secretAccessKey: env.S3_SECRET_KEY,
        },
        forcePathStyle: true, // Required for MinIO
      });
    }
  }

  /**
   * Get bucket name with prefix
   */
  private getBucketName(bucket: string): string {
    return `${this.bucketPrefix}-${bucket}`;
  }

  /**
   * Check if storage is configured
   */
  isConfigured(): boolean {
    return this.s3Client !== null;
  }

  /**
   * Upload file to storage
   */
  async upload(bucket: string, path: string, file: Buffer, contentType?: string): Promise<string> {
    if (!this.s3Client) {
      throw new ValidationError('Storage not configured. Please configure S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY environment variables.');
    }

    const bucketName = this.getBucketName(bucket);

    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: path,
        Body: file,
        ContentType: contentType || 'application/octet-stream',
      });

      await this.s3Client.send(command);

      // Return public URL (for MinIO/S3)
      if (env.S3_ENDPOINT) {
        const baseUrl = env.S3_ENDPOINT.replace(/\/$/, '');
        return `${baseUrl}/${bucketName}/${path}`;
      }

      return path;
    } catch (error: any) {
      console.error('[Storage] Upload error:', error);
      const errorMessage = error.message || 'Unknown error';
      if (error.name === 'NoSuchBucket') {
        throw new ValidationError(`Bucket "${bucketName}" does not exist. Please create it in your MinIO/S3 storage.`);
      }
      throw new ValidationError(`Failed to upload file to ${bucket}: ${errorMessage}`);
    }
  }

  /**
   * Get file download URL (signed URL for private files)
   */
  async getDownloadUrl(bucket: string, path: string, expiresIn: number = 3600): Promise<string> {
    if (!this.s3Client) {
      throw new ValidationError('Storage not configured. Please configure S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY environment variables.');
    }

    const bucketName = this.getBucketName(bucket);

    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: path,
      });

      // Generate signed URL (valid for expiresIn seconds)
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error: any) {
      console.error('[Storage] Get URL error:', error);
      if (error.name === 'NoSuchBucket' || error.name === 'NoSuchKey') {
        throw new NotFoundError(`File not found: ${path}`);
      }
      throw new NotFoundError(`Failed to generate download URL: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get public URL (for public buckets)
   */
  getPublicUrl(bucket: string, path: string): string {
    if (!env.S3_ENDPOINT) {
      // If no endpoint configured, return a relative path that can be served by the API
      return `/api/storage/${bucket}/${encodeURIComponent(path)}`;
    }

    const bucketName = this.getBucketName(bucket);
    const baseUrl = env.S3_ENDPOINT.replace(/\/$/, '');
    return `${baseUrl}/${bucketName}/${path}`;
  }

  /**
   * Download file
   */
  async download(bucket: string, path: string): Promise<{ stream: Readable; contentType?: string; contentLength?: number }> {
    if (!this.s3Client) {
      throw new ValidationError('Storage not configured');
    }

    const bucketName = this.getBucketName(bucket);

    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: path,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundError(`File not found: ${path}`);
      }

      return {
        stream: response.Body as Readable,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    } catch (error: any) {
      console.error('[Storage] Download error:', error);
      throw new NotFoundError(`File not found: ${path}`);
    }
  }

  /**
   * Delete file
   */
  async delete(bucket: string, path: string): Promise<void> {
    if (!this.s3Client) {
      throw new ValidationError('Storage not configured. Please configure S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY environment variables.');
    }

    const bucketName = this.getBucketName(bucket);

    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: path,
      });

      await this.s3Client.send(command);
    } catch (error: any) {
      console.error('[Storage] Delete error:', error);
      const errorMessage = error.message || 'Unknown error';
      if (error.name === 'NoSuchBucket') {
        throw new ValidationError(`Bucket "${bucketName}" does not exist.`);
      }
      throw new ValidationError(`Failed to delete file from ${bucket}: ${errorMessage}`);
    }
  }

  /**
   * Check if file exists
   */
  async exists(bucket: string, path: string): Promise<boolean> {
    if (!this.s3Client) {
      return false;
    }

    const bucketName = this.getBucketName(bucket);

    try {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: path,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}

export const storageService = new StorageService();

