/** "1 h 25 min" / "40 min" — for driving durations from lib/tripDistance.ts. */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h${m > 0 ? ` ${m} min` : ""}` : `${m} min`;
}
