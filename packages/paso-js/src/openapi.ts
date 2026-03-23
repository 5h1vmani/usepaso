import { stringify } from 'yaml';
import type {
  PasoDeclaration,
  PasoService,
  PasoAuth,
  PasoCapability,
  PasoInput,
  PasoOutput,
  PasoPermissions,
} from './types';

// ---------------------------------------------------------------------------
// Internal OpenAPI type stubs (we avoid pulling in a heavy dependency)
// ---------------------------------------------------------------------------

interface OaSchema {
  type?: string;
  enum?: (string | number)[];
  properties?: Record<string, OaSchema>;
  description?: string;
  default?: unknown;
  items?: OaSchema;
}

interface OaParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OaSchema;
  deprecated?: boolean;
}

interface OaMediaType {
  schema?: OaSchema;
}

interface OaRequestBody {
  content?: Record<string, OaMediaType>;
  required?: boolean;
}

interface OaResponse {
  content?: Record<string, OaMediaType>;
  description?: string;
}

interface OaOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OaParameter[];
  requestBody?: OaRequestBody;
  responses?: Record<string, OaResponse>;
  deprecated?: boolean;
  security?: Record<string, string[]>[];
}

interface OaPathItem {
  get?: OaOperation;
  post?: OaOperation;
  put?: OaOperation;
  patch?: OaOperation;
  delete?: OaOperation;
  head?: OaOperation;
  options?: OaOperation;
  trace?: OaOperation;
}

interface OaSecurityScheme {
  type: string;
  scheme?: string;
  name?: string;
  in?: string;
  flows?: unknown;
}

interface OaComponents {
  securitySchemes?: Record<string, OaSecurityScheme>;
}

interface OaInfo {
  title?: string;
  description?: string;
  version?: string;
}

interface OaServer {
  url: string;
}

interface OpenApiSpec {
  info?: OaInfo;
  servers?: OaServer[];
  paths?: Record<string, OaPathItem>;
  components?: OaComponents;
  security?: Record<string, string[]>[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const MAX_CAPABILITIES = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSnakeCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Derive a snake_case capability name from operationId or method+path.
 * Must start with [a-z] — prepend the method if needed.
 */
function deriveName(method: string, path: string, operationId?: string): string {
  if (operationId) {
    const candidate = toSnakeCase(operationId);
    // Ensure it starts with a letter (validator requires /^[a-z][a-z0-9_]*$/)
    if (/^[a-z]/.test(candidate)) {
      return candidate;
    }
    // Prefix with method if it starts with a digit or underscore
    return `${method.toLowerCase()}_${candidate}`.replace(/^_|_$/g, '');
  }

  // Build from method + path segments: POST /orders/{id}/items -> post_orders_id_items
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      // {param} -> param
      if (seg.startsWith('{') && seg.endsWith('}')) {
        return seg.slice(1, -1);
      }
      return seg;
    });

  const parts = [method.toLowerCase(), ...segments];
  return toSnakeCase(parts.join('_'));
}

/**
 * Map an OpenAPI schema type to a PasoInput/Output type.
 */
function mapSchemaType(
  schema?: OaSchema,
): 'string' | 'integer' | 'number' | 'boolean' | 'enum' | 'array' | 'object' {
  if (!schema) return 'string';
  if (schema.enum && schema.enum.length > 0) return 'enum';
  switch (schema.type) {
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

/**
 * Map an OpenAPI schema type to a PasoOutput type (no 'enum').
 */
function mapOutputType(
  schema?: OaSchema,
): 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array' {
  if (!schema) return 'string';
  switch (schema.type) {
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

/**
 * Map an OpenAPI parameter location to a PasoInput `in` value.
 */
function mapParamIn(location: string): 'query' | 'path' | 'body' | 'header' | undefined {
  switch (location) {
    case 'query':
      return 'query';
    case 'path':
      return 'path';
    case 'header':
      return 'header';
    case 'body':
      return 'body';
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Auth detection
// ---------------------------------------------------------------------------

function detectAuth(spec: OpenApiSpec): PasoAuth {
  const schemes = spec.components?.securitySchemes;
  if (!schemes) return { type: 'none' };

  for (const [, scheme] of Object.entries(schemes)) {
    if (!scheme) continue;

    const schemeType = (scheme.type || '').toLowerCase();
    const schemeValue = (scheme.scheme || '').toLowerCase();

    // Bearer / HTTP bearer
    if (schemeType === 'http' && (schemeValue === 'bearer' || schemeValue === 'jwt')) {
      return { type: 'bearer' };
    }

    // apiKey
    if (schemeType === 'apikey') {
      const auth: PasoAuth = { type: 'api_key' };
      if (scheme.in === 'header' && scheme.name) {
        auth.header = scheme.name;
      }
      return auth;
    }

    // oauth2
    if (schemeType === 'oauth2') {
      return { type: 'oauth2' };
    }
  }

  // Check global security array for a scheme name hint
  const globalSecurity = spec.security;
  if (globalSecurity && Array.isArray(globalSecurity)) {
    for (const secReq of globalSecurity) {
      const keys = Object.keys(secReq || {});
      for (const key of keys) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('bearer') || keyLower.includes('jwt')) {
          return { type: 'bearer' };
        }
        if (keyLower.includes('apikey') || keyLower.includes('api_key')) {
          return { type: 'api_key' };
        }
        if (keyLower.includes('oauth')) {
          return { type: 'oauth2' };
        }
      }
    }
  }

  return { type: 'none' };
}

// ---------------------------------------------------------------------------
// Permission tier
// ---------------------------------------------------------------------------

function derivePermission(method: HttpMethod): 'read' | 'write' | 'admin' {
  switch (method) {
    case 'get':
    case 'head':
      return 'read';
    case 'delete':
      return 'admin';
    default:
      return 'write';
  }
}

function requiresConsent(method: HttpMethod): boolean {
  return method === 'delete' || method === 'put' || method === 'patch';
}

// ---------------------------------------------------------------------------
// Inputs extraction
// ---------------------------------------------------------------------------

function buildInputs(
  operation: OaOperation,
  pathStr: string,
): Record<string, PasoInput> | undefined {
  const inputs: Record<string, PasoInput> = {};

  // 1. Parameters (query / path / header)
  const params = operation.parameters || [];
  for (const param of params) {
    if (param.deprecated) continue;
    const location = mapParamIn(param.in);
    // Skip unsupported locations (cookie, etc.)
    if (!location) continue;

    const schema = param.schema;
    const inputType = mapSchemaType(schema);
    const entry: PasoInput = {
      type: inputType,
      required: param.required ?? (param.in === 'path' ? true : false),
      description: param.description || param.name,
      in: location,
    };
    if (inputType === 'enum' && schema?.enum) {
      entry.values = schema.enum;
    }
    if (schema?.default !== undefined) {
      entry.default = schema.default;
    }
    inputs[param.name] = entry;
  }

  // 2. requestBody → flatten top-level properties with in: body
  const requestBody = operation.requestBody;
  if (requestBody?.content) {
    const jsonContent = requestBody.content['application/json'];
    const schema = jsonContent?.schema;
    if (schema?.properties) {
      const required = new Set<string>(
        Array.isArray((schema as Record<string, unknown>)['required'])
          ? ((schema as Record<string, unknown>)['required'] as string[])
          : [],
      );
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const inputType = mapSchemaType(propSchema as OaSchema);
        const entry: PasoInput = {
          type: inputType,
          required: required.has(propName) || (requestBody.required ?? false),
          description: (propSchema as OaSchema).description || propName,
          in: 'body',
        };
        if (inputType === 'enum' && (propSchema as OaSchema).enum) {
          entry.values = (propSchema as OaSchema).enum!;
        }
        if ((propSchema as OaSchema).default !== undefined) {
          entry.default = (propSchema as OaSchema).default;
        }
        // Don't overwrite a path/query param with the same name
        if (!(propName in inputs)) {
          inputs[propName] = entry;
        }
      }
    }
  }

  // 3. Ensure path parameters that appear in the URL are present in inputs
  //    (some specs omit them from the operation.parameters list)
  const pathParamMatches = pathStr.match(/\{([^}]+)\}/g);
  if (pathParamMatches) {
    for (const match of pathParamMatches) {
      const paramName = match.slice(1, -1);
      if (!(paramName in inputs)) {
        inputs[paramName] = {
          type: 'string',
          required: true,
          description: paramName,
          in: 'path',
        };
      } else if (!inputs[paramName].in) {
        inputs[paramName].in = 'path';
      }
    }
  }

  return Object.keys(inputs).length > 0 ? inputs : undefined;
}

// ---------------------------------------------------------------------------
// Output extraction
// ---------------------------------------------------------------------------

function buildOutput(operation: OaOperation): Record<string, PasoOutput> | undefined {
  const responses = operation.responses;
  if (!responses) return undefined;

  // Prefer 200, fall back to 201
  const response = responses['200'] ?? responses['201'];
  if (!response) return undefined;

  const jsonContent = response.content?.['application/json'];
  const schema = jsonContent?.schema;
  if (!schema?.properties) return undefined;

  const output: Record<string, PasoOutput> = {};
  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    output[propName] = {
      type: mapOutputType(propSchema as OaSchema),
      description: (propSchema as OaSchema).description,
    };
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

/**
 * Resolve all $ref pointers in an OpenAPI spec (in-place, recursive).
 * Handles JSON Pointer references like "#/components/schemas/Pet".
 */
function resolveRefs(obj: unknown, root: Record<string, unknown>): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveRefs(item, root));
  }

  const record = obj as Record<string, unknown>;

  // If this object has a $ref, resolve it
  if (typeof record['$ref'] === 'string') {
    const ref = record['$ref'];
    if (ref.startsWith('#/')) {
      const path = ref.slice(2).split('/');
      let target: unknown = root;
      for (const segment of path) {
        if (target && typeof target === 'object') {
          target = (target as Record<string, unknown>)[segment];
        } else {
          return obj; // Unresolvable — return as-is
        }
      }
      // Merge any sibling properties (e.g., description alongside $ref)
      const siblings = Object.keys(record).filter((k) => k !== '$ref');
      if (siblings.length > 0 && typeof target === 'object' && target !== null) {
        const merged = { ...(target as Record<string, unknown>) };
        for (const key of siblings) {
          merged[key] = record[key];
        }
        return resolveRefs(merged, root);
      }
      return resolveRefs(target, root);
    }
    return obj; // External refs — return as-is
  }

  // Recurse into all properties
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    resolved[key] = resolveRefs(value, root);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface OpenApiResult {
  yaml: string;
  serviceName: string;
  authType: string;
  totalOperations: number;
  generatedCount: number;
  readCount: number;
  writeCount: number;
  adminCount: number;
}

export function generateFromOpenApi(openapiSpec: object): OpenApiResult {
  // Resolve all $ref pointers first
  const spec = resolveRefs(openapiSpec, openapiSpec as Record<string, unknown>) as OpenApiSpec;

  // ---- Service ----
  const info = spec.info ?? {};
  const firstServer = spec.servers?.[0];
  let baseUrl = firstServer?.url ?? 'https://api.example.com';
  // Ensure base_url is a full URL (some specs use relative paths)
  if (baseUrl.startsWith('/')) {
    baseUrl = `https://api.example.com${baseUrl}`;
  }

  const auth = detectAuth(spec);

  const service: PasoService = {
    name: info.title ?? 'Unnamed Service',
    description: info.description ?? info.title ?? 'No description provided',
    base_url: baseUrl,
    ...(auth.type !== 'none' ? { auth } : {}),
  };

  // ---- Count total operations ----
  const paths = spec.paths ?? {};
  let totalOperations = 0;
  for (const pathItem of Object.values(paths)) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method] as OaOperation | undefined;
      if (op && !op.deprecated) totalOperations++;
    }
  }

  // ---- Capabilities ----
  const capabilities: PasoCapability[] = [];
  const seenNames = new Set<string>();

  outer: for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      if (capabilities.length >= MAX_CAPABILITIES) break outer;

      const operation = (pathItem as Record<string, unknown>)[method] as OaOperation | undefined;
      if (!operation) continue;

      // Skip deprecated operations
      if (operation.deprecated) continue;

      // Skip HEAD (no meaningful capability) — but keep in permission logic
      // Actually the spec says HEAD → read permission so we do include it.
      // However HEAD rarely appears in OpenAPI — we'll keep it for completeness.

      const rawName = deriveName(method, pathStr, operation.operationId);

      // Deduplicate names by appending a counter
      let name = rawName;
      let counter = 1;
      while (seenNames.has(name)) {
        name = `${rawName}_${counter}`;
        counter++;
      }
      seenNames.add(name);

      const summaryOrDesc = operation.summary || operation.description || '';
      const description = summaryOrDesc.slice(0, 200) || `${method.toUpperCase()} ${pathStr}`;

      const permission = derivePermission(method);
      const consent = requiresConsent(method);

      const inputs = buildInputs(operation, pathStr);
      const output = buildOutput(operation);

      const cap: PasoCapability = {
        name,
        description,
        method: method.toUpperCase() as PasoCapability['method'],
        path: pathStr,
        permission,
        ...(consent ? { consent_required: true } : {}),
        ...(inputs ? { inputs } : {}),
        ...(output ? { output } : {}),
      };

      capabilities.push(cap);
    }
  }

  // ---- Permissions ----
  const permRead: string[] = [];
  const permWrite: string[] = [];
  const permAdmin: string[] = [];

  for (const cap of capabilities) {
    if (cap.permission === 'read') permRead.push(cap.name);
    else if (cap.permission === 'write') permWrite.push(cap.name);
    else permAdmin.push(cap.name);
  }

  const permissions: PasoPermissions = {
    ...(permRead.length > 0 ? { read: permRead } : {}),
    ...(permWrite.length > 0 ? { write: permWrite } : {}),
    ...(permAdmin.length > 0 ? { admin: permAdmin } : {}),
  };

  // ---- Assemble declaration ----
  const declaration: PasoDeclaration = {
    version: '1.0',
    service,
    capabilities,
    ...(Object.keys(permissions).length > 0 ? { permissions } : {}),
  };

  return {
    yaml: stringify(declaration, { lineWidth: 0 }),
    serviceName: service.name,
    authType: auth.type,
    totalOperations,
    generatedCount: capabilities.length,
    readCount: permRead.length,
    writeCount: permWrite.length,
    adminCount: permAdmin.length,
  };
}
