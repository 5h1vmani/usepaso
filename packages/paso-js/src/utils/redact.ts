/**
 * Redact sensitive query parameter values from URLs for safe logging.
 * Matches common parameter names used for authentication.
 */

const SENSITIVE_PARAMS = new Set([
  'api_key',
  'apikey',
  'api-key',
  'token',
  'access_token',
  'auth_token',
  'secret',
  'client_secret',
  'password',
  'passwd',
  'key',
]);

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let redacted = false;
    for (const [key] of parsed.searchParams) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '***');
        redacted = true;
      }
    }
    return redacted ? parsed.toString() : url;
  } catch {
    return url;
  }
}
