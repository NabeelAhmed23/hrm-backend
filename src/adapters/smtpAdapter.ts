import nodemailer, { Transporter } from 'nodemailer';
import { EmailProvider, EmailOptions } from '../services/emailService';

/**
 * SMTP Email Adapter using Nodemailer
 * 
 * Primary adapter for development and SMTP-based email delivery.
 * Supports all SMTP providers (Gmail, Outlook, custom SMTP servers).
 * 
 * Configuration via environment variables:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: Connection port (587 for STARTTLS, 465 for SSL)
 * - SMTP_SECURE: Enable immediate TLS connection
 * - SMTP_USER: Authentication username
 * - SMTP_PASS: Authentication password
 * 
 * Based on Nodemailer documentation:
 * - createTransporter() creates reusable transport instance
 * - verify() validates SMTP configuration before sending
 * - sendMail() sends email with HTML and text content
 */
export class SMTPAdapter implements EmailProvider {
  private transporter: Transporter;

  constructor() {
    this.transporter = this.createTransporter();
    this.verifyConnection();
  }

  /**
   * Create Nodemailer SMTP transporter with environment configuration
   * 
   * From Nodemailer docs: createTransport() accepts configuration object
   * with host, port, secure, and auth properties for SMTP connection.
   * Default configuration supports most SMTP providers.
   */
  private createTransporter(): Transporter {
    const config = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    // Remove auth if credentials not provided (for local testing)
    if (!config.auth.user || !config.auth.pass) {
      const { auth, ...configWithoutAuth } = config;
      return nodemailer.createTransport(configWithoutAuth);
    }

    return nodemailer.createTransport(config);
  }

  /**
   * Verify SMTP connection configuration
   * 
   * From Nodemailer docs: verify() method validates server connection
   * and authentication credentials. Should be called during initialization
   * to catch configuration errors early.
   */
  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      console.log('✅ SMTP server connection verified successfully');
    } catch (error) {
      console.warn('⚠️ SMTP verification failed:', error instanceof Error ? error.message : 'Unknown error');
      console.warn('Email functionality may not work correctly. Check SMTP configuration.');
    }
  }

  /**
   * Send email using SMTP transport
   * 
   * From Nodemailer docs: sendMail() accepts message object with
   * to, subject, html, and text properties. Returns info object
   * with messageId on successful delivery.
   * 
   * @param options Email content and recipient information
   * @returns Promise that resolves on successful delivery
   * @throws Error if email delivery fails
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('📧 Email sent successfully:', info.messageId);
      
      // Log preview URL for development (Ethereal Email)
      if (process.env.NODE_ENV === 'development' && nodemailer.getTestMessageUrl(info)) {
        console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
      }
    } catch (error) {
      console.error('❌ SMTP email delivery failed:', error);
      throw new Error(`SMTP delivery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create test account for development using Ethereal Email
   * 
   * From Nodemailer docs: createTestAccount() generates test SMTP
   * credentials for development and testing without real email delivery.
   * Useful for local development environment setup.
   */
  static async createTestAccount(): Promise<{
    user: string;
    pass: string;
    smtp: { host: string; port: number; secure: boolean };
  }> {
    try {
      const testAccount = await nodemailer.createTestAccount();
      
      console.log('🧪 Test SMTP account created:');
      console.log('📧 User:', testAccount.user);
      console.log('🔐 Pass:', testAccount.pass);
      console.log('🌐 SMTP Host:', testAccount.smtp.host);
      console.log('🔌 SMTP Port:', testAccount.smtp.port);
      
      return {
        user: testAccount.user,
        pass: testAccount.pass,
        smtp: {
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
        },
      };
    } catch (error) {
      throw new Error(`Failed to create test account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}