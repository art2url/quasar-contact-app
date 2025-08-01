import 'express-session';

declare module 'express-session' {
  interface SessionData {
    pendingReset?: {
      token: string;
      expires: number;
      used: boolean;
      createdAt: number;
    };
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    session: import('express-session').Session & Partial<import('express-session').SessionData>;
  }
}