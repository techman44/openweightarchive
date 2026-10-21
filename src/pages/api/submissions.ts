import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { submissionSchema } from '../../../lib/schemas';
import { repository } from '../../../lib/server/store';
import { allowAttempt, errorResponse, json, readJSON, submissionSecret } from '../../../lib/server/http';

export const prerender = false;
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const secret = submissionSecret(env);
  if (!secret) return json({ error: 'Submission intake is not configured. Please try again later.' }, 503);
  if (!allowAttempt(`submit:${clientAddress}`)) return json({ error: 'Too many attempts. Try again later.' }, 429, { 'Retry-After': '900' });
  try {
    const input = submissionSchema.parse(await readJSON(request));
    const claim = await (await repository(env)).createClaim(input, clientAddress, secret);
    return json({
      id: claim.id, status: claim.status, challenge: claim.challenge,
      message: 'Claim recorded. Save this signed receipt. Automated reproduction is not connected; this receipt does not verify the score.',
    }, 201);
  } catch (error) { return errorResponse(error); }
};
