import { Injectable } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
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
    // Check if user is authenticated (JWT is now in HttpOnly cookies)
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');
    if (!username || !userId) {
      console.error('[UserService] No auth data available');
      return of([]);
    }

    // Headers handled automatically by HTTP interceptor with cookies
    return this.http.get<UserSummary[]>(`${environment.apiUrl}/users`).pipe(
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
        // Re-throw the error to let the calling service handle it appropriately
        throw error;
      })
    );
  }

  /** Mark current user's keys as missing/lost */
  markKeysAsMissing(): Observable<StandardResponse> {
    return this.http.post<StandardResponse>(getApiPath('keys/mark-missing'), {});
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
      return of([]);
    }

    const apiUrl = `${environment.apiUrl}/users`;

    return this.http
      .get<UserSummary[]>(apiUrl, {
        params: { query },
      })
      .pipe(
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

    if (!username || !userId) {
      console.error('[UserService] No auth data available for DMs');
      return of([]);
    }

    // Headers handled automatically by HTTP interceptor with cookies
    return this.http.get<UserSummary[]>(apiUrl).pipe(
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
