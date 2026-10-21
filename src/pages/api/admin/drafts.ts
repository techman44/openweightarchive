import type { APIRoute } from 'astro';
import { draftSchema } from '../../../../lib/schemas';
import { repository } from '../../../../lib/server/store';
import { errorResponse, json, readJSON } from '../../../../lib/server/http';

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const input = draftSchema.parse(await readJSON(request));
    const draft = await repository().createDraft(input);
    return json({ id: draft.id, message: 'Draft saved for editorial review. Publication requires a content update and rebuild.' }, 201);
  } catch (error) { return errorResponse(error); }
};
