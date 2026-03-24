import { PasoCapability, PasoDeclaration } from './types';

export interface ExecutionRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ExecutionResult {
  request: ExecutionRequest;
  status?: number;
  statusText?: string;
  body: string;
  durationMs: number;
  error?: string;
}

/**
 * Build the HTTP request for a capability without executing it.
 * Note: does not validate required inputs — callers (CLI, MCP) must validate before calling.
 */
export function buildRequest(
  cap: PasoCapability,
  args: Record<string, unknown>,
  decl: PasoDeclaration,
  authToken?: string,
): ExecutionRequest {
  let path = cap.path;
  const queryParams: Record<string, string> = {};
  const bodyParams: Record<string, unknown> = {};

  if (cap.inputs) {
    for (const [name, input] of Object.entries(cap.inputs)) {
      const value = args[name];
      if (value === undefined) continue;

      const location =
        input.in || (['POST', 'PUT', 'PATCH'].includes(cap.method) ? 'body' : 'query');

      switch (location) {
        case 'path':
          path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
          break;
        case 'query':
          queryParams[name] = String(value);
          break;
        case 'header':
          // Handled in the header loop below
          break;
        case 'body':
          bodyParams[name] = value;
          break;
        default:
          throw new Error(
            `Unknown input location "${location}" for parameter "${name}". Expected one of: path, query, body, header.`,
          );
      }
    }
  }

  const baseUrl = decl.service.base_url.replace(/\/+$/, '');
  const fullPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl}${fullPath}`);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(cap.method);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  };

  if (decl.service.auth) {
    if (decl.service.auth.type === 'none') {
      // Skip auth — notice is logged once at command startup, not per-request
    } else {
      const token = authToken ?? process.env.USEPASO_AUTH_TOKEN;
      if (token) {
        const authType = decl.service.auth.type;
        const authHeader = decl.service.auth.header || 'Authorization';
        switch (authType) {
          case 'bearer':
          case 'oauth2': {
            const prefix = decl.service.auth.prefix ?? 'Bearer';
            headers[authHeader] = prefix ? `${prefix} ${token}` : token;
            break;
          }
          case 'api_key':
            headers[authHeader] = token;
            break;
          default:
            process.stderr.write(
              `Warning: unknown auth.type "${authType}" — sending token as-is in ${authHeader}\n`,
            );
            headers[authHeader] = token;
        }
      }
    }
  }

  // Header-type inputs
  if (cap.inputs) {
    for (const [name, input] of Object.entries(cap.inputs)) {
      if (input.in === 'header' && args[name] !== undefined) {
        headers[name] = String(args[name]).replace(/[\r\n]/g, '');
      }
    }
  }

  const req: ExecutionRequest = {
    method: cap.method,
    url: url.toString(),
    headers,
  };

  if (['POST', 'PUT', 'PATCH'].includes(cap.method) && Object.keys(bodyParams).length > 0) {
    req.body = JSON.stringify(bodyParams);
  }

  return req;
}

/**
 * Execute an HTTP request and return the result.
 */
export async function executeRequest(req: ExecutionRequest): Promise<ExecutionResult> {
  const start = Date.now();

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: req.headers,
      signal: AbortSignal.timeout(30000),
    };

    if (req.body) {
      fetchOptions.body = req.body;
    }

    // Guard against very large responses. Only checks content-length header;
    // chunked/streaming responses without this header bypass the limit.
    const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
    const response = await fetch(req.url, fetchOptions);
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      throw new Error(`Response too large (${contentLength} bytes, max ${MAX_RESPONSE_SIZE})`);
    }
    const text = await response.text();
    const durationMs = Date.now() - start;

    let body: string;
    try {
      const json = JSON.parse(text);
      body = JSON.stringify(json, null, 2);
    } catch {
      body = text;
    }

    return {
      request: req,
      status: response.status,
      statusText: response.statusText,
      body,
      durationMs,
    };
  } catch (error) {
    return {
      request: req,
      body: '',
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format a friendly error message for common HTTP status codes.
 */
export function formatError(
  result: ExecutionResult,
  decl: PasoDeclaration,
  authToken?: string,
): string {
  if (result.error) {
    return `Request failed: ${result.error}`;
  }

  if (!result.status) return 'Unknown error';

  if (result.status === 401) {
    const authType = decl.service.auth?.type || 'unknown';
    const hasToken = !!(authToken ?? process.env.USEPASO_AUTH_TOKEN);
    let msg = `Error 401: Authentication failed.`;
    if (!hasToken) {
      msg += `\n  → USEPASO_AUTH_TOKEN is not set. Set it with: export USEPASO_AUTH_TOKEN=your-token`;
    } else {
      msg += `\n  → USEPASO_AUTH_TOKEN is set but was rejected by the API.`;
      msg += `\n  → Auth type: ${authType}. Check that your token is valid and has the required scopes.`;
    }
    return msg;
  }

  if (result.status === 403) {
    return `Error 403: Forbidden. Your token does not have permission for this action.\n  → Check the required scopes/permissions for this endpoint.`;
  }

  if (result.status === 404) {
    return `Error 404: Not found.\n  → Check that base_url and path are correct in your usepaso.yaml.\n  → URL was: ${result.request.url}`;
  }

  if (result.status === 429) {
    return `Error 429: Rate limited. The API is throttling requests.\n  → Wait and try again, or check your rate limit constraints.`;
  }

  if (result.status >= 500) {
    return `Error ${result.status}: Server error from the API.\n  → This is likely a problem on the API side, not with usepaso.`;
  }

  return `Error ${result.status} ${result.statusText || ''}: ${result.body}`;
}
