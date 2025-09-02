import { readFileSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import { SMTPAdapter } from '../adapters/smtpAdapter';
import { SendGridAdapter } from '../adapters/sendGridAdapter';

export interface EmailProvider {
  sendEmail(options: EmailOptions): Promise<void>;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface InviteEmailData {
  firstName: string;
  inviteLink: string;
  organizationName: string;
  tempPassword?: string;
}

export interface PasswordResetData {
  firstName: string;
  resetLink: string;
}

export interface ComplianceReminderData {
  firstName: string;
  message: string;
  organizationName: string;
}

/**
 * Centralized Email Notification Service for HR Compliance SaaS
 * 
 * Features:
 * - Multi-provider support (SMTP for dev, SendGrid/SES for production)
 * - Handlebars templating for HTML emails
 * - Plain text fallback generation
 * - Environment-based provider configuration
 * - Promise-based error handling
 */
export class EmailService {
  private provider: EmailProvider;
  private templateCache = new Map<string, HandlebarsTemplateDelegate>();

  constructor() {
    this.provider = this.createProvider();
  }

  /**
   * Creates email provider based on environment configuration
   * Production uses SendGrid/SES, development uses SMTP
   */
  private createProvider(): EmailProvider {
    const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
    
    switch (emailProvider.toLowerCase()) {
      case 'sendgrid':
        return new SendGridAdapter();
      case 'ses':
        // AWS SES adapter would go here
        throw new Error('AWS SES adapter not implemented yet');
      case 'smtp':
      default:
        return new SMTPAdapter();
    }
  }

  /**
   * Load and compile Handlebars template with caching
   * Templates are cached after first load for performance
   */
  private getTemplate(templateName: string): HandlebarsTemplateDelegate {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    try {
      const templatePath = join(process.cwd(), 'templates', `${templateName}.hbs`);
      const templateSource = readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);
      this.templateCache.set(templateName, template);
      return template;
    } catch (error) {
      throw new Error(`Failed to load email template: ${templateName}. ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate plain text version from HTML content
   * Strips HTML tags and provides basic formatting
   */
  private generatePlainText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Send employee invitation email with secure invite link
   * Used when HR invites an employee to create a user account
   * 
   * @param to - Employee email address
   * @param inviteLink - Secure invitation link with token
   * @param data - Template data including name, organization, temp password
   * @returns Promise that resolves on success or throws on failure
   */
  async sendInviteEmail(to: string, inviteLink: string, data: InviteEmailData): Promise<void> {
    try {
      const template = this.getTemplate('invite');
      const html = template({
        ...data,
        inviteLink,
      });

      const plainText = this.generatePlainText(html);

      await this.provider.sendEmail({
        to,
        subject: `You're invited to join ${data.organizationName}`,
        html,
        text: plainText,
      });
    } catch (error) {
      throw new Error(`Failed to send invite email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send password reset email with secure reset link
   * Used when users request password reset
   * 
   * @param to - User email address
   * @param resetLink - Secure password reset link with token
   * @param data - Template data including user's first name
   * @returns Promise that resolves on success or throws on failure
   */
  async sendPasswordReset(to: string, resetLink: string, data: PasswordResetData): Promise<void> {
    try {
      const template = this.getTemplate('passwordReset');
      const html = template({
        ...data,
        resetLink,
      });

      const plainText = this.generatePlainText(html);

      await this.provider.sendEmail({
        to,
        subject: 'Reset your password',
        html,
        text: plainText,
      });
    } catch (error) {
      throw new Error(`Failed to send password reset email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send compliance reminder email to employees
   * Used for automated compliance notifications and reminders
   * 
   * @param to - Employee email address
   * @param message - Custom compliance message
   * @param data - Template data including name and organization
   * @returns Promise that resolves on success or throws on failure
   */
  async sendComplianceReminder(to: string, message: string, data: ComplianceReminderData): Promise<void> {
    try {
      const template = this.getTemplate('complianceReminder');
      const html = template({
        ...data,
        message,
      });

      const plainText = this.generatePlainText(html);

      await this.provider.sendEmail({
        to,
        subject: `Compliance Reminder from ${data.organizationName}`,
        html,
        text: plainText,
      });
    } catch (error) {
      throw new Error(`Failed to send compliance reminder to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send generic email with custom template
   * For future extensibility - allows sending any template
   * 
   * @param to - Recipient email address
   * @param subject - Email subject line
   * @param templateName - Name of Handlebars template file
   * @param templateData - Data to populate template
   * @returns Promise that resolves on success or throws on failure
   */
  async sendTemplateEmail(
    to: string, 
    subject: string, 
    templateName: string, 
    templateData: Record<string, any>
  ): Promise<void> {
    try {
      const template = this.getTemplate(templateName);
      const html = template(templateData);
      const plainText = this.generatePlainText(html);

      await this.provider.sendEmail({
        to,
        subject,
        html,
        text: plainText,
      });
    } catch (error) {
      throw new Error(`Failed to send template email (${templateName}) to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Singleton instance for application-wide use
export const emailService = new EmailService();