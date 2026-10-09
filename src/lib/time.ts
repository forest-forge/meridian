export const HOME_TZ = "Europe/London";
export const DAY_MS = 86_400_000;

export type Ymd = { year: number; month: number; day: number };

export type ZonedParts = Ymd & { hour: number; minute: number; second: number };

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function partsInZone(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** Hours ahead of UK time at `date`, such as +1, +5:30, or −5. */
export function ukOffsetLabel(timeZone: string, date: Date): string {
  const diff = offsetMinutes(timeZone, date) - offsetMinutes(HOME_TZ, date);
  const sign = diff < 0 ? "−" : "+";
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return mins === 0 ? `${sign}${hours}` : `${sign}${hours}:${pad(mins)}`;
}
export function offsetMinutes(timeZone: string, date: Date): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const off = offsetMinutes(timeZone, new Date(utc));
    const got = utc + off * 60_000;
    const want = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = want - got;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

export function addDays(year: number, month: number, day: number, delta: number): Ymd {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export function dayKeyFromParts(p: Ymd): string {
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function dayKeyInZone(date: Date, timeZone: string): string {
  return dayKeyFromParts(partsInZone(date, timeZone));
}

export function formatDayKey(day: string): string {
  const [year, month, d] = day.split("-").map(Number);
  if (!year || !month || !d) return day;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, d)));
}

export function shiftDayKey(day: string, delta: number): string {
  const [year, month, d] = day.split("-").map(Number);
  return dayKeyFromParts(addDays(year, month, d, delta));
}

export function formatHm(date: Date, timeZone: string): string {
  const p = partsInZone(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatOffsetClock(date: Date, offsetMinutesValue: number): string {
  const wall = new Date(date.getTime() + offsetMinutesValue * 60_000);
  return `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

export function offsetLabel(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `GMT${sign}${h}` : `GMT${sign}${h}:${pad(m)}`;
}

export function aheadLabel(activeOffset: number, homeOffset: number): string {
  const diff = activeOffset - homeOffset;
  if (diff === 0) return "Same time as the UK";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const hm = m === 0 ? `${h} hour${h === 1 ? "" : "s"}` : `${h} h ${m} min`;
  return diff > 0 ? `${hm} ahead of the UK` : `${hm} behind the UK`;
}

export function formatWhen(date: Date, timeZone: string, withWeekday = false): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: withWeekday ? "long" : undefined,
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatShortWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function zoneAbbrev(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

export function cityFromZone(timeZone: string): string {
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replace(/_/g, " ");
}

export function formatWallInput(timeZone: string, date: Date): string {
  const p = partsInZone(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

export function parseWall(
  value: string,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const match = WALL.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

export function wallToUtc(timeZone: string, wall: string): Date | null {
  const p = parseWall(wall);
  if (!p || !isTimeZone(timeZone)) return null;
  return zonedTimeToUtc(timeZone, p.year, p.month, p.day, p.hour, p.minute);
}

export function localDayBounds(dayKey: string, timeZone: string): { start: Date; end: Date } | null {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day || !isTimeZone(timeZone)) return null;
  const start = zonedTimeToUtc(timeZone, year, month, day, 0, 0);
  const next = addDays(year, month, day, 1);
  const end = zonedTimeToUtc(timeZone, next.year, next.month, next.day, 0, 0);
  return { start, end };
}

export function allTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      return intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }
  return [];
}

export function countdown(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return ms >= 0 ? "Due now" : "Just due";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const body = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
  return ms >= 0 ? `in ${body}` : `${body} overdue`;
}

export function durationWords(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} h ${m} min`;
}
