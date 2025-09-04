import { Request, Response } from "express";
import {
  CreateNotificationRequest,
  NotificationIdParams,
  ListNotificationsQuery,
  PollingQuery,
} from "./validation/validation";
import { notificationService } from "../../services/notificationService";
import { notificationRealtimeService } from "../../services/notificationRealtimeService";
import { isAppError } from "../../utils/error/error";
import { Role } from "../../../generated/prisma";

/**
 * POST /notifications
 * Creates a new notification
 *
 * Features:
 * - Role-based authorization (HR/ADMIN only)
 * - User-specific or broadcast notifications
 * - JSON metadata support
 * - Organization boundary enforcement
 *
 * Requires HR or ADMIN role
 */
export async function createNotificationController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId, role } = user;

    // Request body is already validated by custom validation middleware
    const validatedData = req.validated.body as CreateNotificationRequest;

    // Create notification using service
    const result = await notificationService.createNotification(
      orgId,
      role as Role,
      validatedData
    );

    // Send success response
    res.status(201).json({
      success: result.success,
      message: result.message,
      data: {
        notificationsCreated: result.notificationsCreated,
        notifications: result.notifications,
      },
    });
  } catch (error) {
    console.error("❌ Create notification controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * GET /notifications
 * Lists notifications for the authenticated user
 *
 * Features:
 * - Pagination support
 * - Filter by unread, type, and date
 * - Organization boundary enforcement
 * - Unread count for UI badges
 * - Ordered by unread first, then newest
 *
 * Query parameters: page, limit, unreadOnly, since, type
 */
export async function listNotificationsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { userId, orgId } = user;

    // Query parameters are already validated by custom validation middleware
    const query = req.validated.query as ListNotificationsQuery;

    // List notifications for user
    const result = await notificationService.listUserNotifications(
      userId,
      orgId,
      {
        page: query.page,
        limit: query.limit,
        unreadOnly: query.unreadOnly,
        since: query.since,
        type: query.type,
      }
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ List notifications controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * PUT /notifications/:id/read
 * Marks a notification as read
 *
 * Features:
 * - User authorization (can only mark own notifications)
 * - Organization boundary enforcement
 * - Idempotent operation (no error if already read)
 *
 * Requires authentication
 */
export async function markNotificationAsReadController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { userId, orgId } = user;

    // Route parameters are already validated by custom validation middleware
    const params = req.validated.params as NotificationIdParams;
    const notificationId = params.id;

    // Mark notification as read
    const result = await notificationService.markAsRead(
      notificationId,
      userId,
      orgId
    );

    // Send success response
    res.status(200).json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error("❌ Mark notification as read controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * DELETE /notifications/:id
 * Deletes/dismisses a notification
 *
 * Features:
 * - User authorization (can only delete own notifications)
 * - Organization boundary enforcement
 * - Permanent deletion (user dismissed notification)
 *
 * Requires authentication
 */
export async function deleteNotificationController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { userId, orgId } = user;

    // Route parameters are already validated by custom validation middleware
    const params = req.validated.params as NotificationIdParams;
    const notificationId = params.id;

    // Delete notification
    const result = await notificationService.deleteNotification(
      notificationId,
      userId,
      orgId
    );

    // Send success response
    res.status(200).json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error("❌ Delete notification controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * PUT /notifications/mark-all-read
 * Marks all notifications as read for the authenticated user
 *
 * Features:
 * - Bulk operation for better UX
 * - Organization boundary enforcement
 * - Returns count of notifications marked
 *
 * Requires authentication
 */
export async function markAllNotificationsAsReadController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { userId, orgId } = user;

    // Mark all notifications as read
    const result = await notificationService.markAllAsRead(userId, orgId);

    // Send success response
    res.status(200).json({
      success: result.success,
      message: result.message,
      data: {
        markedCount: result.markedCount,
      },
    });
  } catch (error) {
    console.error("❌ Mark all notifications as read controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * GET /notifications/polling
 * Polling endpoint for real-time notifications
 *
 * Features:
 * - Timestamp-based polling
 * - Efficient incremental updates
 * - Fallback for WebSocket/SSE
 *
 * Query parameters: since (required), limit
 * Returns notifications created after the 'since' timestamp
 */
export async function pollingNotificationsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { userId, orgId } = user;

    // Query parameters are already validated by custom validation middleware
    const query = req.validated.query as PollingQuery;

    // Get notifications since timestamp
    const result = await notificationService.listUserNotifications(
      userId,
      orgId,
      {
        since: query.since,
        limit: query.limit,
        page: 1, // Always first page for polling
      }
    );

    // Send success response with only new notifications
    res.status(200).json({
      success: true,
      message: "Polling update retrieved successfully",
      data: {
        notifications: result.notifications,
        hasMore: result.notifications.length === query.limit,
        unreadCount: result.unreadCount,
        timestamp: new Date().toISOString(), // Client can use this for next poll
      },
    });
  } catch (error) {
    console.error("❌ Polling notifications controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * GET /notifications/stats
 * Get notification statistics for organization (ADMIN/HR only)
 *
 * Features:
 * - Organization-wide statistics
 * - Breakdown by notification type
 * - Recent activity metrics
 * - Admin dashboard support
 *
 * Requires HR or ADMIN role
 */
export async function getNotificationStatsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId, role } = user;

    // Authorization: Only HR and ADMIN can view org stats
    if (!["HR", "ADMIN", "SUPERADMIN"].includes(role)) {
      res.status(403).json({
        success: false,
        message: "Only HR and ADMIN users can view notification statistics",
      });
      return;
    }

    // Get organization statistics
    const stats = await notificationService.getOrganizationNotificationStats(
      orgId
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: "Notification statistics retrieved successfully",
      data: stats,
    });
  } catch (error) {
    console.error("❌ Get notification stats controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * GET /notifications/stream
 * Server-Sent Events endpoint for real-time notifications
 *
 * Features:
 * - Real-time notification delivery
 * - Connection health monitoring
 * - Automatic reconnection support
 * - Organization isolation
 *
 * Requires authentication
 * Returns SSE stream with notification events
 */
export function notificationStreamController(
  req: Request,
  res: Response
): void {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { userId, orgId } = user;

    // Establish SSE connection
    const connectionId = notificationRealtimeService.addConnection(
      userId,
      orgId,
      res
    );

    console.log(
      `📱 SSE connection established: ${connectionId} for user ${userId}`
    );

    // The connection is now managed by the realtime service
    // Response will be handled by SSE events
  } catch (error) {
    console.error("❌ Notification stream controller error:", error);

    // Send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to establish notification stream",
      });
    }
  }
}
