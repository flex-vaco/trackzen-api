/**
 * Get the Monday of the week containing the given date (UTC).
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d;
}

/**
 * Get the Sunday of the week containing the given date (UTC).
 */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Check if a date is in the past (before today, UTC).
 */
export function isInPast(date: Date): boolean {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d < today;
}

/**
 * Count business days between two dates (inclusive),
 * excluding weekends and holidays.
 */
export function countBusinessDays(
  startDate: Date,
  endDate: Date,
  holidayDates: Date[] = []
): number {
  let count = 0;
  const current = new Date(startDate);
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);

  const holidaySet = new Set(
    holidayDates.map((d) => {
      const hd = new Date(d);
      hd.setUTCHours(0, 0, 0, 0);
      return hd.getTime();
    })
  );

  while (current <= end) {
    const dayOfWeek = current.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(current.getTime())) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

/**
 * Format a date range as a readable string.
 */
export function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}
