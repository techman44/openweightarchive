import { createD1Repository } from './d1-store.ts';
import { HttpError } from './http.ts';
import type { ArchiveRepository } from './records.ts';

export async function repository(bindings: Partial<Cloudflare.Env>): Promise<ArchiveRepository> {
  if (bindings.OWA_DB) return createD1Repository(bindings.OWA_DB);
  // This import and every filesystem write are eliminated from production builds.
  // A broken/missing production D1 binding must never silently fall back to JSON.
  if (import.meta.env.DEV) {
    const { createFileRepository } = await import('./file-store.ts');
    return createFileRepository(import.meta.env.DATA_DIR || './data');
  }
  throw new HttpError(503, 'Archive storage is not configured.');
}
