/**
 * Strict media URL validation for production timeline assembly & C2PA tools.
 * Blocks hallucinated/placeholder URIs (e.g. gcs://, gcs.pixels.online, pixels-assets)
 * before any headless calls or GCS sidecar writes occur.
 */

const HALLUCINATED_GS_BUCKETS = new Set([
  'pixels-assets',
  'your-bucket',
  'example-bucket',
  'mock-bucket',
]);

function isDisallowedHttpsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'gcs.pixels.online' ||
    host.endsWith('.pixels.online') ||
    host === 'pixels.online' ||
    host === 'fake.local' ||
    host === 'placeholder.local'
  );
}

function validateGsUrl(trimmed: string, fieldName: string): string {
  const withoutScheme = trimmed.slice('gs://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
    throw new Error(
      `Invalid ${fieldName} "${trimmed}": gs:// URI must include both bucket and object path`,
    );
  }
  const bucket = withoutScheme.slice(0, slashIndex).trim();
  const objectPath = withoutScheme.slice(slashIndex + 1).trim();
  if (!bucket || !objectPath) {
    throw new Error(
      `Invalid ${fieldName} "${trimmed}": gs:// URI must include both bucket and object path`,
    );
  }
  if (HALLUCINATED_GS_BUCKETS.has(bucket.toLowerCase())) {
    throw new Error(
      `Invalid ${fieldName} "${trimmed}": placeholder bucket "${bucket}" is not allowed`,
    );
  }
  return trimmed;
}

function validateHttpsUrl(trimmed: string, fieldName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid ${fieldName} "${trimmed}": malformed https URL`);
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new Error(
      `Invalid ${fieldName} "${trimmed}": only valid https:// URLs are allowed`,
    );
  }

  if (isDisallowedHttpsHost(parsed.hostname)) {
    throw new Error(
      `Invalid ${fieldName} "${trimmed}": host "${parsed.hostname}" is a disallowed placeholder domain`,
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'storage.googleapis.com' &&
    parsed.pathname.toLowerCase().startsWith('/pixels-assets/')
  ) {
    throw new Error(
      `Invalid ${fieldName} "${trimmed}": placeholder bucket "pixels-assets" is not allowed`,
    );
  }

  if (
    parsed.pathname.includes('/MOCK_') ||
    parsed.pathname.toLowerCase().includes('mock_cut')
  ) {
    throw new Error(
      `Invalid ${fieldName} "${trimmed}": mock/stub URLs cannot be used in production`,
    );
  }

  return trimmed;
}

/** Validate a single media URL/URI (only real `https://` or `gs://` URLs allowed). */
export function assertValidMediaUrl(rawUrl: string, fieldName: string): string {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed) {
    throw new Error(`Invalid ${fieldName}: URL must be a non-empty string`);
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('gcs://')) {
    throw new Error(
      `Invalid ${fieldName} "${trimmed}": uses unsupported "gcs://" scheme — only real https:// or gs:// URLs returned by tools are allowed`,
    );
  }

  if (lower.startsWith('gs://')) {
    return validateGsUrl(trimmed, fieldName);
  }

  if (lower.startsWith('https://')) {
    return validateHttpsUrl(trimmed, fieldName);
  }

  throw new Error(
    `Invalid ${fieldName} "${trimmed}": unsupported URL scheme — only real https:// or gs:// URLs returned by tools are allowed`,
  );
}

/** Validate an array of media URLs/URIs, returning trimmed strings. */
export function assertValidMediaUrls(urls: string[], fieldName: string): string[] {
  return urls.map((url, index) => assertValidMediaUrl(url, `${fieldName}[${index}]`));
}
