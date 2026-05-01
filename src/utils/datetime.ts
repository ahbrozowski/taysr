import { DateTime } from 'luxon';
import { ServerConfig } from '../models';

/**
 * Parses "YYYY-MM-DD HH:mm" interpreted in the given IANA timezone.
 * Returns a UTC Date, or null if the input is malformed, the timezone is
 * invalid, or the resulting instant is in the past.
 */
export function parseDateTimeInZone(input: string, timezone: string): Date | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const dt = DateTime.fromObject(
    {
      year: parseInt(yearStr, 10),
      month: parseInt(monthStr, 10),
      day: parseInt(dayStr, 10),
      hour: parseInt(hourStr, 10),
      minute: parseInt(minuteStr, 10),
    },
    { zone: timezone },
  );

  if (!dt.isValid) return null;
  if (dt.toMillis() < Date.now()) return null;

  return dt.toJSDate();
}

/**
 * Formats a UTC Date back into "YYYY-MM-DD HH:mm" in the given IANA timezone.
 * Used to pre-fill edit modals so the user sees the same wall-clock time they
 * originally entered.
 */
export function formatDateTimeInZone(date: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(date).setZone(timezone);
  if (!dt.isValid) {
    return DateTime.fromJSDate(date).setZone('UTC').toFormat('yyyy-LL-dd HH:mm');
  }
  return dt.toFormat('yyyy-LL-dd HH:mm');
}

/**
 * Resolves the configured timezone for a guild, falling back to UTC.
 */
export async function getGuildTimezone(guildId: string): Promise<string> {
  const config = await ServerConfig.findOne({ guildId }).lean();
  return config?.timezone || 'UTC';
}
