import { describe, it, expect } from 'vitest';
import { coerceValue } from '../src/commands/test';

describe('coerceValue', () => {
  describe('integer', () => {
    it('parses valid integers', () => {
      expect(coerceValue('42', 'integer', 'x')).toBe(42);
      expect(coerceValue('-7', 'integer', 'x')).toBe(-7);
      expect(coerceValue('0', 'integer', 'x')).toBe(0);
    });

    it('rejects Infinity', () => {
      expect(() => coerceValue('Infinity', 'integer', 'x')).toThrow('must be an integer');
    });

    it('rejects NaN', () => {
      expect(() => coerceValue('NaN', 'integer', 'x')).toThrow('must be an integer');
    });

    it('rejects hex', () => {
      expect(() => coerceValue('0xFF', 'integer', 'x')).toThrow('must be an integer');
    });

    it('rejects scientific notation', () => {
      expect(() => coerceValue('1e10', 'integer', 'x')).toThrow('must be an integer');
    });

    it('rejects floats', () => {
      expect(() => coerceValue('3.14', 'integer', 'x')).toThrow('must be an integer');
    });
  });

  describe('number', () => {
    it('parses valid numbers', () => {
      expect(coerceValue('3.14', 'number', 'x')).toBeCloseTo(3.14);
      expect(coerceValue('-2.5', 'number', 'x')).toBeCloseTo(-2.5);
      expect(coerceValue('42', 'number', 'x')).toBe(42);
    });

    it('rejects Infinity', () => {
      expect(() => coerceValue('Infinity', 'number', 'x')).toThrow('must be a number');
    });

    it('rejects NaN', () => {
      expect(() => coerceValue('NaN', 'number', 'x')).toThrow('must be a number');
    });
  });

  describe('boolean', () => {
    it('parses true/false', () => {
      expect(coerceValue('true', 'boolean', 'x')).toBe(true);
      expect(coerceValue('false', 'boolean', 'x')).toBe(false);
    });

    it('rejects other values', () => {
      expect(() => coerceValue('yes', 'boolean', 'x')).toThrow('must be true or false');
      expect(() => coerceValue('1', 'boolean', 'x')).toThrow('must be true or false');
    });
  });

  describe('string/enum', () => {
    it('returns raw string', () => {
      expect(coerceValue('hello', 'string', 'x')).toBe('hello');
      expect(coerceValue('active', 'enum', 'x')).toBe('active');
      expect(coerceValue('42', 'string', 'x')).toBe('42');
    });
  });
});
