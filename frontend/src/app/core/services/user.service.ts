import { Injectable } from '@angular/core';
import { catchError, Observable, of, tap } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '@environments/environment';

import {
  KeyBundleResponse,
  DmRoomResponse,
  StandardResponse,
} from '@models/api-response.model';
import { UserSummary } from '@models/user.model';

import { getApiPath } from '@utils/api-paths.util';

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private http: HttpClient) {}

  /* ───────── users roster ───────── */

  /** List **all** users (admin / pick-contact screen) */
  listUsers(): Observable<UserSummary[]> {
    console.log('[UserService] Fetching all users from:', `${environment.apiUrl}/users`);

    // Check if user is authenticated (JWT is now in HttpOnly cookies)
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');
    if (!username || !userId) {
      console.error('[UserService] No auth data available');
      return of([]);
    }

    // Headers handled automatically by HTTP interceptor with cookies

    return this.http.get<UserSummary[]>(`${environment.apiUrl}/users`).pipe(
      tap(users => {
        console.log('[UserService] Users response successful, count:', users.length);
        console.log('[UserService] First few users:', users.slice(0, 3));
      }),
      catchError(error => {
        console.error('[UserService] Error fetching users:', error);

        // Log more details about the error
        if (error.status) {
          console.error(
            `[UserService] Status: ${error.status}, Message: ${error.message}`
          );
        }

        if (error.error) {
          console.error('[UserService] Error details:', error.error);
        }

        return of([]);
      })
    );
  }

  uploadPublicKey(publicKey: string): Observable<StandardResponse> {
    return this.http.post<StandardResponse>(getApiPath('keys/upload'), {
      publicKeyBundle: publicKey,
    });
  }

  /** Retrieve someone's public key bundle for E2E encryption */
  getPublicKey(userId: string): Observable<KeyBundleResponse> {
    return this.http.get<KeyBundleResponse>(getApiPath(`keys/${userId}`)).pipe(
      catchError(error => {
        console.log(`[UserService] Failed to get public key for ${userId}:`, error.status, error.message);
        // Re-throw the error to let the calling service handle it appropriately
        throw error;
      })
    );
  }

  /** Mark current user's keys as missing/lost */
  markKeysAsMissing(): Observable<StandardResponse> {
    return this.http.post<StandardResponse>(getApiPath('keys/mark-missing'), {});
  }

  /** Debug method: Clear keys missing flag for current user */
  debugClearKeysMissingFlag(): Observable<StandardResponse> {
    return this.http.post<StandardResponse>(getApiPath('keys/debug-clear-missing'), {});
  }

  /** Fix inconsistent key states - users who have keys but are marked as missing */
  fixInconsistentKeyStates(): Observable<StandardResponse> {
    return this.http.post<StandardResponse>(getApiPath('keys/debug/fix-inconsistent'), {});
  }

  /** Emergency cleanup: Clear isKeyMissing flag for ALL users */
  clearAllMissingFlags(): Observable<StandardResponse> {
    return this.http.post<StandardResponse>(getApiPath('keys/debug-clear-all-missing'), {});
  }

  /* ───────── profile / avatar ───────── */

  /** Change my avatar URL */
  updateMyAvatar(url: string): Observable<StandardResponse> {
    return this.http.put<StandardResponse>(getApiPath('users/me/avatar'), {
      avatarUrl: url,
    });
  }

  /* ───────── search / DMs ───────── */

  /** Search users by name */
  searchUsers(query: string): Observable<UserSummary[]> {
    if (!query || query.trim().length === 0) {
      console.log('[UserService] Search query is empty:', query);
      return of([]);
    }

    const apiUrl = `${environment.apiUrl}/users`;
    console.log('[UserService] Searching users with query:', query, 'URL:', apiUrl);

    return this.http
      .get<UserSummary[]>(apiUrl, {
        params: { query },
      })
      .pipe(
        tap(users => console.log('[UserService] User search results:', users)),
        catchError(error => {
          console.error('[UserService] Error searching users:', error);
          return of([]);
        })
      );
  }

  /** Create (or fetch) a direct-message room between me and *userId* */
  createDm(userId: string): Observable<DmRoomResponse> {
    return this.http.post<DmRoomResponse>(getApiPath('rooms/dm'), {
      userId,
    });
  }

  /** List only the users I already have DMs with */
  listMyDms(): Observable<UserSummary[]> {
    const apiUrl = `${environment.apiUrl}/rooms/my-dms`;
    // Check if user is authenticated (JWT is now in HttpOnly cookies)
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');

    console.log('[UserService] Requesting DMs with:', {
      apiUrl,
      hasAuth: !!(username && userId),
    });

    if (!username || !userId) {
      console.error('[UserService] No auth data available for DMs');
      return of([]);
    }

    // Headers handled automatically by HTTP interceptor with cookies

    return this.http.get<UserSummary[]>(apiUrl).pipe(
      tap(response => console.log('[UserService] DM response:', response)),
      catchError(error => {
        console.error('[UserService] DM list error:', error);

        // Try to extract more details about the error
        let errorMessage = 'Unknown error';
        if (error.error && error.error.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        console.error('[UserService] Error message:', errorMessage);
        return of([]);
      })
    );
  }
}
