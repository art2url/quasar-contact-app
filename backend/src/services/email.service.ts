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
        '[EmailService] SMTP configuration not complete. Email features will be disabled.',
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
        // SMTP settings for better compatibility
        tls: {
          rejectUnauthorized: false,
          ciphers: 'SSLv3',
        },
        // Additional settings for better email delivery
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        debug: env.NODE_ENV === 'development',
        logger: env.NODE_ENV === 'development',
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
      console.error('[EmailService] SMTP connection verification failed:', error);
      this.isConfigured = false;
    }
  }

  private async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      throw new Error('Email service is not configured');
    }

    const mailOptions = {
      from: `"Quasar Contact" <${env.SMTP_FROM || env.SMTP_USER}>`,
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
        messageId: result?.messageId || 'unknown',
      });
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      throw new Error(
        `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
  // Send password reset email with reset link
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    // Ensure we use the correct app path
    const baseUrl = env.CLIENT_ORIGIN || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/app/auth/reset-password?token=${resetToken}`;
    const subject = `Password Reset Request - ${env.APP_NAME}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="format-detection" content="telephone=no">
        <meta name="x-apple-disable-message-reformatting">
        <meta name="supported-color-schemes" content="light dark">
        <meta name="color-scheme" content="light dark">
        <title>Password Reset - ${env.APP_NAME}</title>
        <style>
          /* Reset styles */
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          /* Email-safe fonts */
          body, table, td, p, h1, h2, h3, h4, h5, h6 {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
          }
          
          body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background-color: transparent !important;
            color: #ffffff;
            line-height: 1.6;
          }
          
          table {
            border-collapse: collapse !important;
            width: 100%;
          }
          
          .email-wrapper {
            width: 100%;
            background-color: transparent;
            padding: 20px 0;
          }
          
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #000000;
            border-radius: 16px;
            overflow: hidden;
          }
          
          
          .content {
            padding: 40px 30px;
            background-color: #001011;
            color: #ffffff;
          }
          
          .content p {
            margin-bottom: 20px;
            color: #ffffff;
            font-size: 16px;
            line-height: 1.6;
          }
          
          .reset-button {
            display: inline-block;
            background-color: #95E06C;
            color: #0c2524 !important;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 25px;
            font-weight: 600;
            font-size: 18px;
            margin: 20px 0;
            border: 2px solid #95e06c;
          }
          
          .reset-button:hover {
            background-color: #c3f73a;
            border-color: #c3f73a;
          }
          
          .button-center {
            text-align: center;
            margin: 30px 0;
          }
          
          .url-display {
            word-break: break-all;
            background-color: #001011;
            border: 1px solid #95E06C;
            padding: 15px;
            border-radius: 8px;
            font-family: Courier, monospace;
            font-size: 14px;
            color: #95E06C;
            margin: 20px 0;
          }
          
          .warning-box {
            background-color: #2d1810;
            border: 2px solid #ff6b35;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
          }
          
          .warning-title {
            font-weight: 600;
            color: #ff6b35;
            margin-bottom: 8px;
            font-size: 16px;
          }
          
          .warning-box p {
            color: #ffffff;
            margin: 0;
          }
          
          .security-notice {
            background-color: #001011;
            border: 2px solid #1a2d20;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
          }
          
          .security-notice strong {
            color: #95e06c;
            font-size: 16px;
          }
          
          .security-notice p {
            color: #ffffff;
            margin: 8px 0 0 0;
          }
          
          .footer {
            background-color: #000000;
            padding: 25px 30px;
            text-align: left;
          }
          
          .footer p {
            color: #999999;
            font-size: 14px;
            margin: 5px 0;
          }
          
          .signature {
            margin-top: 30px;
            color: #ffffff;
            font-weight: 500;
            font-size: 16px;
          }
          
          /* Mobile responsive */
          @media only screen and (max-width: 600px) {
            .email-container {
              margin: 0 10px;
              border-radius: 0 0 12px 12px;
            }
            
            .header, .content, .footer {
              padding: 25px 20px;
            }
            
            .app-name {
              font-size: 24px;
            }
            
            .header-title {
              font-size: 18px;
            }
            
            .reset-button {
              padding: 14px 28px;
              font-size: 16px;
            }
          }
        </style>
      </head>
      <body>
        <div style="display: none; max-height: 0; overflow: hidden;">Secure password reset for your ${env.APP_NAME} account</div>
        <table role="presentation" class="email-wrapper" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding: 0;">
              <table role="presentation" class="email-container" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 0; text-align: center;">
                    <img src="${env.LANDING_URL}/assets/images/pass_request.png" alt="Password Reset Request" width="600" height="176" style="display: block; width: 600px; height: auto; border-radius: 16px 16px 0 0; border: 0; outline: none; text-decoration: none; max-width: 100%; margin: 0 auto;">
                  </td>
                </tr>
                <tr>
                  <td class="content">
                    <p>Hello,</p>
                    
                    <p>We received a request to reset your password for your ${env.APP_NAME} account. If you made this request, click the button below to reset your password:</p>
                    
                    <div class="button-center">
                      <a href="${resetUrl}" class="reset-button">Reset My Password</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <div class="url-display">${resetUrl}</div>
                    
                    <div class="warning-box">
                      <div class="warning-title">⚠️ Important Security Notice</div>
                      <p>This link will expire in 1 hour for your security. If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
                    </div>
                    
                    <div class="security-notice">
                      <strong>🔒 Encryption Notice:</strong>
                      <p>After resetting your password, all your encrypted messages will be permanently deleted. This is a security feature because messages are encrypted with your current password and cannot be decrypted with a new one.</p>
                    </div>
                    
                    <div class="signature">
                      Best regards,<br>
                      The ${env.APP_NAME} Team
                    </div>
                  </td>
                </tr>
                <tr>
                  <td class="footer">
                    <p>This is an automated message from ${env.APP_NAME}.</p>
                    <p>Please do not reply to this email. If you need help, contact our support team.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const text = `
      Password Reset Request - ${env.APP_NAME}

      Hello,

      We received a request to reset your password for your ${env.APP_NAME} account.

      To reset your password, please visit the following link:
      ${resetUrl}

      This link will expire in 1 hour for your security.

      If you did not request this password reset, please ignore this email and your password will remain unchanged.

      Important: After resetting your password, all your encrypted messages will be permanently deleted for security reasons.

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
        <meta name="format-detection" content="telephone=no">
        <meta name="x-apple-disable-message-reformatting">
        <meta name="supported-color-schemes" content="light dark">
        <meta name="color-scheme" content="light dark">
        <title>Password Reset Confirmation - ${env.APP_NAME}</title>
        <style>
          /* Reset styles */
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          /* Email-safe fonts */
          body, table, td, p, h1, h2, h3, h4, h5, h6 {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
          }
          
          body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background-color: transparent !important;
            color: #ffffff;
            line-height: 1.6;
          }
          
          table {
            border-collapse: collapse !important;
            width: 100%;
          }
          
          .email-wrapper {
            width: 100%;
            background-color: transparent;
            padding: 20px 0;
          }
          
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #000000;
            border-radius: 16px;
            overflow: hidden;
          }
          
          .header {
            background-color: #001011;
            padding: 40px 30px;
            text-align: center;
            border-bottom: 3px solid #95E06C;
          }
          
          
          .content {
            padding: 40px 30px;
            background-color: #001011;
            color: #ffffff;
          }
          
          .content p {
            margin-bottom: 20px;
            color: #ffffff;
            font-size: 16px;
            line-height: 1.6;
          }
          
          .success-box {
            background-color: #001011;
            border: 2px solid #68b684;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
          }
          
          .success-title {
            font-weight: 600;
            color: #95e06c;
            margin-bottom: 8px;
            font-size: 18px;
          }
          
          .success-box p {
            color: #ffffff;
            margin: 0;
          }
          
          .info-box {
            background-color: #001011;
            border: 2px solid #1a2d20;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
          }
          
          .info-title {
            font-weight: 600;
            color: #95E06C;
            margin-bottom: 8px;
            font-size: 16px;
          }
          
          .info-box p {
            color: #ffffff;
            margin: 0;
          }

          .recommendations {
            background-color: #001011;
            border: 2px solid #1a2d20;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
          }
          
          .recommendations strong {
            color: #95e06c;
            font-size: 16px;
          }
          
          .recommendations ul {
            margin: 15px 0 0 20px;
            padding: 0;
          }
          
          .recommendations li {
            margin-bottom: 8px;
            color: #ffffff;
          }
          
          .footer {
            background-color: #000000;
            padding: 25px 30px;
            text-align: left;
          }
          
          .footer p {
            color: #999999;
            font-size: 14px;
            margin: 5px 0;
          }
          
          .signature {
            margin-top: 30px;
            color: #ffffff;
            font-weight: 500;
            font-size: 16px;
          }
          
          /* Mobile responsive */
          @media only screen and (max-width: 600px) {
            .email-container {
              margin: 0 10px;
              border-radius: 0 0 12px 12px;
            }
            
            .header, .content, .footer {
              padding: 25px 20px;
            }
            
            .app-name {
              font-size: 24px;
            }
            
            .header-title {
              font-size: 18px;
            }
          }
        </style>
      </head>
      <body>
        <div style="display: none; max-height: 0; overflow: hidden;">Secure password reset for your ${env.APP_NAME} account</div>
        <table role="presentation" class="email-wrapper" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding: 0;">
              <table role="presentation" class="email-container" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 0; text-align: center;">
                    <img src="${env.LANDING_URL}/assets/images/pass_success.png" alt="Password Reset Successful" width="600" height="176" style="display: block; width: 600px; height: auto; border-radius: 16px 16px 0 0; border: 0; outline: none; text-decoration: none; max-width: 100%; margin: 0 auto;">
                  </td>
                </tr>
                <tr>
                  <td class="content">
                    <p>Hello,</p>
                    
                    <div class="success-box">
                      <div class="success-title">✅ Success!</div>
                      <p>Your ${env.APP_NAME} password has been reset successfully.</p>
                    </div>
                    
                    <p>Your account is now secured with your new password. You can log in to ${env.APP_NAME} using your new credentials.</p>
                    
                    <div class="info-box">
                      <div class="info-title">📝 Note:</div>
                      <p>As part of the password reset process, all your previous encrypted messages have been permanently deleted. This is necessary because messages were encrypted with your old password and cannot be decrypted with the new one.</p>
                    </div>
                    
                    <p>If you did not perform this password reset, please contact our support team immediately as your account may have been compromised.</p>
                    
                    <div class="recommendations">
                      <strong>For your security, we recommend:</strong>
                      <ul>
                        <li>Using a strong, unique password</li>
                        <li>Regularly backing up your private key from Settings</li>
                      </ul>
                    </div>
                    
                    <div class="signature">
                      Best regards,<br>
                      The ${env.APP_NAME} Team
                    </div>
                  </td>
                </tr>
                <tr>
                  <td class="footer">
                    <p>This is an automated message from ${env.APP_NAME}.</p>
                    <p>Please do not reply to this email. If you need help, contact our support team.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
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
