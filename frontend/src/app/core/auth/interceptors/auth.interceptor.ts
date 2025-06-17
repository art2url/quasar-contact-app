import {inject} from '@angular/core';
import {
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpEvent,
} from '@angular/common/http';
import {Router} from '@angular/router';
import {catchError, throwError, timer, mergeMap, Observable} from 'rxjs';

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

  // Check if this URL is currently rate limited
  const urlKey = getUrlKey(req);
  const now = Date.now();
  const limitUntil = rateLimitedUntil[urlKey] || 0;

  // If rate limited, wait until the rate limit expires
  if (limitUntil > now) {
    const waitTime = limitUntil - now;
    console.log(
      `URL ${urlKey} is rate limited. Waiting ${Math.ceil(
        waitTime / 1000
      )} seconds...`
    );
    return timer(waitTime).pipe(
      mergeMap(() => proceedWithRequest(req, next, router, urlKey))
    );
  }

  return proceedWithRequest(req, next, router, urlKey);
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
 * Add auth token and proceed with the request
 */
function proceedWithRequest(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  router: Router,
  urlKey: string
): Observable<HttpEvent<unknown>> {
  if (
    request.url.includes('/api/auth/login') ||
    request.url.includes('/api/auth/register') ||
    request.url.includes('/health')
  ) {
    console.log('[AuthInterceptor] Skipping token for endpoint:', request.url);
    return next(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 429) {
          return handleRateLimitError(error, urlKey);
        }
        return throwError(() => error);
      })
    );
  }

  const token = localStorage.getItem('token');
  console.log(
    '[AuthInterceptor] Adding token to request:',
    request.url,
    !!token
  );

  // If the token exists, clone the request and attach the Authorization header
  if (token) {
    // Clone and set both headers
    request = request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
        'x-access-token': token,
      },
    });
  } else {
    console.warn('[AuthInterceptor] No token found for authenticated request!');
  }

  // Forward the request with error handling
  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      console.error(
        '[AuthInterceptor] Request error:',
        error.status,
        request.url
      );

      if (error.status === 429) {
        return handleRateLimitError(error, urlKey);
      }

      // Handle auth errors
      if (error.status === 401) {
        // Unauthorized - token may be expired
        console.warn(
          '[AuthInterceptor] Received 401 Unauthorized - redirecting to login'
        );
        // Clear token since it's invalid
        localStorage.removeItem('token');
        // Navigate to login with /app prefix since we're inside the Angular app
        router.navigate(['/auth/login']);
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

  console.warn(
    `Rate limited at ${urlKey} (429). Backing off for ${Math.ceil(
      retryAfter / 1000
    )} seconds.`
  );

  // Return the error after setting the rate limit
  return throwError(() => new Error(`Rate limited. Please try again later.`));
}
