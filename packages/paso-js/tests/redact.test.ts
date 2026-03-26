import { describe, it, expect } from 'vitest';
import { redactUrl } from '../src/utils/redact';

describe('redactUrl', () => {
  it('redacts api_key param', () => {
    expect(redactUrl('https://api.example.com/v1?api_key=sk-1234567890')).toContain('api_key=***');
    expect(redactUrl('https://api.example.com/v1?api_key=sk-1234567890')).not.toContain(
      'sk-1234567890',
    );
  });

  it('redacts token param', () => {
    expect(redactUrl('https://api.example.com/v1?token=abc123')).toContain('token=***');
  });

  it('redacts access_token param', () => {
    expect(redactUrl('https://api.example.com/v1?access_token=xyz')).toContain('access_token=***');
  });

  it('redacts password param', () => {
    expect(redactUrl('https://api.example.com/v1?password=hunter2')).toContain('password=***');
  });

  it('preserves non-sensitive params', () => {
    const url = 'https://api.example.com/v1?status=active&limit=10';
    expect(redactUrl(url)).toBe(url);
  });

  it('redacts only sensitive params when mixed', () => {
    const result = redactUrl('https://api.example.com/v1?status=active&api_key=sk-123&limit=10');
    expect(result).toContain('api_key=***');
    expect(result).toContain('status=active');
    expect(result).toContain('limit=10');
    expect(result).not.toContain('sk-123');
  });

  it('returns URL unchanged if no query params', () => {
    const url = 'https://api.example.com/v1/items';
    expect(redactUrl(url)).toBe(url);
  });

  it('handles invalid URLs gracefully', () => {
    expect(redactUrl('not-a-url')).toBe('not-a-url');
  });

  it('is case-insensitive for param names', () => {
    expect(redactUrl('https://api.example.com?API_KEY=secret')).toContain('***');
  });
});
