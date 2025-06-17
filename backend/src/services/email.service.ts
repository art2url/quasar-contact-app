import nodemailer from 'nodemailer';
import env from '../config/env';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    // Check if email configuration is available
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      console.warn(
        '[EmailService] SMTP configuration not complete. Email features will be disabled.'
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_SECURE || false,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        // Additional Mailgun-specific settings
        tls: {
          rejectUnauthorized: false,
        },
      });

      this.isConfigured = true;
      console.log('[EmailService] SMTP transporter configured successfully');

      // Verify the connection
      this.verifyConnection();
    } catch (error) {
      console.error('[EmailService] Failed to create SMTP transporter:', error);
      this.isConfigured = false;
    }
  }

  private async verifyConnection(): Promise<void> {
    if (!this.transporter) return;

    try {
      await this.transporter.verify();
      console.log('[EmailService] SMTP connection verified successfully');
    } catch (error) {
      console.error(
        '[EmailService] SMTP connection verification failed:',
        error
      );
      this.isConfigured = false;
    }
  }

  private async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      throw new Error('Email service is not configured');
    }

    const mailOptions = {
      from: env.SMTP_FROM || env.SMTP_USER,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('[EmailService] Email sent successfully:', {
        to: options.to,
        subject: options.subject,
        messageId: result.messageId,
      });
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      throw new Error(
        `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Send password reset email with reset link
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const subject = 'Reset Your Quasar Chat Password';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - ${env.APP_NAME}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0077cc, #005599); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }
          .button { display: inline-block; background: #0077cc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
          .warning { background: #fff3e0; border: 1px solid #ffcc80; border-radius: 4px; padding: 15px; margin: 20px 0; color: #e65100; }
          .logo { font-size: 32px; font-weight: bold; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">${env.APP_NAME}</div>
            <h2>Password Reset Request</h2>
          </div>
          
          <div class="content">
            <p>Hello,</p>
            
            <p>We received a request to reset the password for your ${env.APP_NAME} account. If you made this request, click the button below to reset your password:</p>
            
            <center>
              <a href="${resetUrl}" class="button">Reset My Password</a>
            </center>
            
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace;">${resetUrl}</p>
            
            <div class="warning">
              <strong>⚠️ Important:</strong> Resetting your password will permanently delete all your encrypted messages. This cannot be undone as messages are encrypted with your current password.
            </div>
            
            <p><strong>This link will expire in 1 hour</strong> for security reasons.</p>
            
            <p>If you did not request a password reset, please ignore this email. Your account remains secure.</p>
            
            <p>Best regards,<br>The ${env.APP_NAME} Team</p>
          </div>
          
          <div class="footer">
            <p>This is an automated message from ${env.APP_NAME}. Please do not reply to this email.</p>
            <p>If you're having trouble with the button above, copy and paste the URL into your web browser.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Password Reset Request - ${env.APP_NAME}

      Hello,

      We received a request to reset the password for your ${env.APP_NAME} account.

      To reset your password, please click the following link:
      ${resetUrl}

      IMPORTANT: Resetting your password will permanently delete all your encrypted messages. This cannot be undone as messages are encrypted with your current password.

      This link will expire in 1 hour for security reasons.

      If you did not request a password reset, please ignore this email. Your account remains secure.

      Best regards,
      The ${env.APP_NAME} Team
    `.trim();

    await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  // Send password reset confirmation email
  async sendPasswordResetConfirmation(email: string): Promise<void> {
    const subject = `Password Reset Successful - ${env.APP_NAME}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Confirmation - ${env.APP_NAME}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4caf50, #388e3c); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
          .success { background: #e8f5e8; border: 1px solid #4caf50; border-radius: 4px; padding: 15px; margin: 20px 0; color: #2e7d32; }
          .info { background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; padding: 15px; margin: 20px 0; color: #1565c0; }
          .logo { font-size: 32px; font-weight: bold; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">${env.APP_NAME}</div>
            <h2>Password Reset Successful</h2>
          </div>
          
          <div class="content">
            <p>Hello,</p>
            
            <div class="success">
              <strong>✅ Success!</strong> Your ${env.APP_NAME} password has been reset successfully.
            </div>
            
            <p>Your account is now secured with your new password. You can log in to ${env.APP_NAME} using your new credentials.</p>
            
            <div class="info">
              <strong>📝 Note:</strong> As part of the password reset process, all your previous encrypted messages have been permanently deleted. This is necessary because messages were encrypted with your old password and cannot be decrypted with the new one.
            </div>
            
            <p>If you did not perform this password reset, please contact our support team immediately as your account may have been compromised.</p>
            
            <p>For your security, we recommend:</p>
            <ul>
              <li>Using a strong, unique password</li>
              <li>Regularly backing up your private key from Settings</li>
            </ul>
            
            <p>Welcome back to secure messaging!</p>
            
            <p>Best regards,<br>The ${env.APP_NAME} Team</p>
          </div>
          
          <div class="footer">
            <p>This is an automated confirmation from ${env.APP_NAME}. Please do not reply to this email.</p>
            <p>If you have any questions, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Password Reset Successful - ${env.APP_NAME}

      Hello,

      Your ${env.APP_NAME} password has been reset successfully.

      Your account is now secured with your new password. You can log in to ${env.APP_NAME} using your new credentials.

      Note: As part of the password reset process, all your previous encrypted messages have been permanently deleted. This is necessary because messages were encrypted with your old password and cannot be decrypted with the new one.

      If you did not perform this password reset, please contact our support team immediately as your account may have been compromised.

      For your security, we recommend:
      - Using a strong, unique password
      - Regularly backing up your private key from Settings

      Welcome back to secure messaging!

      Best regards,
      The ${env.APP_NAME} Team
    `.trim();

    await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  // Check if email service is properly configured
  isReady(): boolean {
    return this.isConfigured;
  }
}

// Export a singleton instance
const emailService = new EmailService();
export default emailService;
