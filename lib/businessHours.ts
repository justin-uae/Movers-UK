/**
 * Business-hours math for the AI Auto-Quote SLA (lib/aiAutoQuote.ts) — Monday
 * through Saturday count, Sunday doesn't. A lead created Saturday evening
 * with a 24-hour SLA breaches Monday evening, not Sunday, because Sunday's
 * 24 hours never accumulate toward the total. All-UTC by design — DST-free
 * and matches the timestamptz columns it reads.
 */

const OFF_DAY_UTC = 0; // Sunday

function isBusinessDayUtc(date: Date): boolean {
  return date.getUTCDay() !== OFF_DAY_UTC;
}

/** Hours between `from` and `to` that fall on a business day, walking one calendar day at a time. Returns 0 if `to` is not after `from`. */
export function businessHoursElapsed(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;

  let total = 0;
  let cursor = from;
  while (cursor.getTime() < to.getTime()) {
    const nextMidnightUtc = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1, 0, 0, 0, 0),
    );
    const segmentEnd = nextMidnightUtc.getTime() < to.getTime() ? nextMidnightUtc : to;
    if (isBusinessDayUtc(cursor)) {
      total += (segmentEnd.getTime() - cursor.getTime()) / 3_600_000;
    }
    cursor = segmentEnd;
  }
  return total;
}
