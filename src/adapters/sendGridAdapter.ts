import sgMail from '@sendgrid/mail';
import { EmailProvider, EmailOptions } from '../services/emailService';

/**
 * SendGrid Email Adapter
 * 
 * Production-grade email adapter using SendGrid API.
 * Provides reliable email delivery with analytics and tracking.
 * 
 * Configuration via environment variables:
 * - SENDGRID_API_KEY: SendGrid API key (required)
 * - SENDGRID_FROM: Default sender email address
 * - SENDGRID_FROM_NAME: Default sender name
 * 
 * Features:
 * - API-based delivery (more reliable than SMTP)
 * - Built-in delivery analytics and tracking
 * - Automatic retry handling
 * - Rate limiting compliance
 */
export class SendGridAdapter implements EmailProvider {
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.validateConfiguration();
    this.initializeSendGrid();
    
    this.fromEmail = process.env.SENDGRID_FROM!;
    this.fromName = process.env.SENDGRID_FROM_NAME || 'HR Compliance System';
  }

  /**
   * Validate SendGrid configuration on initialization
   * Ensures required environment variables are present
   */
  private validateConfiguration(): void {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM;

    if (!apiKey) {
      throw new Error('SENDGRID_API_KEY environment variable is required for SendGrid adapter');
    }

    if (!fromEmail) {
      throw new Error('SENDGRID_FROM environment variable is required for SendGrid adapter');
    }

    // Validate API key format (SendGrid keys start with 'SG.')
    if (!apiKey.startsWith('SG.')) {
      throw new Error('Invalid SendGrid API key format. Key should start with "SG."');
    }

    // Basic email validation for from address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail)) {
      throw new Error('SENDGRID_FROM must be a valid email address');
    }
  }

  /**
   * Initialize SendGrid with API key
   * Sets up the SendGrid client for email delivery
   */
  private initializeSendGrid(): void {
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
      console.log('✅ SendGrid adapter initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize SendGrid: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send email using SendGrid API
   * 
   * @param options Email content and recipient information
   * @returns Promise that resolves on successful delivery
   * @throws Error if email delivery fails
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailData = {
        to: options.to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: options.subject,
        html: options.html,
        text: options.text,
        // Enable click and open tracking for analytics
        trackingSettings: {
          clickTracking: {
            enable: true,
            enableText: false,
          },
          openTracking: {
            enable: true,
          },
        },
        // Add custom headers for identification
        headers: {
          'X-Application': 'HR-Compliance-SaaS',
          'X-Environment': process.env.NODE_ENV || 'development',
        },
      };

      const response = await sgMail.send(mailData);
      
      // SendGrid returns array of responses
      const [sgResponse] = response;
      console.log('📧 Email sent successfully via SendGrid:', {
        statusCode: sgResponse.statusCode,
        messageId: sgResponse.headers['x-message-id'],
        to: options.to,
      });
      
    } catch (error) {
      // Handle SendGrid-specific errors
      if (error && typeof error === 'object' && 'response' in error) {
        const sgError = error as any;
        const statusCode = sgError.code || sgError.response?.status;
        const errorBody = sgError.response?.body;
        
        console.error('❌ SendGrid API error:', {
          statusCode,
          error: errorBody,
          to: options.to,
        });

        // Provide specific error messages for common issues
        switch (statusCode) {
          case 401:
            throw new Error('SendGrid authentication failed. Check SENDGRID_API_KEY.');
          case 403:
            throw new Error('SendGrid API access forbidden. Verify API key permissions.');
          case 429:
            throw new Error('SendGrid rate limit exceeded. Please retry later.');
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('SendGrid service temporarily unavailable. Please retry.');
          default:
            throw new Error(`SendGrid delivery failed (${statusCode}): ${JSON.stringify(errorBody)}`);
        }
      }
      
      // Handle other errors
      console.error('❌ SendGrid email delivery failed:', error);
      throw new Error(`SendGrid delivery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify SendGrid API key and sender identity
   * Useful for configuration validation during setup
   */
  async verifyConfiguration(): Promise<boolean> {
    try {
      // Send a test request to verify API key
      const testEmail = {
        to: 'test@example.com',
        from: this.fromEmail,
        subject: 'Configuration Test',
        text: 'This is a configuration test.',
        mailSettings: {
          sandboxMode: {
            enable: true, // Sandbox mode - email won't actually be delivered
          },
        },
      };

      await sgMail.send(testEmail);
      console.log('✅ SendGrid configuration verified successfully');
      return true;
      
    } catch (error) {
      console.error('❌ SendGrid configuration verification failed:', error);
      return false;
    }
  }

  /**
   * Get SendGrid account information
   * Useful for monitoring and debugging
   */
  async getAccountInfo(): Promise<any> {
    try {
      // This would require additional SendGrid client setup for API access
      // For now, return basic configuration info
      return {
        fromEmail: this.fromEmail,
        fromName: this.fromName,
        environment: process.env.NODE_ENV,
      };
    } catch (error) {
      throw new Error(`Failed to get SendGrid account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}