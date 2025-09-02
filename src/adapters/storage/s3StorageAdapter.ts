/**
 * AWS S3 Storage Adapter
 * 
 * Handles file storage in AWS S3 for production environment.
 * Uses signed URLs for secure file access with configurable TTL.
 * 
 * Features:
 * - AWS S3 SDK integration
 * - Signed URL generation with expiration
 * - Organization-based S3 key structure
 * - Secure file access control
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { 
  StorageAdapter, 
  UploadedFile, 
  StorageResult, 
  DownloadUrlOptions 
} from './storageAdapter';
import { InternalServerError, ValidationError } from '../../utils/error/error';

export class S3StorageAdapter implements StorageAdapter {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor() {
    // Validate required environment variables
    this.bucketName = process.env.AWS_S3_BUCKET_NAME!;
    this.region = process.env.AWS_REGION || 'us-east-1';

    if (!this.bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME environment variable is required for S3 storage');
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are required for S3 storage');
    }

    if (!this.bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME is required');
    }

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    console.log(`☁️ S3 Storage Adapter initialized for bucket: ${this.bucketName}`);
  }

  /**
   * Generate S3 key for file with organization structure
   */
  private getS3Key(organizationId: string, fileName: string): string {
    return `documents/${organizationId}/${fileName}`;
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    file: UploadedFile,
    organizationId: string,
    fileName: string
  ): Promise<StorageResult> {
    try {
      const s3Key = this.getS3Key(organizationId, fileName);

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimeType,
        ContentLength: file.size,
        // Add metadata
        Metadata: {
          originalName: file.originalName,
          organizationId,
          uploadedAt: new Date().toISOString(),
        },
        // Server-side encryption
        ServerSideEncryption: 'AES256',
      });

      await this.s3Client.send(command);

      // Generate S3 URL (not for direct access, will use signed URLs)
      const fileUrl = `s3://${this.bucketName}/${s3Key}`;

      console.log(`☁️ File uploaded to S3: ${s3Key}`);

      return {
        fileUrl, // Store S3 URI in database
        fileName,
        fileSize: file.size,
        mimeType: file.mimeType,
      };

    } catch (error) {
      console.error('❌ S3 file upload error:', error);
      throw new InternalServerError('Failed to upload file to S3');
    }
  }

  /**
   * Generate signed URL for secure file access
   */
  async getDownloadUrl(
    fileUrl: string,
    options?: DownloadUrlOptions
  ): Promise<string> {
    try {
      // Extract S3 key from stored URL
      let s3Key: string;
      
      if (fileUrl.startsWith('s3://')) {
        // Parse S3 URI: s3://bucket/key
        const s3Uri = fileUrl.replace('s3://', '');
        const [bucket, ...keyParts] = s3Uri.split('/');
        s3Key = keyParts.join('/');
        
        // Validate bucket matches configuration
        if (bucket !== this.bucketName) {
          throw new ValidationError('File bucket does not match configured bucket');
        }
      } else {
        // Assume it's already a key
        s3Key = fileUrl;
      }

      // Create GetObject command for signed URL
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      // Generate signed URL with expiration
      const expiresIn = options?.expiresIn || 300; // Default 5 minutes
      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      console.log(`🔐 Generated signed URL for ${s3Key} (expires in ${expiresIn}s)`);
      
      return signedUrl;

    } catch (error) {
      console.error('❌ Error generating S3 signed URL:', error);
      throw new InternalServerError('Failed to generate download URL');
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(fileUrl: string): Promise<boolean> {
    try {
      // Extract S3 key from stored URL
      let s3Key: string;
      
      if (fileUrl.startsWith('s3://')) {
        const s3Uri = fileUrl.replace('s3://', '');
        const [bucket, ...keyParts] = s3Uri.split('/');
        s3Key = keyParts.join('/');
      } else {
        s3Key = fileUrl;
      }

      // Delete from S3
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);

      console.log(`🗑️ File deleted from S3: ${s3Key}`);
      return true;

    } catch (error) {
      console.error('❌ Error deleting S3 file:', error);
      return false;
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(fileUrl: string): Promise<boolean> {
    try {
      // Extract S3 key from stored URL
      let s3Key: string;
      
      if (fileUrl.startsWith('s3://')) {
        const s3Uri = fileUrl.replace('s3://', '');
        const [bucket, ...keyParts] = s3Uri.split('/');
        s3Key = keyParts.join('/');
      } else {
        s3Key = fileUrl;
      }

      // Check if object exists using HeadObject
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);
      return true;

    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // Other errors are unexpected
      console.error('❌ Error checking S3 file existence:', error);
      return false;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(fileUrl: string): Promise<{
    size: number;
    lastModified: Date;
    mimeType?: string;
  }> {
    try {
      // Extract S3 key from stored URL
      let s3Key: string;
      
      if (fileUrl.startsWith('s3://')) {
        const s3Uri = fileUrl.replace('s3://', '');
        const [bucket, ...keyParts] = s3Uri.split('/');
        s3Key = keyParts.join('/');
      } else {
        s3Key = fileUrl;
      }

      // Get object metadata
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        mimeType: response.ContentType,
      };

    } catch (error) {
      console.error('❌ Error getting S3 file metadata:', error);
      throw new InternalServerError('Failed to get file metadata');
    }
  }
}