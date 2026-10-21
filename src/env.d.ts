/// <reference path="../worker-configuration.d.ts" />

// Import binding types without merging Workers' HTMLRewriter Element into browser DOM types.
type D1Database = import('@cloudflare/workers-types').D1Database;
type R2Bucket = import('@cloudflare/workers-types').R2Bucket;
type Fetcher = import('@cloudflare/workers-types').Fetcher;

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}

declare namespace Cloudflare {
  // Runtime secrets are optional: private endpoints fail closed until configured.
  interface Env {
    ADMIN_PASSWORD?: string;
    SUBMISSION_SECRET?: string;
  }
}
