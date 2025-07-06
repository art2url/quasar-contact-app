import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CsrfService {
  private csrfToken: string | null = null;

  setToken(token: string): void {
    this.csrfToken = token;
    // Store in localStorage for persistence across browser sessions
    localStorage.setItem('csrf_token', token);
  }

  getToken(): string | null {
    // First try to get from memory
    if (this.csrfToken) {
      return this.csrfToken;
    }

    // Fall back to localStorage
    const stored = localStorage.getItem('csrf_token');
    if (stored) {
      this.csrfToken = stored;
      return stored;
    }

    return null;
  }

  clearToken(): void {
    this.csrfToken = null;
    localStorage.removeItem('csrf_token');
  }

  hasToken(): boolean {
    return !!this.getToken();
  }
}
