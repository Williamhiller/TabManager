import type { TabGroupColor } from './contracts';

/**
 * Extract hostname from a URL string.
 * Returns an empty string if URL parsing fails to avoid false matches.
 */
export function normalizeHostname(url: string): string {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

/**
 * Normalize a website pattern for matching.
 * Strips protocol, www prefix, and path.
 */
export function normalizeWebsitePattern(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

/**
 * Wrap a promise with a timeout.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * All available tab group colors.
 */
export const allGroupColors: TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange'
];

/**
 * Permissions required for redirect tracking.
 */
export const redirectTrackingPermissions: chrome.permissions.Permissions = {
  permissions: ['webNavigation', 'webRequest'],
  origins: ['http://*/*', 'https://*/*']
};
