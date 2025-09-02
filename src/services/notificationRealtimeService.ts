import { Response } from 'express';
import { NotificationResponse } from './notificationService';

interface SSEConnection {
  userId: string;
  organizationId: string;
  response: Response;
  lastHeartbeat: Date;
}

/**
 * Real-time Notification Service using Server-Sent Events (SSE)
 * 
 * Features:
 * - Real-time notification delivery
 * - Connection management per user
 * - Heartbeat/ping for connection health
 * - Organization-based isolation
 * - Automatic cleanup of stale connections
 */
export class NotificationRealtimeService {
  private connections = new Map<string, SSEConnection>();
  private heartbeatInterval!: NodeJS.Timeout;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 60000; // 1 minute

  constructor() {
    // Start heartbeat mechanism
    this.startHeartbeat();
    
    // Cleanup on process exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  /**
   * Add a new SSE connection for a user
   * 
   * @param userId - User ID
   * @param organizationId - Organization ID
   * @param response - Express Response object
   * @returns Connection ID for tracking
   */
  addConnection(userId: string, organizationId: string, response: Response): string {
    const connectionId = `${userId}-${Date.now()}`;
    
    // Set SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial connection established event
    response.write(`data: ${JSON.stringify({
      type: 'connected',
      message: 'Real-time notifications connected',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Store connection
    this.connections.set(connectionId, {
      userId,
      organizationId,
      response,
      lastHeartbeat: new Date(),
    });

    // Handle connection close
    response.on('close', () => {
      console.log(`📱 SSE connection closed for user ${userId}`);
      this.connections.delete(connectionId);
    });

    // Handle client disconnect
    response.on('error', (error) => {
      console.log(`📱 SSE connection error for user ${userId}:`, error.message);
      this.connections.delete(connectionId);
    });

    console.log(`📱 SSE connection established for user ${userId} (${connectionId})`);
    console.log(`📱 Active connections: ${this.connections.size}`);

    return connectionId;
  }

  /**
   * Send notification to a specific user in real-time
   * 
   * @param userId - Target user ID
   * @param notification - Notification data
   */
  sendNotificationToUser(userId: string, notification: NotificationResponse): void {
    const userConnections = Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.userId === userId);

    if (userConnections.length === 0) {
      console.log(`📱 No active SSE connections for user ${userId}`);
      return;
    }

    const eventData = {
      type: 'notification',
      data: notification,
      timestamp: new Date().toISOString(),
    };

    userConnections.forEach(([connectionId, connection]) => {
      try {
        connection.response.write(`data: ${JSON.stringify(eventData)}\n\n`);
        console.log(`📱 Sent real-time notification to user ${userId} via ${connectionId}`);
      } catch (error) {
        console.error(`📱 Error sending to connection ${connectionId}:`, error);
        this.connections.delete(connectionId);
      }
    });
  }

  /**
   * Broadcast notification to all users in an organization
   * 
   * @param organizationId - Target organization ID
   * @param notification - Notification data
   * @param excludeUserId - Optional user ID to exclude from broadcast
   */
  broadcastToOrganization(
    organizationId: string, 
    notification: NotificationResponse,
    excludeUserId?: string
  ): void {
    const orgConnections = Array.from(this.connections.entries())
      .filter(([_, conn]) => 
        conn.organizationId === organizationId && 
        conn.userId !== excludeUserId
      );

    if (orgConnections.length === 0) {
      console.log(`📱 No active SSE connections for organization ${organizationId}`);
      return;
    }

    const eventData = {
      type: 'notification',
      data: notification,
      timestamp: new Date().toISOString(),
    };

    let sentCount = 0;
    orgConnections.forEach(([connectionId, connection]) => {
      try {
        connection.response.write(`data: ${JSON.stringify(eventData)}\n\n`);
        sentCount++;
      } catch (error) {
        console.error(`📱 Error broadcasting to connection ${connectionId}:`, error);
        this.connections.delete(connectionId);
      }
    });

    console.log(`📱 Broadcast notification to ${sentCount} connections in organization ${organizationId}`);
  }

  /**
   * Send unread count update to user
   * 
   * @param userId - User ID
   * @param unreadCount - New unread count
   */
  sendUnreadCountUpdate(userId: string, unreadCount: number): void {
    const userConnections = Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.userId === userId);

    const eventData = {
      type: 'unread_count',
      data: { unreadCount },
      timestamp: new Date().toISOString(),
    };

    userConnections.forEach(([connectionId, connection]) => {
      try {
        connection.response.write(`data: ${JSON.stringify(eventData)}\n\n`);
      } catch (error) {
        console.error(`📱 Error sending unread count to ${connectionId}:`, error);
        this.connections.delete(connectionId);
      }
    });
  }

  /**
   * Send heartbeat ping to all connections
   */
  private sendHeartbeat(): void {
    const pingData = {
      type: 'ping',
      timestamp: new Date().toISOString(),
    };

    const staleConnections: string[] = [];
    const now = new Date();

    this.connections.forEach((connection, connectionId) => {
      // Check if connection is stale
      const timeSinceHeartbeat = now.getTime() - connection.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > this.CONNECTION_TIMEOUT) {
        staleConnections.push(connectionId);
        return;
      }

      try {
        connection.response.write(`data: ${JSON.stringify(pingData)}\n\n`);
        connection.lastHeartbeat = now;
      } catch (error) {
        console.error(`📱 Heartbeat error for connection ${connectionId}:`, error);
        staleConnections.push(connectionId);
      }
    });

    // Clean up stale connections
    staleConnections.forEach(connectionId => {
      console.log(`📱 Removing stale connection ${connectionId}`);
      this.connections.delete(connectionId);
    });

    if (this.connections.size > 0) {
      console.log(`📱 Heartbeat sent to ${this.connections.size} active connections`);
    }
  }

  /**
   * Start the heartbeat interval
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);

    console.log('📱 SSE heartbeat started');
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    connectionsByOrganization: Record<string, number>;
    connectionsByUser: Record<string, number>;
  } {
    const connectionsByOrganization: Record<string, number> = {};
    const connectionsByUser: Record<string, number> = {};

    this.connections.forEach((connection) => {
      // Count by organization
      if (!connectionsByOrganization[connection.organizationId]) {
        connectionsByOrganization[connection.organizationId] = 0;
      }
      connectionsByOrganization[connection.organizationId]++;

      // Count by user
      if (!connectionsByUser[connection.userId]) {
        connectionsByUser[connection.userId] = 0;
      }
      connectionsByUser[connection.userId]++;
    });

    return {
      totalConnections: this.connections.size,
      connectionsByOrganization,
      connectionsByUser,
    };
  }

  /**
   * Cleanup all connections and intervals
   */
  private cleanup(): void {
    console.log('📱 Cleaning up SSE service...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.connections.forEach((connection, connectionId) => {
      try {
        connection.response.end();
      } catch (error) {
        console.error(`Error closing connection ${connectionId}:`, error);
      }
    });

    this.connections.clear();
    console.log('📱 SSE service cleanup completed');
  }

  /**
   * Remove all connections for a specific user
   * Useful when user logs out
   */
  disconnectUser(userId: string): void {
    const userConnections = Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.userId === userId);

    userConnections.forEach(([connectionId, connection]) => {
      try {
        connection.response.write(`data: ${JSON.stringify({
          type: 'disconnect',
          message: 'Connection terminated',
          timestamp: new Date().toISOString()
        })}\n\n`);
        connection.response.end();
      } catch (error) {
        console.error(`Error disconnecting user ${userId}:`, error);
      }
      this.connections.delete(connectionId);
    });

    console.log(`📱 Disconnected ${userConnections.length} connections for user ${userId}`);
  }
}

// Export singleton instance
export const notificationRealtimeService = new NotificationRealtimeService();