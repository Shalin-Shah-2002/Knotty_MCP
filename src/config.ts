/**
 * Configuration management with environment variable support
 */

import { z } from 'zod';

const ConfigSchema = z.object({
  openApiSpecUrl: z.string().url('OPENAPI_SPEC_URL must be a valid URL'),
  authToken: z.string().optional(),
  cacheRefreshMinutes: z.number().min(1).default(10),
  rateLimitMax: z.number().min(1).default(60),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  serverName: z.string().default('knotty'),
  serverVersion: z.string().default('1.0.0'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const rawConfig = {
    openApiSpecUrl: process.env.OPENAPI_SPEC_URL,
    authToken: process.env.SWAGGER_AUTH_TOKEN || undefined,
    cacheRefreshMinutes: parseInt(process.env.CACHE_REFRESH_MINUTES || '10', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    serverName: process.env.MCP_SERVER_NAME || 'knotty',
    serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
  };

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Configuration validation failed: ${errors}`);
  }

  return result.data;
}
