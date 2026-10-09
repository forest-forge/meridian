import {
  DAY_MS,
  HOME_TZ,
  cityFromZone,
  dayKeyInZone,
  formatHm,
  isTimeZone,
  localDayBounds,
  offsetMinutes,
  partsInZone,
  shiftDayKey,
  wallToUtc,
  zonedTimeToUtc,
} from "./time.ts";

export const MAX_TRIP_DAYS = 92;
export const OVERDUE_GRACE_MS = 6 * 60 * 60 * 1000;

export type FoodRule = "with-food" | "empty" | "either";
export type WaterRule = "full" | "sip" | "none" | "either";
export type ClockMode = "uk" | "local" | "ease";

export type Medicine = {
  id: string;
  name: string;
  dose: string;
  times: string[];
  food: FoodRule;
  water: WaterRule;
  notes: string;
  mode: ClockMode;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  holdTime?: boolean;
  tablets?: number | null;
};

export type Leg = {
  id: string;
  place: string;
  timeZone: string;
  arrive: string;
  depart: string;
};

export type ZoneChoice =
  | { source: "phone" }
  | { source: "journey" }
  | { source: "locked"; timeZone: string };

export type BodyClock = {
  offsetMinutes: number;
  asOf: string;
};

export type LogStatus = "taken" | "skipped" | "snoozed";

export type LogEntry = {
  key: string;
  medicineId: string;
  medicineName: string;
  scheduledAt: string;
  status: LogStatus;
  actedAt: string;
  snoozeUntil?: string;
};

export type DoseState =
  | "later"
  | "upcoming"
  | "due"
  | "overdue"
  | "taken"
  | "skipped"
  | "snoozed"
  | "missed";

export type DoseView = {
  key: string;
  medicineId: string;
  name: string;
  dose: string;
  food: FoodRule;
  water: WaterRule;
  notes: string;
  mode: ClockMode;
  hhmm: string;
  scheduledAt: string;
  localLabel: string;
  ukLabel: string;
  movedFrom: string | null;
  gapHours: number | null;
  state: DoseState;
  snoozeUntil: string | null;
};

export type TargetFn = (instant: Date) => number;

const HHMM = /^(\d{1,2}):(\d{2})$/;

export function parseHhmm(value: string): { hour: number; minute: number } | null {
  const match = HHMM.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function normaliseHhmm(value: string): string | null {
  const p = parseHhmm(value);
  if (!p) return null;
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function legRange(leg: Leg): { start: number; end: number } | null {
  const start = wallToUtc(leg.timeZone, leg.arrive);
  const end = wallToUtc(leg.timeZone, leg.depart);
  if (!start || !end) return null;
  return { start: start.getTime(), end: end.getTime() };
}

export function legAt(legs: Leg[], instant: Date): Leg | null {
  const t = instant.getTime();
  let found: Leg | null = null;
  for (const leg of legs) {
    const range = legRange(leg);
    if (!range) continue;
    if (t >= range.start && t < range.end) found = leg;
  }
  return found;
}

export function zoneForInstant(
  legs: Leg[],
  instant: Date,
  choice: ZoneChoice,
  phoneTz: string,
): string {
  if (choice.source === "locked" && choice.timeZone) return choice.timeZone;
  if (choice.source === "phone") return phoneTz || "UTC";
  const leg = legAt(legs, instant);
  if (leg) return leg.timeZone;
  if (legs.length === 0) return phoneTz || HOME_TZ;
  const bounds = tripBounds(legs);
  if (!bounds) return phoneTz || HOME_TZ;
  if (instant.getTime() < bounds.start || instant.getTime() >= bounds.end) return HOME_TZ;
  const previous = legs
    .map((item) => ({ item, range: legRange(item) }))
    .filter((row): row is { item: Leg; range: { start: number; end: number } } => row.range !== null)
    .filter((row) => row.range.end <= instant.getTime())
    .sort((a, b) => b.range.end - a.range.end)[0];
  return previous?.item.timeZone ?? phoneTz ?? HOME_TZ;
}

export function stopZoneForDay(dayKey: string, legs: Leg[]): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return HOME_TZ;
  let zone = HOME_TZ;
  for (const leg of sortedLegs(legs)) {
    if (!isTimeZone(leg.timeZone)) continue;
    const noon = zonedTimeToUtc(leg.timeZone, year, month, day, 12, 0);
    const range = legRange(leg);
    if (range && noon.getTime() >= range.start && noon.getTime() < range.end) {
      zone = leg.timeZone;
      continue;
    }
    // An evening arrival is still that stop, even though noon was before landing.
    if (leg.arrive.slice(0, 10) === dayKey) zone = leg.timeZone;
  }
  return zone;
}

/** Dose zone for a calendar day. A locked zone is kept. The phone is never used. */
export function scheduleZoneForDay(dayKey: string, legs: Leg[], choice: ZoneChoice): string {
  if (choice.source === "locked" && choice.timeZone && isTimeZone(choice.timeZone)) return choice.timeZone;
  return stopZoneForDay(dayKey, legs);
}

export function zoneForDayKey(
  dayKey: string,
  legs: Leg[],
  choice: ZoneChoice,
  _phoneTz: string,
): string {
  return scheduleZoneForDay(dayKey, legs, choice);
}

export function tripBounds(legs: Leg[]): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const leg of legs) {
    const range = legRange(leg);
    if (!range) continue;
    start = Math.min(start, range.start);
    end = Math.max(end, range.end);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

export function holidayError(start: string | null, end: string | null): string | null {
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return "Check the start date.";
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) return "Check the finish date.";
  if (start && end && end < start) return "The finish has to be on or after the start.";
  if (start && end && calendarDayDiff(start, end) > MAX_TRIP_DAYS) return "Meridian plans holidays up to 3 months.";
  return null;
}

export function holidayLength(start: string, end: string): number {
  return calendarDayDiff(start, end) + 1;
}

/** Inclusive calendar days, so 2 Nov–16 Nov is 15 even when the clocks are not exactly 14×24h. */
export function stopLengthDays(leg: Leg): number {
  const arriveDay = leg.arrive.slice(0, 10);
  const departDay = leg.depart.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arriveDay) || !/^\d{4}-\d{2}-\d{2}$/.test(departDay) || departDay < arriveDay) return 0;
  return holidayLength(arriveDay, departDay);
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Moving either holiday date slides the whole trip by that many days.
 * 2–16 Nov edited to 2 Aug becomes 2–16 Aug, and every stop moves with it.
 */
export function slideHoliday(
  oldStart: string | null,
  oldEnd: string | null,
  newStart: string | null,
  newEnd: string | null,
): { start: string | null; end: string | null; delta: number } {
  if (!oldStart || !oldEnd || !newStart || !newEnd) return { start: newStart, end: newEnd, delta: 0 };
  if (!DAY_KEY.test(oldStart) || !DAY_KEY.test(oldEnd) || !DAY_KEY.test(newStart) || !DAY_KEY.test(newEnd)) {
    return { start: newStart, end: newEnd, delta: 0 };
  }
  const startDelta = calendarDayDiff(oldStart, newStart);
  const endDelta = calendarDayDiff(oldEnd, newEnd);
  const delta = startDelta === endDelta ? startDelta : endDelta === 0 ? startDelta : startDelta === 0 ? endDelta : startDelta;
  if (delta === 0) return { start: oldStart, end: oldEnd, delta: 0 };
  return { start: shiftDayKey(oldStart, delta), end: shiftDayKey(oldEnd, delta), delta };
}

export function shiftLegs(legs: Leg[], delta: number): Leg[] {
  if (delta === 0) return legs;
  return legs.map((leg) => ({
    ...leg,
    arrive: shiftDayKey(leg.arrive.slice(0, 10), delta) + leg.arrive.slice(10),
    depart: shiftDayKey(leg.depart.slice(0, 10), delta) + leg.depart.slice(10),
  }));
}

function calendarDayDiff(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / DAY_MS);
}

export function tripSpanDays(legs: Leg[]): number {
  const bounds = tripBounds(legs);
  if (!bounds) return 0;
  return Math.round((bounds.end - bounds.start) / DAY_MS);
}

export function legsOverlap(legs: Leg[]): boolean {
  const ranges = legs
    .map((leg) => legRange(leg))
    .filter((range): range is { start: number; end: number } => range !== null)
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) return true;
  }
  return false;
}

export function validateLegs(legs: Leg[]): string | null {
  for (const leg of legs) {
    if (!leg.place.trim()) return "Name each stop.";
    if (!leg.timeZone) return "Choose a time zone for each stop.";
    const range = legRange(leg);
    if (!range) return `Check the dates for ${leg.place || "a stop"}.`;
    if (range.end <= range.start) return `${leg.place}: leave after you arrive.`;
  }
  if (legsOverlap(legs)) return "Stops overlap. End one when the next begins.";
  if (tripSpanDays(legs) > MAX_TRIP_DAYS) return "Meridian plans holidays up to 3 months.";
  return null;
}

export function placeLabel(legs: Leg[], zone: string, instant: Date): string {
  const leg = legAt(legs, instant);
  if (leg && leg.timeZone === zone) return leg.place;
  if (zone === HOME_TZ) return "United Kingdom";
  return cityFromZone(zone);
}

export function doseState(
  scheduled: Date,
  now: Date,
  leadMinutes: number,
  log?: LogEntry,
): DoseState {
  if (log?.status === "taken") return "taken";
  if (log?.status === "skipped") return "skipped";
  if (log?.status === "snoozed" && log.snoozeUntil) {
    const until = new Date(log.snoozeUntil).getTime();
    if (now.getTime() < until) return "snoozed";
    if (now.getTime() < until + 30 * 60_000) return "due";
  }
  const t = scheduled.getTime();
  const n = now.getTime();
  if (n < t - leadMinutes * 60_000) return "later";
  if (n < t) return "upcoming";
  if (n < t + 15 * 60_000) return "due";
  if (n < t + OVERDUE_GRACE_MS) return "overdue";
  return "missed";
}

type Slot = {
  medicine: Medicine;
  hhmm: string;
  at: Date;
  movedFrom: string | null;
};

function inCourse(medicine: Medicine, dayKey: string): boolean {
  if (medicine.startDate && dayKey < medicine.startDate) return false;
  if (medicine.endDate && dayKey > medicine.endDate) return false;
  return true;
}

function onHoliday(dayKey: string, holidayStart: string | null, holidayEnd: string | null): boolean {
  return Boolean(holidayStart && holidayEnd && holidayError(holidayStart, holidayEnd) === null && dayKey >= holidayStart && dayKey <= holidayEnd);
}

/** A dose is due only on a holiday day, and not before the kit was saved. */
export function doseDueOn(
  dayKey: string,
  holidayStart: string | null,
  holidayEnd: string | null,
  kitSavedDay: string | null = null,
): boolean {
  if (!onHoliday(dayKey, holidayStart, holidayEnd)) return false;
  if (kitSavedDay && dayKey < kitSavedDay) return false;
  return true;
}

function slotsForDay(
  medicines: Medicine[],
  dayKey: string,
  zoneForDay: (dayKey: string) => string,
  shiftMinutesPerDay: number,
  holidayStart: string | null,
  holidayEnd: string | null,
): Slot[] {
  const zone = zoneForDay(dayKey);
  const out: Slot[] = [];

  for (const medicine of medicines) {
    if (!medicine.active || !inCourse(medicine, dayKey)) continue;
    for (const raw of medicine.times) {
      const hhmm = normaliseHhmm(raw);
      const parsed = hhmm ? parseHhmm(hhmm) : null;
      if (!hhmm || !parsed) continue;
      const instants = instantsFor(
        medicine.mode,
        parsed.hour,
        parsed.minute,
        dayKey,
        zone,
        shiftMinutesPerDay,
        holidayStart,
        holidayEnd,
        zoneForDay,
      );
      for (const at of instants) {
        const woken = medicine.holdTime ? { at, movedFrom: null } : wakeAdjusted(at, zone);
        out.push({ medicine, hhmm, at: woken.at, movedFrom: woken.movedFrom });
      }
    }
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out;
}

function ukInstants(hour: number, minute: number, dayKey: string, zone: string): Date[] {
  const bounds = localDayBounds(dayKey, zone);
  if (!bounds) return [];
  const [year, month, day] = dayKeyInZone(bounds.start, HOME_TZ).split("-").map(Number);
  const found: Date[] = [];
  for (const delta of [-1, 0, 1, 2]) {
    const date = new Date(Date.UTC(year, month - 1, day + delta));
    const at = zonedTimeToUtc(HOME_TZ, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute);
    if (at >= bounds.start && at < bounds.end) found.push(at);
  }
  return found;
}

function easeBody(
  dayKey: string,
  hour: number,
  minute: number,
  holidayStart: string,
  step: number,
  zoneForDay: (dayKey: string) => string,
): number {
  const ukInstant = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return zonedTimeToUtc(HOME_TZ, year, month, day, hour, minute);
  };
  let body = offsetMinutes(HOME_TZ, ukInstant(shiftDayKey(holidayStart, -1)));
  // The leave day stays on UK time. The first step is the day after departure.
  for (let cursor = shiftDayKey(holidayStart, 1); cursor <= dayKey; cursor = shiftDayKey(cursor, 1)) {
    const [year, month, day] = cursor.split("-").map(Number);
    const zone = zoneForDay(cursor) || HOME_TZ;
    const target = offsetMinutes(zone, zonedTimeToUtc(zone, year, month, day, hour, minute));
    const diff = target - body;
    const move = Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    body += move;
  }
  return body;
}

function easeInstant(
  dayKey: string,
  hour: number,
  minute: number,
  holidayStart: string,
  step: number,
  zoneForDay: (dayKey: string) => string,
): Date {
  const body = easeBody(dayKey, hour, minute, holidayStart, step, zoneForDay);
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - body * 60_000);
}

function instantsFor(
  mode: ClockMode,
  hour: number,
  minute: number,
  dayKey: string,
  zone: string,
  shiftMinutesPerDay: number,
  holidayStart: string | null,
  holidayEnd: string | null,
  zoneForDay: (dayKey: string) => string,
): Date[] {
  const away = onHoliday(dayKey, holidayStart, holidayEnd);
  if (!away || mode === "uk") return ukInstants(hour, minute, dayKey, zone);
  if (mode === "local") {
    const [year, month, day] = dayKey.split("-").map(Number);
    return [zonedTimeToUtc(zone, year, month, day, hour, minute)];
  }
  return [easeInstant(dayKey, hour, minute, holidayStart!, Math.max(1, shiftMinutesPerDay), zoneForDay)];
}

function wakeAdjusted(at: Date, zone: string): { at: Date; movedFrom: string | null } {
  const parts = partsInZone(at, zone);
  if (parts.hour >= 6) return { at, movedFrom: null };
  return {
    at: zonedTimeToUtc(zone, parts.year, parts.month, parts.day, 6, 0),
    movedFrom: formatHm(at, zone),
  };
}

function decorate(
  slots: Slot[],
  previous: Slot[],
  labelZone: string,
  now: Date,
  leadMinutes: number,
  logs: Map<string, LogEntry>,
): DoseView[] {
  return slots.map((slot) => {
    const scheduledAt = slot.at.toISOString();
    const key = `${slot.medicine.id}|${scheduledAt}`;
    const log = logs.get(key);
    const prior = previous.filter((item) => item.medicine.id === slot.medicine.id && item.hhmm === slot.hhmm).at(-1);
    const gapHours = prior ? (slot.at.getTime() - prior.at.getTime()) / 3_600_000 : null;
    return {
      key,
      medicineId: slot.medicine.id,
      name: slot.medicine.name,
      dose: slot.medicine.dose,
      food: slot.medicine.food,
      water: slot.medicine.water,
      notes: slot.medicine.notes,
      mode: slot.medicine.mode,
      hhmm: slot.hhmm,
      scheduledAt,
      localLabel: formatHm(slot.at, labelZone),
      ukLabel: formatHm(slot.at, HOME_TZ),
      movedFrom: slot.movedFrom,
      gapHours,
      state: doseState(slot.at, now, leadMinutes, log),
      snoozeUntil: log?.status === "snoozed" ? log.snoozeUntil ?? null : null,
    };
  });
}

export function liveAgenda(args: {
  medicines: Medicine[];
  dayKey: string;
  labelZone: string;
  zoneForDay: (dayKey: string) => string;
  now: Date;
  leadMinutes: number;
  logs: LogEntry[];
  clock: BodyClock;
  shiftMinutesPerDay: number;
  targetAt: TargetFn;
  carryover: boolean;
  holidayStart?: string | null;
  holidayEnd?: string | null;
  kitSavedDay?: string | null;
}): { doses: DoseView[]; carry: DoseView[] } {
  const logMap = new Map(args.logs.map((entry) => [entry.key, entry]));
  const holidayStart = args.holidayStart ?? null;
  const holidayEnd = args.holidayEnd ?? null;
  const kitSavedDay = args.kitSavedDay ?? null;
  const slots = (key: string) =>
    slotsForDay(args.medicines, key, args.zoneForDay, args.shiftMinutesPerDay, holidayStart, holidayEnd);
  const todayKey = args.dayKey;
  const prevKey = shiftDayKey(todayKey, -1);
  const beforeKey = shiftDayKey(todayKey, -2);
  const due = (key: string) => doseDueOn(key, holidayStart, holidayEnd, kitSavedDay);
  const doses = due(todayKey)
    ? decorate(slots(todayKey), slots(prevKey), args.zoneForDay(todayKey), args.now, args.leadMinutes, logMap)
    : [];
  if (!args.carryover) return { doses, carry: [] };
  const yesterday = due(prevKey)
    ? decorate(slots(prevKey), slots(beforeKey), args.zoneForDay(prevKey), args.now, args.leadMinutes, logMap)
    : [];
  const carry = yesterday.filter(
    (dose) => dose.state === "due" || dose.state === "overdue" || dose.state === "snoozed" || dose.state === "upcoming",
  );
  return { doses, carry };
}

export function makeTargetAt(legs: Leg[], choice: ZoneChoice, phoneTz: string): TargetFn {
  return (instant: Date) => offsetMinutes(zoneForInstant(legs, instant, choice, phoneTz), instant);
}

export function gapLabel(hours: number | null, _stepMinutes = 60): string | null {
  if (hours == null || !Number.isFinite(hours)) return null;
  const mins = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const text = m === 0 ? `${h} hours` : `${h} h ${m} min`;
  return `Gap since the previous dose: ${text}.`;
}

export function gapIsExpected(hours: number | null, stepMinutes = 60): boolean {
  if (hours == null || !Number.isFinite(hours)) return true;
  const mins = Math.round(hours * 60);
  const day = 24 * 60;
  const step = Math.max(0, Math.round(stepMinutes));
  return mins === day || mins === day + step || mins === day - step;
}

export const FOOD_LABEL: Record<FoodRule, string> = {
  "with-food": "With food",
  empty: "Empty stomach",
  either: "Food doesn't matter",
};

export const WATER_LABEL: Record<WaterRule, string> = {
  full: "Full glass of water",
  sip: "A sip of water",
  none: "No water",
  either: "Water doesn't matter",
};

export const MODE_LABEL: Record<ClockMode, string> = {
  uk: "UK clock",
  local: "Local time",
  ease: "Ease across",
};

export function clockLine(dose: DoseView, _zoneOffset?: number, _bodyOffset?: number): string {
  if (dose.mode === "ease") {
    if (dose.ukLabel === dose.hhmm && dose.localLabel !== dose.ukLabel) return "Has not jumped yet";
    if (dose.localLabel === dose.hhmm && dose.ukLabel !== dose.hhmm) {
      return `${dose.localLabel} local · ${dose.ukLabel} London`;
    }
    if (dose.ukLabel === dose.localLabel) return "UK time, nothing is shifting";
    return `${dose.localLabel} here · ${dose.ukLabel} London, shifting`;
  }
  if (dose.mode === "uk") return dose.ukLabel === dose.localLabel ? "Same time as home" : `Taken at ${dose.ukLabel} UK`;
  return `${dose.localLabel} local · ${dose.ukLabel} UK`;
}

export function easeNote(
  dayKey: string,
  holidayStart: string | null,
  holidayEnd: string | null,
  shiftMinutesPerDay: number,
  zoneForDay: (dayKey: string) => string,
  place: string,
): string {
  if (!holidayStart || !holidayEnd || dayKey < holidayStart) {
    return "Nothing is shifting. Doses stay on UK time until you leave.";
  }
  if (dayKey === holidayStart) return "Has not jumped yet. Ease starts the day after you leave.";
  if (dayKey > holidayEnd) return "Doses are back on UK time.";
  const step = Math.max(1, shiftMinutesPerDay);
  const body = easeBody(dayKey, 12, 0, holidayStart, step, zoneForDay);
  const [year, month, day] = dayKey.split("-").map(Number);
  const zone = zoneForDay(dayKey) || HOME_TZ;
  const target = offsetMinutes(zone, zonedTimeToUtc(zone, year, month, day, 12, 0));
  return easeSummary(body, target, step, place);
}

export function easeSummary(
  bodyOffset: number,
  zoneOffset: number,
  shiftMinutesPerDay: number,
  place: string,
): string {
  const remaining = zoneOffset - bodyOffset;
  if (remaining === 0) return `Eased doses are on ${place} time.`;
  const days = Math.max(1, Math.ceil(Math.abs(remaining) / Math.max(1, shiftMinutesPerDay)));
  const relation = remaining > 0 ? "behind" : "ahead of";
  const abs = Math.abs(remaining);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const hm = m === 0 ? `${h} hour${h === 1 ? "" : "s"}` : `${h} h ${m} min`;
  const rate =
    shiftMinutesPerDay === 60
      ? "1 hour a day"
      : shiftMinutesPerDay === 120
        ? "2 hours a day"
        : `${shiftMinutesPerDay} min a day`;
  return `Eased doses are ${hm} ${relation} ${place}. About ${days} day${days === 1 ? "" : "s"} to line up, at ${rate}.`;
}

export function sortedLegs(legs: Leg[]): Leg[] {
  return [...legs].sort((a, b) => {
    const ar = legRange(a);
    const br = legRange(b);
    return (ar?.start ?? 0) - (br?.start ?? 0);
  });
}
