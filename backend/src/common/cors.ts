// Origins allowed to call the API and the chat from a browser. CORS_ALLOWED_ORIGINS is a
// comma-separated list (e.g. "https://live.example.org"); a deployment that serves the site
// and the API on one host needs none. Without it, the historical development origins apply.
const DEFAULT_ORIGINS = ['http://localhost:3000', 'https://demo.ochocast.fr'];

export const corsOrigins = (): string[] => {
  const configured = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ORIGINS;
};
