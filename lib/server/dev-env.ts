// Only resolved by the explicit dev:json configuration, never by the Workers build.
export const env: Partial<Cloudflare.Env> = {
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'archivist',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SUBMISSION_SECRET: process.env.SUBMISSION_SECRET,
};
