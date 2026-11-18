/** Зсув таймзони (хв) для моменту `at`. Через Intl, без залежностей. */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Локальний час у таймзоні → UTC Date. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let off = tzOffsetMinutes(tz, new Date(guess));
  let res = guess - off * 60_000;
  const off2 = tzOffsetMinutes(tz, new Date(res));
  if (off2 !== off) res = guess - off2 * 60_000; // перехід на літній/зимовий час
  return new Date(res);
}

/** Календарні компоненти дати в таймзоні. weekday: 1=Пн … 7=Нд */
export function zonedParts(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(at);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(g("weekday")) + 1;
  return { y: +g("year"), m: +g("month"), d: +g("day"), hh: +g("hour"), mm: +g("minute"), weekday: wd };
}
