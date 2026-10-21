import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { allowAttempt, json, requireAdmin, requireSameOrigin, errorResponse } from '../lib/server/http';

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  if (path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/')) {
    if (!allowAttempt(`admin:${context.clientAddress}`, 120)) return json({ error: 'Too many requests. Try again later.' }, 429, { 'Retry-After': '900' });
    const denied = requireAdmin(context.request, env);
    if (denied) return denied;
    try { if (context.request.method !== 'GET' && context.request.method !== 'HEAD') requireSameOrigin(context.request); }
    catch (error) { return errorResponse(error); }
    const response = await next();
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  const response = await next();
  if (path.startsWith('/api/') || path.startsWith('/_server-islands/')) {
    response.headers.set('Cache-Control', 'no-store');
  } else if (response.headers.get('Content-Type')?.includes('text/html') && !response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'public, max-age=60, must-revalidate');
  }
  return response;
});
