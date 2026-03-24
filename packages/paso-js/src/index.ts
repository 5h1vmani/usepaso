export { parseFile, parseString } from './parser';
export { validate } from './validator';
export { generateMcpServer } from './generators/mcp';
export { generateFromOpenApi } from './openapi';
export { buildRequest, executeRequest, formatError } from './executor';
export type { OpenApiResult } from './openapi';
export type {
  PasoDeclaration,
  PasoService,
  PasoAuth,
  PasoCapability,
  PasoInput,
  PasoOutput,
  PasoConstraint,
  PasoPermissions,
  ValidationError,
} from './types';

import { parseFile, parseString } from './parser';
import { validate } from './validator';
import { PasoDeclaration } from './types';

/**
 * Parse a YAML string and validate it. Throws if validation fails.
 * This is the safe entry point for library consumers.
 */
export function parseAndValidate(content: string): PasoDeclaration {
  const decl = parseString(content);
  const errors = validate(decl);
  const realErrors = errors.filter((e) => e.level !== 'warning');
  if (realErrors.length > 0) {
    throw new Error(
      `Validation failed:\n${realErrors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
    );
  }
  return decl;
}

/**
 * Parse a YAML file and validate it. Throws if validation fails.
 * This is the safe entry point for library consumers.
 */
export function parseFileAndValidate(filePath: string): PasoDeclaration {
  const decl = parseFile(filePath);
  const errors = validate(decl);
  const realErrors = errors.filter((e) => e.level !== 'warning');
  if (realErrors.length > 0) {
    throw new Error(
      `Validation failed:\n${realErrors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
    );
  }
  return decl;
}
