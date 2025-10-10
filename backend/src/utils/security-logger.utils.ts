/**
 * Security event logging utility
 * Provides structured logging for security-related events
 */

export interface SecurityEvent {
  type: 'auth' | 'bot_blocked' | 'rate_limit' | 'csrf_violation' | 'suspicious_activity';
  action: string;
  ip: string;
  userAgent?: string;
  userId?: string;
  details?: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class SecurityLogger {
  private static logEvent(event: SecurityEvent): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      security_event: true,
      ...event,
    };

    // In production, you might want to send to a security monitoring service
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(logEntry));
    } else {
      console.log('🛡️ SECURITY EVENT:', logEntry);
    }
  }

  static logAuthFailure(ip: string, userAgent: string, details?: Record<string, unknown>): void {
    this.logEvent({
      type: 'auth',
      action: 'login_failed',
      ip,
      userAgent,
      details,
      severity: 'medium',
    });
  }

  static logBotBlocked(ip: string, userAgent: string, path: string, reason: string): void {
    this.logEvent({
      type: 'bot_blocked',
      action: 'request_blocked',
      ip,
      userAgent,
      details: { path, reason },
      severity: 'medium',
    });
  }

  static logRateLimitExceeded(ip: string, endpoint: string): void {
    this.logEvent({
      type: 'rate_limit',
      action: 'limit_exceeded',
      ip,
      details: { endpoint },
      severity: 'medium',
    });
  }

  static logCSRFViolation(ip: string, userAgent: string, details?: Record<string, unknown>): void {
    this.logEvent({
      type: 'csrf_violation',
      action: 'token_mismatch',
      ip,
      userAgent,
      details,
      severity: 'high',
    });
  }

  static logSuspiciousActivity(ip: string, activity: string, details?: Record<string, unknown>): void {
    this.logEvent({
      type: 'suspicious_activity',
      action: activity,
      ip,
      details,
      severity: 'high',
    });
  }

  static logPasswordReset(ip: string, email: string, success: boolean): void {
    this.logEvent({
      type: 'auth',
      action: success ? 'password_reset_success' : 'password_reset_attempt',
      ip,
      details: { email: this.maskEmail(email) },
      severity: success ? 'low' : 'medium',
    });
  }

  private static maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    const maskedLocal = local.length > 2
      ? `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`
      : '***';
    return `${maskedLocal}@${domain}`;
  }
}