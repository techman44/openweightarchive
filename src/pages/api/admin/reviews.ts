import type { APIRoute } from 'astro';
import { reviewSchema } from '../../../../lib/schemas';
import { repository } from '../../../../lib/server/store';
import { errorResponse, json, readJSON } from '../../../../lib/server/http';

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const input = reviewSchema.parse(await readJSON(request));
    const claim = await repository().reviewClaim(input);
    return json({ id: claim.id, status: claim.status, message: 'Review saved. The score has not been verified.' });
  } catch (error) { return errorResponse(error); }
};
