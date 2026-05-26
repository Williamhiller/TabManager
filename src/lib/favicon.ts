export function buildFaviconFallbackUrl(
  url: string,
  runtime: Pick<typeof chrome.runtime, 'getURL' | 'id'> = chrome.runtime
): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  try {
    const parsedUrl = new URL(trimmedUrl);
    if (parsedUrl.protocol === 'chrome-extension:' && parsedUrl.hostname === runtime.id) {
      return runtime.getURL('icons/icon-32.png');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    const encodedPageUrl = encodeURIComponent(parsedUrl.href);
    return runtime.getURL(`_favicon/?pageUrl=${encodedPageUrl}&size=32`);
  } catch {
    return null;
  }
}

export function resolveFavIconUrl(
  favIconUrl: string | null | undefined,
  url: string,
  preservedFallback: string | null = null,
  runtime: Pick<typeof chrome.runtime, 'getURL' | 'id'> = chrome.runtime
): string | null {
  const normalizedFavIconUrl = favIconUrl?.trim();
  if (normalizedFavIconUrl) return normalizedFavIconUrl;

  return buildFaviconFallbackUrl(url, runtime) ?? preservedFallback;
}
