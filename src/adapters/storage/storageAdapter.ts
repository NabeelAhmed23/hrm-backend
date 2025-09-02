/**
 * Storage Adapter Interface
 * 
 * Defines the contract for file storage implementations.
 * Supports both local development and cloud production storage.
 */

export interface UploadedFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

export interface StorageResult {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface DownloadUrlOptions {
  expiresIn?: number; // seconds, for signed URLs
}

export interface StorageAdapter {
  /**
   * Upload a file to storage
   * @param file - File data and metadata
   * @param organizationId - Organization ID for folder organization
   * @param fileName - Generated unique filename
   * @returns Storage result with URL and metadata
   */
  uploadFile(
    file: UploadedFile,
    organizationId: string,
    fileName: string
  ): Promise<StorageResult>;

  /**
   * Generate a download URL for a file
   * @param fileUrl - File path or URL from storage
   * @param options - Options for URL generation (expiry, etc.)
   * @returns Download URL (direct link or signed URL)
   */
  getDownloadUrl(
    fileUrl: string,
    options?: DownloadUrlOptions
  ): Promise<string>;

  /**
   * Delete a file from storage
   * @param fileUrl - File path or URL to delete
   * @returns Success boolean
   */
  deleteFile(fileUrl: string): Promise<boolean>;

  /**
   * Check if a file exists in storage
   * @param fileUrl - File path or URL to check
   * @returns Boolean indicating existence
   */
  fileExists(fileUrl: string): Promise<boolean>;

  /**
   * Get file metadata without downloading
   * @param fileUrl - File path or URL
   * @returns File metadata
   */
  getFileMetadata(fileUrl: string): Promise<{
    size: number;
    lastModified: Date;
    mimeType?: string;
  }>;
}