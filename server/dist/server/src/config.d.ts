export interface AppConfig {
    dataDir: string;
    port: number;
    defaultTimezone: string;
    allowedOrigins: string[];
    webDist: string | null;
}
export declare function loadConfig(env: NodeJS.ProcessEnv): AppConfig;
