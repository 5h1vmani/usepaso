const INTEGER_RE = /^-?\d+$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function coerceValue(raw: string, type: string, key: string): unknown {
  switch (type) {
    case 'integer': {
      if (!INTEGER_RE.test(raw)) {
        throw new Error(`Parameter "${key}" must be an integer, got "${raw}"`);
      }
      return parseInt(raw, 10);
    }
    case 'number': {
      if (!NUMBER_RE.test(raw)) {
        throw new Error(`Parameter "${key}" must be a number, got "${raw}"`);
      }
      return parseFloat(raw);
    }
    case 'boolean':
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new Error(`Parameter "${key}" must be true or false, got "${raw}"`);
    case 'string':
    case 'enum':
      return raw;
    default:
      return raw;
  }
}
