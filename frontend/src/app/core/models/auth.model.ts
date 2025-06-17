export interface AuthUserPayload {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface LoginResponse {
  token?: string;
  accessToken?: string;
  data?: { token?: string };
  user: AuthUserPayload;
}

export interface RegisterResponse {
  message: string;
}
