import { inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpEvent,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError, timer, mergeMap, Observable } from 'rxjs';
import { CsrfService } from '../../services/csrf.service';

// Track rate limiting across the application using Record instead of index signature
const rateLimitedUntil: Record<string, number> = {};

/**
 * Auth interceptor function for standalone components
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const router = inject(Router);
  const csrfService = inject(CsrfService);

  // Check if this URL is currently rate limited
  const urlKey = getUrlKey(req);
  const now = Date.now();
  const limitUntil = rateLimitedUntil[urlKey] || 0;

  // If rate limited, wait until the rate limit expires
  if (limitUntil > now) {
    const waitTime = limitUntil - now;
    return timer(waitTime).pipe(
      mergeMap(() => proceedWithRequest(req, next, router, urlKey, csrfService))
    );
  }

  return proceedWithRequest(req, next, router, urlKey, csrfService);
};

/**
 * Get a normalized URL key for rate limiting tracking
 */
function getUrlKey(request: HttpRequest<unknown>): string {
  // Create a simple URL key based on method and path
  const url = new URL(request.url);
  return `${request.method}:${url.hostname}${url.pathname}`;
}

/**
 * Add auth cookies, CSRF token and proceed with the request
 */
function proceedWithRequest(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  router: Router,
  urlKey: string,
  csrfService: CsrfService
): Observable<HttpEvent<unknown>> {
  // Always include credentials (cookies) for all API requests
  request = request.clone({
    setHeaders: {},
    withCredentials: true,
  });

  // Handle CSRF token for state-changing operations (POST, PUT, DELETE, PATCH)
  const needsCSRF = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);

  if (needsCSRF) {
    const csrfToken = csrfService.getToken();
    if (csrfToken) {
      request = request.clone({
        setHeaders: {
          'X-CSRF-Token': csrfToken,
        },
      });
    } else if (
      !request.url.includes('/api/auth/login') &&
      !request.url.includes('/api/auth/register') &&
      !request.url.includes('/api/auth/forgot-password') &&
      !request.url.includes('/api/auth/reset-password')
    ) {
      console.error('[AuthInterceptor] No CSRF token found for state-changing request!');
    }
  }


  // Forward the request with error handling
  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      console.error('[AuthInterceptor] Request error:', error.status, request.url);

      if (error.status === 429) {
        return handleRateLimitError(error, urlKey);
      }

      // Handle auth errors
      if (error.status === 401) {
        // Unauthorized - cookies may be expired or invalid
        console.error(
          '[AuthInterceptor] Received 401 Unauthorized - redirecting to login'
        );
        // Clear CSRF token since auth is invalid
        csrfService.clearToken();
        // Only redirect if not already on an auth page
        if (!router.url.includes('/auth/')) {
          // Navigate to login with /app prefix since we're inside the Angular app
          router.navigate(['/auth/login']);
        }
      }

      return throwError(() => error);
    })
  );
}

/**
 * Handle rate limit errors globally
 */
function handleRateLimitError(
  error: HttpErrorResponse,
  urlKey: string
): Observable<never> {
  // Get retry-after from header or use default
  let retryAfter = 0;

  if (error.headers && error.headers.get('Retry-After')) {
    // Use server's retry-after header if available
    const headerValue = error.headers.get('Retry-After');
    retryAfter = Number(headerValue) * 1000; // Convert to milliseconds
  } else {
    // Default backoff of 60 seconds if no header provided
    retryAfter = 60000;
  }

  // Set the rate limit for this URL
  const resetTime = Date.now() + retryAfter;
  rateLimitedUntil[urlKey] = resetTime;

  console.error(
    `Rate limited at ${urlKey} (429). Backing off for ${Math.ceil(
      retryAfter / 1000
    )} seconds.`
  );

  // Return the error after setting the rate limit
  return throwError(() => new Error(`Rate limited. Please try again later.`));
}
