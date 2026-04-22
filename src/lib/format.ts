export function formatBytes(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'N/A';
  if (value < 1024) return `${value} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let current = value / 1024;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '0m';

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${totalMinutes}m`;
  if (hours < 24) return `${hours}h ${minutes}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatRelativeTime(
  timestamp: number | null | undefined,
  locale = 'en'
): string {
  if (timestamp == null) return 'Unknown';

  const delta = timestamp - Date.now();
  const abs = Math.abs(delta);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (abs < 60_000) return rtf.format(Math.round(delta / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(delta / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(delta / 3_600_000), 'hour');
  return rtf.format(Math.round(delta / 86_400_000), 'day');
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
