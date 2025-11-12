
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { tcmConsultationWorkflow } from './workflows/tcm-consultation-workflow';
import { tcmConsultationAgent } from './agents/tcm-agent';
import { toolCallAppropriatenessScorer, completenessScorer, safetyReminderScorer } from './scorers/tcm-scorer';
import { CloudflareDeployer } from "@mastra/deployer-cloudflare";
import { createLibSQLStore } from './libsql-store';

const getAllowedOrigins = (): string[] => {
  if (typeof process === 'undefined' || !process.env?.ALLOWED_ORIGINS) {
    return [];
  }
  return process.env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wildcardToRegExp = (pattern: string) => {
  const escaped = pattern.split('*').map(escapeRegExp).join('.*');
  return new RegExp(`^${escaped}$`);
};

const allowedOrigins = getAllowedOrigins();
const originMatchers = allowedOrigins.map((origin) => {
  if (origin === '*') {
    return () => true;
  }
  if (origin.includes('*')) {
    const regex = wildcardToRegExp(origin);
    return (requestOrigin: string) => regex.test(requestOrigin);
  }
  return (requestOrigin: string) => requestOrigin === origin;
});

const resolveCorsOrigin = (requestOrigin?: string | null) => {
  if (!requestOrigin) {
    return allowedOrigins[0] ?? '*';
  }
  if (originMatchers.length === 0) {
    return requestOrigin;
  }
  return originMatchers.some((matcher) => matcher(requestOrigin)) ? requestOrigin : null;
};

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
    cors: {
      origin: (origin) => resolveCorsOrigin(origin),
      credentials: true,
      maxAge: 60 * 60 * 24, // cache preflight for 24h
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "x-mastra-client-type",
        "x-request-id",
      ],
      exposeHeaders: ["Content-Length", "X-Requested-With", "x-request-id"],
    },
  },
});
