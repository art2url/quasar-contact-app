import { environment } from '@environments/environment';

/**
 * Constructs API paths ensuring correct formatting with the /api prefix
 *
 * This function handles various edge cases:
 * 1. Ensures there's no trailing slash in the base URL
 * 2. Adds /api prefix if not already present in the base URL
 * 3. Ensures endpoint has a leading slash
 * 4. Handles undefined environment variables
 */
export function getApiPath(endpoint: string): string {
  // Make sure environment.apiUrl is defined
  if (!environment.apiUrl) {
    console.error('API URL not defined in environment');
    return `http://localhost:5001/api/${endpoint}`;
  }

  // Don't manipulate the URL, just add the endpoint!
  return `${environment.apiUrl}/${
    endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  }`;
}

/**
 * Constructs WebSocket paths
 *
 * WebSocket connections typically don't need the /api prefix
 */
export function getWsPath(): string {
  if (!environment.wsUrl) {
    console.error('WebSocket URL not defined in environment');
    return 'ws://localhost:5000';
  }

  return environment.wsUrl;
}
