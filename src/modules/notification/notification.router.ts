import { Router } from "express";
import { validateRequest } from "../../utils/validation/validateRequest";
import {
  createNotificationController,
  listNotificationsController,
  markNotificationAsReadController,
  deleteNotificationController,
  markAllNotificationsAsReadController,
  pollingNotificationsController,
  getNotificationStatsController,
  notificationStreamController,
} from "./notification.controller";
import {
  createNotificationSchema,
  notificationIdSchema,
  listNotificationsQuerySchema,
  pollingQuerySchema,
} from "./validation/validation";
import {
  authenticateToken,
  requireRole,
} from "../auth/middleware/auth.middleware";

const notificationRouter = Router();

// Validation middleware
const validateCreateNotification = validateRequest({ 
  body: createNotificationSchema 
});
const validateNotificationId = validateRequest({ 
  params: notificationIdSchema 
});
const validateListQuery = validateRequest({ 
  query: listNotificationsQuerySchema 
});
const validatePollingQuery = validateRequest({ 
  query: pollingQuerySchema 
});

// Role-based middleware for HR and ADMIN operations
const requireHROrAdmin = requireRole("HR", "ADMIN", "SUPERADMIN");

/**
 * POST /notifications
 * Creates a new notification
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Valid request body (title, message, type, optional metadata and userId)
 */
notificationRouter.post(
  "/",
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can create notifications
  validateCreateNotification,     // Validate request body
  createNotificationController
);

/**
 * GET /notifications
 * Lists notifications for the authenticated user
 * Requires:
 * - Authentication (JWT token)
 * - Optional query parameters (page, limit, unreadOnly, since, type)
 */
notificationRouter.get(
  "/",
  authenticateToken,              // Verify JWT and populate req.user
  validateListQuery,              // Validate query parameters
  listNotificationsController
);

/**
 * GET /notifications/polling
 * Polling endpoint for real-time notifications
 * Requires:
 * - Authentication (JWT token)
 * - Query parameter 'since' with timestamp
 */
notificationRouter.get(
  "/polling",
  authenticateToken,              // Verify JWT and populate req.user
  validatePollingQuery,           // Validate query parameters
  pollingNotificationsController
);

/**
 * GET /notifications/stats
 * Get notification statistics for organization
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 */
notificationRouter.get(
  "/stats",
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can view org stats
  getNotificationStatsController
);

/**
 * PUT /notifications/mark-all-read
 * Mark all notifications as read for the authenticated user
 * Requires:
 * - Authentication (JWT token)
 */
notificationRouter.put(
  "/mark-all-read",
  authenticateToken,              // Verify JWT and populate req.user
  markAllNotificationsAsReadController
);

/**
 * PUT /notifications/:id/read
 * Marks a specific notification as read
 * Requires:
 * - Authentication (JWT token)
 * - Valid notification ID (UUID)
 * - User must own the notification
 */
notificationRouter.put(
  "/:id/read",
  authenticateToken,              // Verify JWT and populate req.user
  validateNotificationId,         // Validate notification ID parameter
  markNotificationAsReadController
);

/**
 * DELETE /notifications/:id
 * Deletes/dismisses a notification
 * Requires:
 * - Authentication (JWT token)
 * - Valid notification ID (UUID)
 * - User must own the notification
 */
notificationRouter.delete(
  "/:id",
  authenticateToken,              // Verify JWT and populate req.user
  validateNotificationId,         // Validate notification ID parameter
  deleteNotificationController
);

/**
 * GET /notifications/stream
 * Server-Sent Events endpoint for real-time notifications
 * Requires:
 * - Authentication (JWT token)
 * Returns SSE stream with notification events
 */
notificationRouter.get(
  "/stream",
  authenticateToken,              // Verify JWT and populate req.user
  notificationStreamController
);

export default notificationRouter;