import bcrypt from "bcrypt";
import crypto from "crypto";
import { InternalServerError } from "../error/error";

// Salt rounds for bcrypt password hashing
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hashes a password using bcrypt
 * @param password - Plain text password to hash
 * @returns Promise<string> - Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const saltRounds = BCRYPT_SALT_ROUNDS;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    console.error("Password hashing error:", error);
    throw new InternalServerError("Password hashing failed");
  }
}

/**
 * Verifies a password against its hash
 * @param password - Plain text password to verify
 * @param hash - Hashed password to verify against
 * @returns Promise<boolean> - True if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
  } catch (error) {
    console.error("Password verification error:", error);
    throw new InternalServerError("Password verification failed");
  }
}

/**
 * Generates a secure random invite token
 * @returns string - Base64 URL-safe invite token
 */
export function generateInviteToken(): string {
  try {
    // Generate 32 random bytes
    const buffer = crypto.randomBytes(32);
    // Convert to base64 URL-safe string
    const token = buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return token;
  } catch (error) {
    console.error("Token generation error:", error);
    throw new InternalServerError("Token generation failed");
  }
}

/**
 * Generates a temporary password for invited users
 * @param length - Length of the password (default: 12)
 * @returns string - Temporary password
 */
export function generateTemporaryPassword(length: number = 12): string {
  try {
    // Character sets for password generation
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    const allChars = lowercase + uppercase + numbers + symbols;

    let password = '';

    // Ensure at least one character from each set
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill remaining length with random characters
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password to avoid predictable patterns
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  } catch (error) {
    console.error("Temporary password generation error:", error);
    throw new InternalServerError("Temporary password generation failed");
  }
}

/**
 * Email template for invitation
 * In production, this would likely be replaced by a proper email template system
 */
export interface InviteEmailData {
  email: string;
  firstName: string;
  organizationName: string;
  inviteToken: string;
  temporaryPassword: string;
  inviteUrl: string;
}

/**
 * Generates HTML email template for user invitation
 * @param data - Email template data
 * @returns string - HTML email content
 */
export function generateInviteEmailTemplate(data: InviteEmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>You're Invited to Join ${data.organizationName}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .button { 
          display: inline-block; 
          background: #007bff; 
          color: white; 
          padding: 12px 24px; 
          text-decoration: none; 
          border-radius: 5px; 
          margin: 20px 0;
        }
        .credentials { 
          background: white; 
          padding: 15px; 
          border-left: 4px solid #007bff; 
          margin: 20px 0; 
        }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to ${data.organizationName}</h1>
        </div>
        <div class="content">
          <h2>Hi ${data.firstName},</h2>
          <p>You've been invited to join <strong>${data.organizationName}</strong> on our platform.</p>
          
          <div class="credentials">
            <h3>Your Login Credentials:</h3>
            <p><strong>Email:</strong> ${data.email}</p>
            <p><strong>Temporary Password:</strong> ${data.temporaryPassword}</p>
          </div>
          
          <p>To complete your account setup and set your permanent password, please click the button below:</p>
          
          <a href="${data.inviteUrl}" class="button">Accept Invitation</a>
          
          <p>If you can't click the button, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;">${data.inviteUrl}</p>
          
          <p><strong>Important:</strong> This invitation will expire in 7 days. Please accept it as soon as possible.</p>
          
          <p>If you have any questions, please contact your administrator.</p>
        </div>
        <div class="footer">
          <p>This invitation was sent by ${data.organizationName}</p>
          <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Placeholder function for sending invitation emails
 * In production, this would integrate with email services like SendGrid, AWS SES, etc.
 */
export async function sendInviteEmail(emailData: InviteEmailData): Promise<void> {
  try {
    console.log("=== INVITE EMAIL ===");
    console.log(`To: ${emailData.email}`);
    console.log(`Subject: You're invited to join ${emailData.organizationName}`);
    console.log(`Invite URL: ${emailData.inviteUrl}`);
    console.log(`Temporary Password: ${emailData.temporaryPassword}`);
    console.log("==================");
    
    // In production, implement actual email sending:
    // const emailService = new EmailService();
    // await emailService.sendEmail({
    //   to: emailData.email,
    //   subject: `You're invited to join ${emailData.organizationName}`,
    //   html: generateInviteEmailTemplate(emailData),
    // });
    
    // For now, just log the email content
    console.log("Email would be sent with content:", generateInviteEmailTemplate(emailData));
  } catch (error) {
    console.error("Send invite email error:", error);
    throw new InternalServerError("Failed to send invitation email");
  }
}