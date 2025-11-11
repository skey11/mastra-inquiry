import { LibSQLStore } from '@mastra/libsql';

type LibSQLStoreConfig = {
  fallbackUrl: string;
};

const getNavigator = () => {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as { navigator?: { userAgent?: string } }).navigator;
};

const isCloudflareWorker = getNavigator()?.userAgent === 'Cloudflare-Workers';

const getEnvVar = (key: string) => {
  if (typeof process === 'undefined') return undefined;
  const value = process.env?.[key];
  return value && value.trim().length ? value.trim() : undefined;
};

const resolveLibsqlUrl = (fallbackUrl: string) => {
  const envUrl = getEnvVar('LIBSQL_URL');
  const url = envUrl ?? fallbackUrl;
  const usesLocalScheme = url.startsWith('file:') || url.includes(':memory:');
  if (usesLocalScheme && isCloudflareWorker) {
    throw new Error(
      'LIBSQL_URL must point to a remote libsql/turso endpoint (libsql://, https://, wss://, …) when running on Cloudflare Workers.',
    );
  }
  return url;
};

export const createLibSQLStore = ({ fallbackUrl }: LibSQLStoreConfig) => {
  const url = resolveLibsqlUrl(fallbackUrl);
  const authToken = getEnvVar('LIBSQL_AUTH_TOKEN');

  if (authToken) {
    return new LibSQLStore({ url, authToken });
  }

  return new LibSQLStore({ url });
};
