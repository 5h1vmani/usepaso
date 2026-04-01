import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { PasoDeclaration } from './types';

/**
 * Parse a usepaso.yaml file from disk and return the raw declaration object.
 * Does NOT validate — call validate() separately.
 */
export function parseFile(filePath: string): PasoDeclaration {
  const content = readFileSync(filePath, 'utf-8');
  return parseString(content);
}

/**
 * Parse a YAML string into a PasoDeclaration.
 */
export function parseString(content: string): PasoDeclaration {
  const parsed = parseYaml(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid YAML: expected an object');
  }

  // Structural guards for clear error messages before validate() runs
  if (!parsed.service || typeof parsed.service !== 'object' || Array.isArray(parsed.service)) {
    throw new Error('Invalid declaration: "service" must be an object');
  }
  if (parsed.capabilities !== undefined && !Array.isArray(parsed.capabilities)) {
    throw new Error('Invalid declaration: "capabilities" must be an array');
  }
  if (
    parsed.service.auth !== undefined &&
    (typeof parsed.service.auth !== 'object' || Array.isArray(parsed.service.auth))
  ) {
    throw new Error(
      'Invalid declaration: "service.auth" must be an object (e.g. { type: "bearer" })',
    );
  }
  if (
    parsed.permissions !== undefined &&
    (typeof parsed.permissions !== 'object' || Array.isArray(parsed.permissions))
  ) {
    throw new Error('Invalid declaration: "permissions" must be an object');
  }

  return parsed as PasoDeclaration;
}
