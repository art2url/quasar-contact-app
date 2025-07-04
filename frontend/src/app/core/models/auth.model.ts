export interface AuthUserPayload {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface LoginResponse {
  token?: string; // Deprecated: kept for backward compatibility
  accessToken?: string; // Deprecated: kept for backward compatibility
  data?: { token?: string }; // Deprecated: kept for backward compatibility
  csrfToken?: string; // New: CSRF token for cookie-based auth
  user: AuthUserPayload;
  message?: string;
}

export interface RegisterResponse {
  message: string;
}
