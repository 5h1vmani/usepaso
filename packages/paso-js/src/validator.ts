import { PasoDeclaration, PasoCapability, ValidationError } from './types';

const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const VALID_PERMISSIONS = ['read', 'write', 'admin'];
const VALID_INPUT_TYPES = ['string', 'integer', 'number', 'boolean', 'enum', 'array', 'object'];
const VALID_OUTPUT_TYPES = ['string', 'integer', 'number', 'boolean', 'object', 'array'];
const VALID_AUTH_TYPES = ['api_key', 'bearer', 'oauth2', 'none'];
const VALID_IN_VALUES = ['query', 'path', 'body', 'header'];
const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_URL_LENGTH = 2000;

/**
 * Validate a parsed PasoDeclaration against the spec.
 * Returns an array of errors. Empty array = valid.
 */
export function validate(decl: PasoDeclaration): ValidationError[] {
  const errors: ValidationError[] = [];

  // Version
  if (!decl.version) {
    errors.push({ path: 'version', message: 'version is required' });
  } else if (decl.version !== '1.0') {
    errors.push({ path: 'version', message: 'version must be "1.0"' });
  }

  // Service
  if (!decl.service) {
    errors.push({ path: 'service', message: 'service is required' });
  } else {
    if (!decl.service.name) {
      errors.push({ path: 'service.name', message: 'service.name is required' });
    } else if (decl.service.name.length > MAX_NAME_LENGTH) {
      errors.push({
        path: 'service.name',
        message: `service.name exceeds ${MAX_NAME_LENGTH} characters`,
      });
    }
    if (!decl.service.description) {
      errors.push({ path: 'service.description', message: 'service.description is required' });
    } else if (decl.service.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        path: 'service.description',
        message: `service.description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }
    if (!decl.service.base_url) {
      errors.push({ path: 'service.base_url', message: 'service.base_url is required' });
    } else if (decl.service.base_url.length > MAX_URL_LENGTH) {
      errors.push({
        path: 'service.base_url',
        message: `service.base_url exceeds ${MAX_URL_LENGTH} characters`,
      });
    } else {
      try {
        const parsed = new URL(decl.service.base_url);
        if (parsed.protocol === 'http:') {
          errors.push({
            path: 'service.base_url',
            message: 'base_url uses http://. Consider https:// to protect auth tokens in transit',
            level: 'warning',
          });
        }
        if (isPrivateHost(parsed.hostname)) {
          errors.push({
            path: 'service.base_url',
            message:
              'base_url points to a private/internal address. If this YAML was shared with you, verify the URL before running usepaso serve.',
            level: 'warning',
          });
        }
      } catch {
        errors.push({ path: 'service.base_url', message: 'service.base_url must be a valid URL' });
      }
    }
    if (decl.service.auth) {
      if (!VALID_AUTH_TYPES.includes(decl.service.auth.type)) {
        errors.push({
          path: 'service.auth.type',
          message: `auth.type must be one of: ${VALID_AUTH_TYPES.join(', ')}`,
        });
      }
    }
  }

  // Capabilities
  if (!decl.capabilities) {
    errors.push({ path: 'capabilities', message: 'capabilities is required' });
  } else if (!Array.isArray(decl.capabilities)) {
    errors.push({ path: 'capabilities', message: 'capabilities must be an array' });
  } else {
    if (decl.capabilities.length === 0) {
      errors.push({
        path: 'capabilities',
        message: 'capabilities array is empty. MCP server will have no tools',
        level: 'warning',
      });
    }
    const names = new Set<string>();
    decl.capabilities.forEach((cap, i) => {
      const prefix = `capabilities[${i}]`;
      errors.push(...validateCapability(cap, prefix, names));
    });
  }

  // Permissions
  if (decl.permissions) {
    const capNames = new Set((decl.capabilities || []).map((c) => c.name));
    const allReferenced = new Set<string>();

    for (const tier of ['read', 'write', 'admin', 'forbidden'] as const) {
      const list = decl.permissions[tier];
      if (list && list.length === 0) {
        errors.push({
          path: `permissions.${tier}`,
          message: `empty array. Remove it or add capability names`,
          level: 'warning',
        });
      }
      if (list && list.length > 0) {
        for (const name of list) {
          // forbidden can reference capabilities not declared (to explicitly block API endpoints)
          if (tier !== 'forbidden' && !capNames.has(name)) {
            errors.push({
              path: `permissions.${tier}`,
              message: `references unknown capability "${name}"`,
            });
          }
          if (tier !== 'forbidden' && allReferenced.has(name)) {
            errors.push({
              path: `permissions.${tier}`,
              message: `"${name}" appears in multiple permission tiers`,
            });
          }
          allReferenced.add(name);
        }
      }
    }

    // Check forbidden doesn't overlap with tiers
    if (decl.permissions.forbidden) {
      const tiered = new Set([
        ...(decl.permissions.read || []),
        ...(decl.permissions.write || []),
        ...(decl.permissions.admin || []),
      ]);
      for (const name of decl.permissions.forbidden) {
        if (tiered.has(name)) {
          errors.push({
            path: 'permissions.forbidden',
            message: `"${name}" cannot be both in a permission tier and forbidden`,
          });
        }
      }
    }
  }

  return errors;
}

function validateCapability(
  cap: PasoCapability,
  prefix: string,
  names: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!cap.name) {
    errors.push({ path: `${prefix}.name`, message: 'name is required' });
  } else {
    if (cap.name.length > MAX_NAME_LENGTH) {
      errors.push({
        path: `${prefix}.name`,
        message: `name exceeds ${MAX_NAME_LENGTH} characters`,
      });
    }
    if (!SNAKE_CASE_RE.test(cap.name)) {
      errors.push({ path: `${prefix}.name`, message: `"${cap.name}" must be snake_case` });
    }
    if (names.has(cap.name)) {
      errors.push({ path: `${prefix}.name`, message: `duplicate capability name "${cap.name}"` });
    }
    names.add(cap.name);
  }

  if (!cap.description) {
    errors.push({ path: `${prefix}.description`, message: 'description is required' });
  } else if (cap.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push({
      path: `${prefix}.description`,
      message: `description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
    });
  }

  if (!cap.method) {
    errors.push({ path: `${prefix}.method`, message: 'method is required' });
  } else if (!VALID_METHODS.includes(cap.method)) {
    errors.push({
      path: `${prefix}.method`,
      message: `method must be one of: ${VALID_METHODS.join(', ')}`,
    });
  }

  if (!cap.path) {
    errors.push({ path: `${prefix}.path`, message: 'path is required' });
  } else if (cap.path.length > MAX_URL_LENGTH) {
    errors.push({ path: `${prefix}.path`, message: `path exceeds ${MAX_URL_LENGTH} characters` });
  } else if (!cap.path.startsWith('/')) {
    errors.push({ path: `${prefix}.path`, message: 'path must start with /' });
  }

  if (!cap.permission) {
    errors.push({ path: `${prefix}.permission`, message: 'permission is required' });
  } else if (!VALID_PERMISSIONS.includes(cap.permission)) {
    errors.push({
      path: `${prefix}.permission`,
      message: `permission must be one of: ${VALID_PERMISSIONS.join(', ')}`,
    });
  }

  // Validate inputs
  if (cap.inputs) {
    for (const [inputName, input] of Object.entries(cap.inputs)) {
      const inputPrefix = `${prefix}.inputs.${inputName}`;
      if (!input.type) {
        errors.push({ path: inputPrefix, message: 'type is required' });
      } else if (!VALID_INPUT_TYPES.includes(input.type)) {
        errors.push({
          path: inputPrefix,
          message: `type must be one of: ${VALID_INPUT_TYPES.join(', ')}`,
        });
      }
      if (input.type === 'enum' && (!input.values || input.values.length === 0)) {
        errors.push({ path: inputPrefix, message: 'enum type must have values defined' });
      }
      if (!input.description) {
        errors.push({ path: inputPrefix, message: 'description is required' });
      } else if (input.description.length > MAX_DESCRIPTION_LENGTH) {
        errors.push({
          path: inputPrefix,
          message: `description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
        });
      }
      if (input.in && !VALID_IN_VALUES.includes(input.in)) {
        errors.push({
          path: `${inputPrefix}.in`,
          message: `in must be one of: ${VALID_IN_VALUES.join(', ')}`,
        });
      }
      if (input.in === 'body' && ['GET', 'DELETE'].includes(cap.method)) {
        errors.push({
          path: inputPrefix,
          message: `body parameters are not supported for ${cap.method} requests`,
        });
      }
    }
  }

  // Validate path params exist in inputs
  if (cap.path && cap.inputs) {
    const pathParams = cap.path.match(/\{([^}]+)\}/g);
    if (pathParams) {
      for (const param of pathParams) {
        const paramName = param.slice(1, -1);
        if (!cap.inputs[paramName]) {
          errors.push({
            path: `${prefix}.path`,
            message: `path parameter "{${paramName}}" not found in inputs`,
          });
        } else if (cap.inputs[paramName].in !== 'path') {
          errors.push({
            path: `${prefix}.inputs.${paramName}`,
            message: `path parameter must have in: path`,
          });
        }
      }
    }
  }

  // Validate constraints
  if (cap.constraints) {
    cap.constraints.forEach((c, ci) => {
      if (Object.keys(c).length === 0) {
        errors.push({
          path: `${prefix}.constraints[${ci}]`,
          message: 'empty constraint object. Add at least one field',
          level: 'warning',
        });
      }
    });
  }

  // Validate output
  if (cap.output) {
    for (const [fieldName, output] of Object.entries(cap.output)) {
      if (!output.type) {
        errors.push({ path: `${prefix}.output.${fieldName}`, message: 'type is required' });
      } else if (!VALID_OUTPUT_TYPES.includes(output.type)) {
        errors.push({
          path: `${prefix}.output.${fieldName}`,
          message: `type must be one of: ${VALID_OUTPUT_TYPES.join(', ')}`,
        });
      }
    }
  }

  return errors;
}

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (lower === 'localhost' || lower === '0.0.0.0') return true;

  // IPv6 private ranges
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true; // loopback
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc00:') || lower.startsWith('fd00:')) return true; // unique local

  // IPv4 private ranges (reject leading zeros to block octal bypass like 0177.0.0.1)
  const rawParts = lower.split('.');
  const parts = rawParts.map((p) => (/^(0|[1-9]\d*)$/.test(p) ? parseInt(p, 10) : NaN));
  if (parts.length === 4 && parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 127) return true; // 127.x.x.x loopback
    if (a === 10) return true; // 10.x.x.x private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16-31.x.x private
    if (a === 192 && b === 168) return true; // 192.168.x.x private
    if (a === 169 && b === 254) return true; // 169.254.x.x link-local / AWS metadata
  }

  return false;
}
