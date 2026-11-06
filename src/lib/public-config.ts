/** Accept only public browser credentials. Never include the rejected value in an error. */
export function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_publishable_') && key.length > 'sb_publishable_'.length) return true;
  if (key.startsWith('sb_secret_')) return false;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload: unknown = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'role' in payload &&
      payload.role === 'anon'
    );
  } catch {
    return false;
  }
}
