import prisma from '../utils/config/db';
import { 
  NotFoundError, 
  AuthorizationError, 
  ValidationError,
  InternalServerError 
} from '../utils/error/error';
import { NotificationType, Role } from '../../generated/prisma';

// Service interfaces
export interface CreateNotificationRequest {
  title: string;
  message: string;
  type: NotificationType;
  metadata?: Record<string, any>;
  userId?: string; // If null, broadcasts to all org users
}

export interface NotificationResponse {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  metadata: Record<string, any> | null;
  isRead: boolean;
  createdAt: Date;
  organizationId: string;
  userId: string | null;
}

export interface ListNotificationsResponse {
  notifications: NotificationResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  unreadCount: number;
}

/**
 * In-App Notification Service
 * 
 * Manages user notifications within organizations with features:
 * - Role-based notification creation (HR/ADMIN only)
 * - User-specific and broadcast notifications
 * - Read/unread status tracking
 * - JSON metadata support for structured data
 * - Real-time notification support
 * - Pagination and filtering
 */
export class NotificationService {
  
  /**
   * Create a notification for a user or broadcast to all org users
   * 
   * @param organizationId - Organization ID (from authenticated user)
   * @param creatorRole - Role of user creating notification (must be HR/ADMIN)
   * @param data - Notification content and metadata
   * @returns Created notification(s) details
   */
  async createNotification(
    organizationId: string,
    creatorRole: Role,
    data: CreateNotificationRequest
  ): Promise<{ 
    success: boolean; 
    message: string; 
    notificationsCreated: number;
    notifications?: NotificationResponse[];
  }> {
    // Authorization: Only HR and ADMIN can create notifications
    if (!['HR', 'ADMIN', 'SUPERADMIN'].includes(creatorRole)) {
      throw new AuthorizationError('Only HR and ADMIN users can create notifications');
    }

    // Validate metadata if provided
    if (data.metadata && typeof data.metadata !== 'object') {
      throw new ValidationError('Metadata must be a valid JSON object');
    }

    try {
      const { title, message, type, metadata, userId } = data;

      if (userId) {
        // User-specific notification
        
        // Verify user exists and belongs to the same organization
        const targetUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, organizationId: true, firstName: true }
        });

        if (!targetUser) {
          throw new NotFoundError('Target user not found');
        }

        if (targetUser.organizationId !== organizationId) {
          throw new AuthorizationError('Cannot send notifications to users in other organizations');
        }

        // Create single notification
        const notification = await prisma.notification.create({
          data: {
            title,
            message,
            type,
            metadata: metadata || undefined,
            organizationId,
            userId,
          },
        });

        return {
          success: true,
          message: `Notification sent to ${targetUser.firstName}`,
          notificationsCreated: 1,
          notifications: [this.formatNotificationResponse(notification)],
        };

      } else {
        // Broadcast notification to all users in organization
        
        // Get all active users in the organization
        const orgUsers = await prisma.user.findMany({
          where: {
            organizationId,
            isActive: true,
          },
          select: { id: true, firstName: true }
        });

        if (orgUsers.length === 0) {
          throw new ValidationError('No active users found in organization to notify');
        }

        // Create notification for each user in a transaction
        const notifications = await prisma.$transaction(
          orgUsers.map(user => 
            prisma.notification.create({
              data: {
                title,
                message,
                type,
                metadata: metadata || undefined,
                organizationId,
                userId: user.id,
              },
            })
          )
        );

        return {
          success: true,
          message: `Broadcast notification sent to ${orgUsers.length} users`,
          notificationsCreated: notifications.length,
          notifications: notifications.map(n => this.formatNotificationResponse(n)),
        };
      }

    } catch (error) {
      console.error('❌ Create notification error:', error);
      
      // Re-throw known errors
      if (error instanceof NotFoundError || 
          error instanceof AuthorizationError ||
          error instanceof ValidationError) {
        throw error;
      }
      
      throw new InternalServerError('Failed to create notification');
    }
  }

  /**
   * List notifications for a user with pagination and filtering
   * 
   * @param userId - User ID requesting notifications
   * @param organizationId - User's organization ID  
   * @param options - Pagination and filter options
   * @returns Paginated list of notifications
   */
  async listUserNotifications(
    userId: string,
    organizationId: string,
    options: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      since?: Date;
      type?: NotificationType;
    } = {}
  ): Promise<ListNotificationsResponse> {
    const { page = 1, limit = 20, unreadOnly = false, since, type } = options;
    const skip = (page - 1) * limit;

    try {
      // Build where clause
      const where: any = {
        userId,
        organizationId,
      };

      if (unreadOnly) {
        where.isRead = false;
      }

      if (since) {
        where.createdAt = { gte: since };
      }

      if (type) {
        where.type = type;
      }

      // Get total count for pagination
      const total = await prisma.notification.count({ where });

      // Get notifications with pagination (unread first, then by newest)
      const notifications = await prisma.notification.findMany({
        where,
        orderBy: [
          { isRead: 'asc' },  // Unread first
          { createdAt: 'desc' } // Most recent first
        ],
        skip,
        take: limit,
      });

      // Get unread count for UI badges
      const unreadCount = await prisma.notification.count({
        where: {
          userId,
          organizationId,
          isRead: false,
        },
      });

      const totalPages = Math.ceil(total / limit);

      return {
        notifications: notifications.map(n => this.formatNotificationResponse(n)),
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
        unreadCount,
      };

    } catch (error) {
      console.error('❌ List notifications error:', error);
      throw new InternalServerError('Failed to retrieve notifications');
    }
  }

  /**
   * Mark a notification as read
   * 
   * @param notificationId - Notification ID to mark as read
   * @param userId - User ID (for authorization)
   * @param organizationId - Organization ID (for authorization)
   * @returns Success status
   */
  async markAsRead(
    notificationId: string,
    userId: string,
    organizationId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Find and verify notification belongs to user
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: { id: true, userId: true, organizationId: true, isRead: true }
      });

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      // Authorization checks
      if (notification.userId !== userId) {
        throw new AuthorizationError('You can only mark your own notifications as read');
      }

      if (notification.organizationId !== organizationId) {
        throw new AuthorizationError('Notification does not belong to your organization');
      }

      if (notification.isRead) {
        return {
          success: true,
          message: 'Notification was already marked as read',
        };
      }

      // Mark as read
      await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });

      return {
        success: true,
        message: 'Notification marked as read',
      };

    } catch (error) {
      console.error('❌ Mark notification as read error:', error);
      
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      
      throw new InternalServerError('Failed to mark notification as read');
    }
  }

  /**
   * Delete a notification (user can dismiss their own notifications)
   * 
   * @param notificationId - Notification ID to delete
   * @param userId - User ID (for authorization)
   * @param organizationId - Organization ID (for authorization)
   * @returns Success status
   */
  async deleteNotification(
    notificationId: string,
    userId: string,
    organizationId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Find and verify notification belongs to user
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: { id: true, userId: true, organizationId: true, title: true }
      });

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      // Authorization checks
      if (notification.userId !== userId) {
        throw new AuthorizationError('You can only delete your own notifications');
      }

      if (notification.organizationId !== organizationId) {
        throw new AuthorizationError('Notification does not belong to your organization');
      }

      // Delete notification
      await prisma.notification.delete({
        where: { id: notificationId },
      });

      return {
        success: true,
        message: 'Notification deleted successfully',
      };

    } catch (error) {
      console.error('❌ Delete notification error:', error);
      
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      
      throw new InternalServerError('Failed to delete notification');
    }
  }

  /**
   * Get notification statistics for an organization
   * Useful for admin dashboards
   */
  async getOrganizationNotificationStats(organizationId: string): Promise<{
    totalNotifications: number;
    unreadNotifications: number;
    notificationsByType: Record<NotificationType, number>;
    recentActivity: number; // notifications in last 24 hours
  }> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [total, unread, byType, recent] = await Promise.all([
        // Total notifications
        prisma.notification.count({
          where: { organizationId }
        }),
        
        // Unread notifications
        prisma.notification.count({
          where: { organizationId, isRead: false }
        }),
        
        // Notifications by type
        prisma.notification.groupBy({
          by: ['type'],
          where: { organizationId },
          _count: { type: true }
        }),
        
        // Recent activity (24h)
        prisma.notification.count({
          where: { 
            organizationId,
            createdAt: { gte: oneDayAgo }
          }
        })
      ]);

      // Format type counts
      const notificationsByType: Record<NotificationType, number> = {
        INVITE: 0,
        DOCUMENT: 0,
        ALERT: 0,
        REMINDER: 0,
        INFO: 0,
      };

      byType.forEach(item => {
        notificationsByType[item.type] = item._count.type;
      });

      return {
        totalNotifications: total,
        unreadNotifications: unread,
        notificationsByType,
        recentActivity: recent,
      };

    } catch (error) {
      console.error('❌ Get notification stats error:', error);
      throw new InternalServerError('Failed to retrieve notification statistics');
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(
    userId: string,
    organizationId: string
  ): Promise<{ success: boolean; message: string; markedCount: number }> {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          userId,
          organizationId,
          isRead: false,
        },
        data: { isRead: true },
      });

      return {
        success: true,
        message: `Marked ${result.count} notifications as read`,
        markedCount: result.count,
      };

    } catch (error) {
      console.error('❌ Mark all as read error:', error);
      throw new InternalServerError('Failed to mark all notifications as read');
    }
  }

  /**
   * Format notification for API response
   */
  private formatNotificationResponse(notification: any): NotificationResponse {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      metadata: notification.metadata,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      organizationId: notification.organizationId,
      userId: notification.userId,
    };
  }
}

// Export singleton instance
export const notificationService = new NotificationService();