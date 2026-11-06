import { describe, expect, it } from 'vitest';
import { isPublicSupabaseKey } from './public-config';

function jwt(role: string) {
  return `${btoa('{}')}.${btoa(JSON.stringify({ role }))}.signature`;
}
describe('public configuration', () => {
  it('prevents privileged keys from reaching the browser client', () => {
    expect(isPublicSupabaseKey('sb_secret_test-only')).toBe(false);
    expect(isPublicSupabaseKey(jwt('service_role'))).toBe(false);
  });
  it('accepts only public keys, rejecting unknown JWT roles and malformed values', () => {
    expect(isPublicSupabaseKey(jwt('anon'))).toBe(true);
    expect(isPublicSupabaseKey('sb_publishable_test-only')).toBe(true);
    expect(isPublicSupabaseKey(jwt('authenticated'))).toBe(false);
    expect(isPublicSupabaseKey('garbage')).toBe(false);
    expect(isPublicSupabaseKey('')).toBe(false);
  });
});
