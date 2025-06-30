import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { getApiPath } from '@utils/api-paths.util';
import {
  MessageHistoryResponse,
  MessageOverview,
  LastMessageResponse,
} from '@models/api-response.model';

@Injectable({ providedIn: 'root' })
export class MessagesService {
  // Track loading and error states
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  constructor(private http: HttpClient) {}

  /** full scroll-back */
  getMessageHistory(withUserId: string): Observable<MessageHistoryResponse> {
    // Check authentication first
    if (!this.isAuthenticated()) {
      console.warn('Attempted to load message history while not authenticated');
      return of({
        messages: [],
      } as MessageHistoryResponse);
    }

    this.loadingSubject.next(true);

    return this.http
      .get<MessageHistoryResponse>(getApiPath(`messages/history/${withUserId}`))
      .pipe(
        tap(() => this.loadingSubject.next(false)),
        catchError((error: HttpErrorResponse) => {
          console.error(
            '[MessagesService] Failed to load message history:',
            error
          );
          this.loadingSubject.next(false);
          this.errorSubject.next('Failed to load message history');
          return of({
            messages: [],
          } as MessageHistoryResponse);
        })
      );
  }

  /** left-panel overview (peer + last text + unread) */
  getOverviews(): Observable<MessageOverview[]> {
    // Check authentication first before making the request
    if (!this.isAuthenticated()) {
      console.warn('Attempted to load overviews while not authenticated');
      return of([]);
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.http
      .get<MessageOverview[]>(getApiPath('messages/overview'))
      .pipe(
        tap(() => this.loadingSubject.next(false)),
        catchError((error: HttpErrorResponse) => {
          console.error('[MessagesService] Failed to load overviews:', error);
          this.errorSubject.next('Failed to load message overviews');
          this.loadingSubject.next(false);
          return of([]);
        })
      );
  }

  /** single last-message ping (used for notifications) */
  getLastMessage(withUserId: string): Observable<LastMessageResponse> {
    // Check authentication first
    if (!this.isAuthenticated()) {
      console.warn('Attempted to load last message while not authenticated');
      return of({} as LastMessageResponse);
    }

    return this.http
      .get<LastMessageResponse>(getApiPath(`messages/last/${withUserId}`))
      .pipe(
        catchError((error: HttpErrorResponse) => {
          console.error(
            '[MessagesService] Failed to load last message:',
            error
          );
          return of({} as LastMessageResponse);
        })
      );
  }

  /**
   * Check if user is authenticated
   */
  private isAuthenticated(): boolean {
    // Check for user authentication data (JWT is now in HttpOnly cookies)
    return !!(localStorage.getItem('username') && localStorage.getItem('userId'));
  }
}
