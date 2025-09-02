/**
 * Storage Adapter Factory
 * 
 * Selects the appropriate storage adapter based on environment configuration.
 * - Local development: LocalStorageAdapter
 * - Production: S3StorageAdapter
 */

import { StorageAdapter } from './storageAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';
import { S3StorageAdapter } from './s3StorageAdapter';

/**
 * Storage configuration options
 */
export interface StorageConfig {
  provider: 'local' | 's3';
  // Add more provider-specific config as needed
}

/**
 * Get storage configuration from environment
 */
function getStorageConfig(): StorageConfig {
  const provider = process.env.STORAGE_PROVIDER || 
    (process.env.NODE_ENV === 'production' ? 's3' : 'local');

  return {
    provider: provider as 'local' | 's3',
  };
}

/**
 * Create and return the appropriate storage adapter
 */
export function createStorageAdapter(): StorageAdapter {
  const config = getStorageConfig();

  switch (config.provider) {
    case 'local':
      console.log('📁 Using Local Storage Adapter');
      return new LocalStorageAdapter();
      
    case 's3':
      console.log('☁️ Using S3 Storage Adapter');
      return new S3StorageAdapter();
      
    default:
      throw new Error(`Unsupported storage provider: ${config.provider}`);
  }
}

// Export singleton instance
export const storageAdapter = createStorageAdapter();

// Export types and classes for direct use if needed
export { StorageAdapter, UploadedFile, StorageResult } from './storageAdapter';
export { LocalStorageAdapter } from './localStorageAdapter';
export { S3StorageAdapter } from './s3StorageAdapter';