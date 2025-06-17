declare namespace NodeJS {
  interface ProcessEnv {
    readonly NG_APP_API_URL: string;
    readonly NG_APP_WS_URL: string;
    readonly NODE_ENV: 'development' | 'production';
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
