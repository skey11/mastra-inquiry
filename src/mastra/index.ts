
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { tcmConsultationWorkflow } from './workflows/tcm-consultation-workflow';
import { tcmConsultationAgent } from './agents/tcm-agent';
import { toolCallAppropriatenessScorer, completenessScorer, safetyReminderScorer } from './scorers/tcm-scorer';
import { CloudflareDeployer } from "@mastra/deployer-cloudflare";
import { createLibSQLStore } from './libsql-store';

const getCloudflareEnv = () => {
  if (typeof process === 'undefined' || !process.env) {
    return { NODE_ENV: "production" };
  }

  const envVars: Record<string, string> = { NODE_ENV: "production" };
  if (process.env.LIBSQL_URL) {
    envVars.LIBSQL_URL = process.env.LIBSQL_URL;
  }
  if (process.env.LIBSQL_AUTH_TOKEN) {
    envVars.LIBSQL_AUTH_TOKEN = process.env.LIBSQL_AUTH_TOKEN;
  }
  return envVars;
};

const frontendOriginFromEnv = typeof process !== 'undefined' ? process.env?.FRONTEND_ORIGIN : undefined;
const corsEnvOrigins = typeof process !== 'undefined' && process.env?.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];

const allowedOrigins = [
  'https://449cdfa5.mastra-frontend.pages.dev',
  'https://mastra.viplook.dpdns.org',
  frontendOriginFromEnv,
  ...corsEnvOrigins,
].filter((origin): origin is string => Boolean(origin));

const baseCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mastra-client-type',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Expose-Headers': 'Content-Length, X-Requested-With',
};

const resolveAllowedOrigin = (origin: string | null | undefined) => {
  if (!origin || !allowedOrigins.length) return null;
  if (allowedOrigins.includes('*')) return origin;
  return allowedOrigins.includes(origin) ? origin : null;
};

const createCorsMiddleware = () => ({
  path: '*',
  handler: async (c: any, next: () => Promise<void>) => {
    const requestOrigin = c.req.header('Origin') ?? c.req.header('origin');
    const allowedOrigin = resolveAllowedOrigin(requestOrigin);

    if (c.req.method === 'OPTIONS') {
      if (!allowedOrigin) {
        return new Response(null, { status: 204 });
      }
      const headers = new Headers(baseCorsHeaders);
      headers.set('Access-Control-Allow-Origin', allowedOrigin);
      headers.append('Vary', 'Origin');
      const requestHeaders = c.req.header('Access-Control-Request-Headers');
      if (requestHeaders) {
        headers.set('Access-Control-Allow-Headers', requestHeaders);
      }
      return new Response(null, { status: 204, headers });
    }

    try {
      await next();
    } finally {
      if (allowedOrigin) {
        c.header('Access-Control-Allow-Origin', allowedOrigin, { overwrite: true });
        c.header('Vary', 'Origin', { append: true });
      }
      Object.entries(baseCorsHeaders).forEach(([key, value]) => {
        c.header(key, value, { overwrite: true });
      });
    }
  },
});

const corsConfig = {
  origin: allowedOrigins.length ? allowedOrigins : '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-mastra-client-type'],
  exposeHeaders: ['Content-Length', 'X-Requested-With'],
  credentials: true,
};

export const mastra = new Mastra({
  workflows: { tcmConsultationWorkflow },
  agents: { tcmConsultationAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, safetyReminderScorer },
  storage: createLibSQLStore({
    // stores observability, scores, ... into memory storage, if it needs to persist, change LIBSQL_URL to a remote libsql endpoint
    fallbackUrl: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: false, 
  },
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true }, 
  },
  deployer: new CloudflareDeployer({
    projectName: "mastraagent",
    env: getCloudflareEnv(),
  }),
  server: {
    cors: corsConfig,
    middleware: [createCorsMiddleware()],
  },
});
