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
  retryAfterSeconds?: number;
}

export interface StructuredError {
  error: true;
  type:
    | 'auth_failed'
    | 'forbidden'
    | 'not_found'
    | 'rate_limited'
    | 'server_error'
    | 'network_error'
    | 'client_error';
  status: number | null;
  message: string;
  hint: string;
  retry_after_seconds?: number;
  request_url: string;
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

  let baseUrl = decl.service.base_url;
  while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
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
      const token = authToken;
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
export async function executeRequest(
  req: ExecutionRequest,
  options?: { timeout?: number },
): Promise<ExecutionResult> {
  const start = Date.now();
  const timeout = options?.timeout ?? 30000;

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: req.headers,
      signal: AbortSignal.timeout(timeout),
    };

    if (req.body) {
      fetchOptions.body = req.body;
    }

    const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
    const response = await fetch(req.url, fetchOptions);

    // Check content-length first (fast path)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      throw new Error(`Response too large (${contentLength} bytes, max ${MAX_RESPONSE_SIZE})`);
    }

    // Read body with size guard — also catches chunked responses without content-length
    let text: string;
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_SIZE) {
          reader.cancel();
          throw new Error(
            `Response too large (>${MAX_RESPONSE_SIZE} bytes streamed, max ${MAX_RESPONSE_SIZE})`,
          );
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode()); // flush
      text = chunks.join('');
    } else {
      text = await response.text();
    }

    const durationMs = Date.now() - start;

    let body: string;
    try {
      const json = JSON.parse(text);
      body = JSON.stringify(json, null, 2);
    } catch {
      body = text;
    }

    // Capture Retry-After header for 429 responses
    let retryAfterSeconds: number | undefined;
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        retryAfterSeconds = isNaN(parsed) ? undefined : parsed;
      }
    }

    return {
      request: req,
      status: response.status,
      statusText: response.statusText,
      body,
      durationMs,
      retryAfterSeconds,
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
    const hasToken = !!authToken;
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
    const retryHint = result.retryAfterSeconds
      ? `Retry after ${result.retryAfterSeconds} seconds.`
      : 'Wait and try again, or check your rate limit constraints.';
    return `Error 429: Rate limited. ${retryHint}`;
  }

  if (result.status >= 500) {
    return `Error ${result.status}: Server error from the API.\n  → This is likely a problem on the API side, not with usepaso.`;
  }

  return `Error ${result.status} ${result.statusText || ''}: ${result.body}`;
}

/**
 * Format a structured error for MCP tool responses.
 * Returns a JSON-serializable object that agents can parse programmatically.
 */
export function formatStructuredError(
  result: ExecutionResult,
  decl: PasoDeclaration,
  authToken?: string,
): StructuredError {
  const url = result.request.url;

  if (result.error) {
    return {
      error: true,
      type: 'network_error',
      status: null,
      message: result.error,
      hint: 'Check your network connection and the service base_url.',
      request_url: url,
    };
  }

  const status = result.status || 0;

  if (status === 401) {
    const hasToken = !!authToken;
    return {
      error: true,
      type: 'auth_failed',
      status,
      message: 'Authentication failed.',
      hint: hasToken
        ? 'USEPASO_AUTH_TOKEN was rejected. Check that it is valid and has the required scopes.'
        : 'USEPASO_AUTH_TOKEN is not set.',
      request_url: url,
    };
  }

  if (status === 403) {
    return {
      error: true,
      type: 'forbidden',
      status,
      message: 'Forbidden. Your token does not have permission for this action.',
      hint: 'Check the required scopes/permissions for this endpoint.',
      request_url: url,
    };
  }

  if (status === 404) {
    return {
      error: true,
      type: 'not_found',
      status,
      message: 'Not found.',
      hint: 'Check that base_url and path are correct in your usepaso.yaml.',
      request_url: url,
    };
  }

  if (status === 429) {
    const se: StructuredError = {
      error: true,
      type: 'rate_limited',
      status,
      message: 'Rate limited.',
      hint: 'Wait and retry.',
      request_url: url,
    };
    if (result.retryAfterSeconds) {
      se.retry_after_seconds = result.retryAfterSeconds;
      se.hint = `Retry after ${result.retryAfterSeconds} seconds.`;
    }
    return se;
  }

  if (status >= 500) {
    return {
      error: true,
      type: 'server_error',
      status,
      message: `Server error (${status}).`,
      hint: 'This is likely a problem on the API side, not with usepaso.',
      request_url: url,
    };
  }

  return {
    error: true,
    type: 'client_error',
    status,
    message: `Error ${status}.`,
    hint: result.body || 'Unexpected error.',
    request_url: url,
  };
}
