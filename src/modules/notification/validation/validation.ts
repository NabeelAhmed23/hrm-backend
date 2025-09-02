import { z } from 'zod';
import { NotificationType } from '../../../../generated/prisma';

/**
 * Validation schema for creating a new notification
 */
export const createNotificationSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title cannot exceed 200 characters')
    .trim(),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(1000, 'Message cannot exceed 1000 characters')
    .trim(),
  type: z.nativeEnum(NotificationType),
  metadata: z
    .record(z.string(), z.any())
    .optional(),
  userId: z
    .string()
    .uuid('User ID must be a valid UUID')
    .optional(),
});

/**
 * Validation schema for notification ID parameter
 */
export const notificationIdSchema = z.object({
  id: z
    .string()
    .uuid('Notification ID must be a valid UUID')
});

/**
 * Validation schema for marking notification as read
 */
export const markAsReadSchema = z.object({
  // No additional fields needed - just the ID from params
});

/**
 * Validation schema for listing notifications query parameters
 */
export const listNotificationsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => val > 0, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 20)
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  unreadOnly: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default(false),
  since: z
    .string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine(
      (date) => !date || !isNaN(date.getTime()), 
      'Since must be a valid ISO date string'
    ),
  type: z
    .string()
    .optional()
    .refine(
      (val) => !val || Object.values(NotificationType).includes(val as NotificationType),
      'Invalid notification type filter'
    )
    .transform((val) => val as NotificationType | undefined),
});

/**
 * Validation schema for polling notifications (since timestamp)
 */
export const pollingQuerySchema = z.object({
  since: z
    .string()
    .transform((val) => new Date(val))
    .refine((date) => !isNaN(date.getTime()), 'Since must be a valid ISO date string'),
  limit: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 50)
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
});

// Type inference from schemas
export type CreateNotificationRequest = z.infer<typeof createNotificationSchema>;
export type NotificationIdParams = z.infer<typeof notificationIdSchema>;
export type MarkAsReadRequest = z.infer<typeof markAsReadSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type PollingQuery = z.infer<typeof pollingQuerySchema>;

// Example metadata schemas for different notification types
export const inviteMetadataSchema = z.object({
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  inviteLink: z.string().url().optional(),
});

export const documentMetadataSchema = z.object({
  documentId: z.string().uuid(),
  documentName: z.string(),
  uploadedBy: z.string(),
  fileType: z.string(),
});

export const alertMetadataSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  actionRequired: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
});

export const reminderMetadataSchema = z.object({
  dueDate: z.string().datetime(),
  taskType: z.string(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const infoMetadataSchema = z.object({
  category: z.string().optional(),
  url: z.string().url().optional(),
  buttons: z.array(z.object({
    label: z.string(),
    action: z.string(),
    url: z.string().url().optional(),
  })).optional(),
});

// Type inference for metadata schemas
export type InviteMetadata = z.infer<typeof inviteMetadataSchema>;
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
export type AlertMetadata = z.infer<typeof alertMetadataSchema>;
export type ReminderMetadata = z.infer<typeof reminderMetadataSchema>;
export type InfoMetadata = z.infer<typeof infoMetadataSchema>;