export const environment = {
  production: process.env.NODE_ENV === 'production',
  apiUrl: process.env.NG_APP_API_URL!,
  wsUrl: process.env.NG_APP_WS_URL!,
};
