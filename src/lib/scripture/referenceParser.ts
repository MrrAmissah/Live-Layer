export function normalizeScriptureReference(reference: string): string {
  return reference.trim().replace(/\s+/g, ' ');
}

export function scriptureCacheKey(providerId: string, translation: string, reference: string): string {
  return `${providerId}:${translation.toLowerCase()}:${normalizeScriptureReference(reference).toLowerCase()}`;
}
