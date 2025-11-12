import { mastra } from './src/mastra';

type CfEnv = Record<string, string>;
type CfExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

const ALLOW_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ALLOW_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-mastra-client-type',
  'x-request-id',
];
const EXPOSE_HEADERS = ['Content-Length', 'X-Requested-With', 'x-request-id'];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wildcardToRegExp = (pattern: string) => {
  const escaped = pattern.split('*').map(escapeRegExp).join('.*');
  return new RegExp(`^${escaped}$`);
};

const splitAllowedOrigins = (raw?: string | null) =>
  raw
    ? raw
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean)
    : [];

const matchesOrigin = (pattern: string, origin: string) => {
  if (pattern === '*') {
    return true;
  }
  if (pattern.includes('*')) {
    return wildcardToRegExp(pattern).test(origin);
  }
  return pattern === origin;
};

const resolveCorsOrigin = (requestOrigin: string | null, allowedOrigins: string[]) => {
  if (!requestOrigin) {
    return allowedOrigins[0] ?? '*';
  }
  const normalized = requestOrigin.replace(/\/$/, '');
  if (allowedOrigins.length === 0) {
    return normalized;
  }
  if (allowedOrigins.some((allowed) => matchesOrigin(allowed, normalized))) {
    return normalized;
  }
  return null;
};

const applyCorsHeaders = (headers: Headers, origin: string | null) => {
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  } else if (!headers.has('Access-Control-Allow-Origin')) {
    headers.set('Access-Control-Allow-Origin', '*');
  }
  headers.set('Access-Control-Allow-Methods', ALLOW_METHODS.join(', '));
  headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS.join(', '));
  headers.set('Access-Control-Expose-Headers', EXPOSE_HEADERS.join(', '));
};

const mastraHandler = mastra as unknown as {
  fetch(request: Request, env: CfEnv, ctx: CfExecutionContext): Promise<Response>;
};

export default {
  async fetch(request: Request, env: CfEnv, ctx: CfExecutionContext) {
    const allowedOrigins = splitAllowedOrigins(env.ALLOWED_ORIGINS);
    const origin = resolveCorsOrigin(request.headers.get('Origin'), allowedOrigins);

    if (request.method === 'OPTIONS') {
      const headers = new Headers();
      applyCorsHeaders(headers, origin);
      headers.set('Access-Control-Max-Age', (24 * 60 * 60).toString());
      return new Response(null, { status: 204, headers });
    }

    const response = await mastraHandler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    applyCorsHeaders(headers, origin);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
