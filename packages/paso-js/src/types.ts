export interface PasoDeclaration {
  version: string;
  service: PasoService;
  capabilities: PasoCapability[];
  permissions?: PasoPermissions;
}

export interface PasoService {
  name: string;
  description: string;
  base_url: string;
  version?: string;
  auth?: PasoAuth;
}

export interface PasoAuth {
  type: 'api_key' | 'bearer' | 'oauth2' | 'none';
  header?: string;
  prefix?: string;
}

export interface PasoCapability {
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  permission: 'read' | 'write' | 'admin';
  consent_required?: boolean;
  inputs?: Record<string, PasoInput>;
  output?: Record<string, PasoOutput>;
  constraints?: PasoConstraint[];
}

export interface PasoInput {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'enum' | 'array' | 'object';
  required?: boolean;
  description: string;
  values?: (string | number)[];
  default?: unknown;
  in?: 'query' | 'path' | 'body' | 'header';
}

export interface PasoOutput {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
}

export interface PasoConstraint {
  max_per_hour?: number;
  max_per_request?: number;
  max_value?: number;
  allowed_values?: unknown[];
  requires_field?: string;
  description?: string;
}

export interface PasoPermissions {
  read?: string[];
  write?: string[];
  admin?: string[];
  forbidden?: string[];
}

export interface ValidationError {
  path: string;
  message: string;
}
