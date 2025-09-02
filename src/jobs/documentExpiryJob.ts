/**
 * Document Expiry Job
 * 
 * Cron job that runs daily to check for documents expiring soon.
 * Sends notifications and emails to relevant users and HR/ADMIN staff.
 * 
 * Features:
 * - Daily cron execution
 * - Configurable expiry warning periods
 * - In-app notifications via Notification system
 * - Email notifications via EmailService
 * - Organization-based processing
 * - Employee and admin notifications
 */

import * as cron from 'node-cron';
import prisma from '../utils/config/db';
import { notificationService } from '../services/notificationService';
import { emailService } from '../services/emailService';
import { NotificationType } from '../../generated/prisma';

export interface ExpiryJobConfig {
  warningDays: number[];        // Days ahead to warn (e.g., [30, 14, 7, 1])
  cronSchedule: string;         // Cron schedule (default: daily at 9 AM)
  enabled: boolean;             // Enable/disable job
}

/**
 * Document Expiry Job Service
 */
export class DocumentExpiryJob {
  private config: ExpiryJobConfig;
  private cronJob: any | null = null;

  constructor(config?: Partial<ExpiryJobConfig>) {
    this.config = {
      warningDays: [30, 14, 7, 1],        // Default warning periods
      cronSchedule: '0 9 * * *',          // Daily at 9:00 AM
      enabled: process.env.NODE_ENV !== 'test', // Disable in tests
      ...config,
    };
  }

  /**
   * Start the cron job
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('📅 Document expiry job is disabled');
      return;
    }

    if (this.cronJob && this.cronJob.running) {
      console.log('📅 Document expiry job is already running');
      return;
    }

    this.cronJob = cron.schedule(
      this.config.cronSchedule,
      async () => {
        await this.executeJob();
      },
      {
        timezone: process.env.TZ || 'UTC',
      }
    );

    console.log(`📅 Document expiry job started (schedule: ${this.config.cronSchedule})`);
    console.log(`📅 Warning periods: ${this.config.warningDays.join(', ')} days`);
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('📅 Document expiry job stopped');
    }
  }

  /**
   * Execute the job manually (for testing or manual runs)
   */
  async runOnce(): Promise<void> {
    console.log('📅 Running document expiry job manually...');
    await this.executeJob();
  }

  /**
   * Main job execution logic
   */
  private async executeJob(): Promise<void> {
    console.log('📅 Starting document expiry check job...');
    
    const startTime = Date.now();
    let totalNotifications = 0;
    let totalEmails = 0;
    let processedOrganizations = 0;
    let errors = 0;

    try {
      // Get all active organizations
      const organizations = await prisma.organization.findMany({
        select: {
          id: true,
          name: true,
        }
      });

      console.log(`📅 Processing ${organizations.length} organizations...`);

      // Process each organization
      for (const org of organizations) {
        try {
          const orgStats = await this.processOrganization(org.id, org.name);
          totalNotifications += orgStats.notifications;
          totalEmails += orgStats.emails;
          processedOrganizations++;

        } catch (error) {
          console.error(`❌ Error processing organization ${org.name}:`, error);
          errors++;
        }
      }

      const duration = Date.now() - startTime;
      
      console.log(`📅 Document expiry job completed:`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Organizations: ${processedOrganizations}/${organizations.length}`);
      console.log(`   Notifications sent: ${totalNotifications}`);
      console.log(`   Emails sent: ${totalEmails}`);
      console.log(`   Errors: ${errors}`);

    } catch (error) {
      console.error('❌ Document expiry job failed:', error);
    }
  }

  /**
   * Process expiry checks for a single organization
   */
  private async processOrganization(
    organizationId: string, 
    organizationName: string
  ): Promise<{ notifications: number; emails: number }> {
    
    console.log(`📅 Processing organization: ${organizationName}`);
    
    let notificationCount = 0;
    let emailCount = 0;

    // Process each warning period
    for (const warningDays of this.config.warningDays) {
      try {
        // Get documents expiring in exactly this many days
        const expiringDocuments = await this.getDocumentsExpiringIn(
          organizationId, 
          warningDays
        );

        if (expiringDocuments.length === 0) {
          continue;
        }

        console.log(`📄 Found ${expiringDocuments.length} documents expiring in ${warningDays} days`);

        // Process each expiring document
        for (const document of expiringDocuments) {
          try {
            // Send notifications for this document
            const docStats = await this.processExpiringDocument(
              document,
              warningDays,
              organizationId
            );
            
            notificationCount += docStats.notifications;
            emailCount += docStats.emails;

          } catch (error) {
            console.error(`❌ Error processing document ${document.title}:`, error);
          }
        }

      } catch (error) {
        console.error(`❌ Error processing ${warningDays}-day warning:`, error);
      }
    }

    return {
      notifications: notificationCount,
      emails: emailCount,
    };
  }

  /**
   * Get documents expiring in exactly N days
   */
  private async getDocumentsExpiringIn(
    organizationId: string,
    daysAhead: number
  ): Promise<any[]> {
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);
    targetDate.setHours(0, 0, 0, 0); // Start of day
    
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1); // End of target day

    const documents = await prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        expiresAt: {
          gte: targetDate,
          lt: nextDay,
        }
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        employee: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            email: true,
            user: {
              select: { id: true, firstName: true, email: true }
            }
          }
        }
      }
    });

    return documents;
  }

  /**
   * Process notifications and emails for a single expiring document
   */
  private async processExpiringDocument(
    document: any,
    warningDays: number,
    organizationId: string
  ): Promise<{ notifications: number; emails: number }> {
    
    let notifications = 0;
    let emails = 0;

    try {
      // Determine urgency level
      const urgency = this.getUrgencyLevel(warningDays);
      const expiryDate = new Date(document.expiresAt).toLocaleDateString();

      // 1. Notify the assigned employee (if any)
      if (document.employee) {
        try {
          // Create in-app notification
          const notificationTitle = `Document Expiring ${urgency}`;
          const notificationMessage = `Your ${document.type.toLowerCase()} "${document.title}" expires on ${expiryDate}. Please review and take necessary action.`;
          
          await notificationService.createNotification(
            organizationId,
            'HR', // Create as HR for permission purposes
            {
              title: notificationTitle,
              message: notificationMessage,
              type: NotificationType.REMINDER,
              userId: document.employee.user?.id,
              metadata: {
                documentId: document.id,
                documentTitle: document.title,
                documentType: document.type,
                expiresAt: document.expiresAt,
                warningDays,
                urgency,
              }
            }
          );
          notifications++;

          // Send email notification
          if (document.employee.user?.email) {
            try {
              const emailMessage = `${notificationMessage}\n\nDocument: ${document.title}\nType: ${document.type}\nExpires: ${expiryDate}\n\nPlease log into your account to view the document.`;
              
              await emailService.sendComplianceReminder(
                document.employee.user.email,
                emailMessage,
                {
                  firstName: document.employee.firstName || 'Employee',
                  message: emailMessage,
                  organizationName: 'Your Organization',
                }
              );
              emails++;
            } catch (emailError) {
              console.error('❌ Failed to send email to employee:', emailError);
            }
          }

        } catch (error) {
          console.error('❌ Error notifying employee:', error);
        }
      }

      // 2. Notify HR/ADMIN users for critical documents (7 days or less)
      if (warningDays <= 7) {
        try {
          // Get HR and ADMIN users in the organization
          const adminUsers = await prisma.user.findMany({
            where: {
              organizationId,
              role: { in: ['HR', 'ADMIN', 'SUPERADMIN'] },
              isActive: true,
            },
            select: { id: true, firstName: true, email: true }
          });

          for (const adminUser of adminUsers) {
            // Create in-app notification for admin
            const adminNotificationTitle = `Document Expiring ${urgency} - Action Required`;
            const adminNotificationMessage = `${document.type} "${document.title}"${document.employee ? ` (assigned to ${document.employee.firstName} ${document.employee.lastName})` : ''} expires on ${expiryDate}.`;
            
            await notificationService.createNotification(
              organizationId,
              'HR',
              {
                title: adminNotificationTitle,
                message: adminNotificationMessage,
                type: NotificationType.ALERT,
                userId: adminUser.id,
                metadata: {
                  documentId: document.id,
                  documentTitle: document.title,
                  documentType: document.type,
                  expiresAt: document.expiresAt,
                  employeeId: document.employee?.id,
                  employeeName: document.employee ? `${document.employee.firstName} ${document.employee.lastName}` : null,
                  warningDays,
                  urgency,
                }
              }
            );
            notifications++;

            // Send email to admin
            try {
              const emailMessage = `${adminNotificationMessage}\n\nDocument Details:\n- Title: ${document.title}\n- Type: ${document.type}\n- Expires: ${expiryDate}\n- Uploaded by: ${document.uploadedBy.firstName} ${document.uploadedBy.lastName}\n${document.employee ? `- Assigned to: ${document.employee.firstName} ${document.employee.lastName}` : ''}\n\nPlease review and take appropriate action.`;
              
              await emailService.sendComplianceReminder(
                adminUser.email,
                emailMessage,
                {
                  firstName: adminUser.firstName || 'Administrator',
                  message: emailMessage,
                  organizationName: 'Your Organization',
                }
              );
              emails++;
            } catch (emailError) {
              console.error('❌ Failed to send email to admin:', emailError);
            }
          }

        } catch (error) {
          console.error('❌ Error notifying admins:', error);
        }
      }

    } catch (error) {
      console.error('❌ Error processing expiring document notifications:', error);
    }

    return { notifications, emails };
  }

  /**
   * Get urgency level based on days remaining
   */
  private getUrgencyLevel(daysAhead: number): string {
    if (daysAhead <= 1) return 'Today';
    if (daysAhead <= 7) return 'This Week';
    if (daysAhead <= 14) return 'Soon';
    return 'In 30 Days';
  }

  /**
   * Get job status information
   */
  getStatus(): {
    enabled: boolean;
    running: boolean;
    schedule: string;
    warningDays: number[];
    nextRun?: Date;
  } {
    return {
      enabled: this.config.enabled,
      running: this.cronJob?.running || false,
      schedule: this.config.cronSchedule,
      warningDays: this.config.warningDays,
      nextRun: this.cronJob && typeof this.cronJob.nextDate === 'function' ? this.cronJob.nextDate()?.toDate() : undefined,
    };
  }
}

// Create and export singleton instance
export const documentExpiryJob = new DocumentExpiryJob();