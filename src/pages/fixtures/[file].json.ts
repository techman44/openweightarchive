import type { APIRoute } from 'astro';
const fixtures = import.meta.glob('../../../fixtures/*.json', { eager: true, query: '?raw', import: 'default' });
import manifest from '../../../fixtures/benchmarks.json';
export function getStaticPaths() {
  return manifest.map(entry => ({ params: { file: entry.file.replace(/\.json$/, '') }, props: { file: entry.file } }));
}
export const GET: APIRoute = async ({ props }) => new Response(
  fixtures[`../../../fixtures/${props.file}`] as string,
  { headers: { 'Content-Type': 'application/json' } },
);
