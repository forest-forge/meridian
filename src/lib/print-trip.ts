import {
  FOOD_LABEL,
  WATER_LABEL,
  liveAgenda,
  makeTargetAt,
  placeLabel,
  scheduleEnd,
  scheduleZoneForDay,
  type Leg,
  type Medicine,
} from "./schedule.ts";
import type { Wallet } from "./store.ts";
import { HOME_TZ, formatDayKey, shiftDayKey, ukOffsetLabel, zonedTimeToUtc } from "./time.ts";
import type { BodyClock } from "./schedule.ts";

export function downloadTripSheet(args: {
  medicines: Medicine[];
  legs: Leg[];
  holidayStart: string;
  holidayEnd: string;
  wallet: Wallet;
  clock: BodyClock;
  shiftMinutesPerDay: number;
}): void {
  const blob = new Blob([tripHtml(args)], { type: "text/html" });
  saveBlob(blob, `meridian-${args.holidayStart}.html`);
}

export function downloadTripCalendar(args: {
  medicines: Medicine[];
  legs: Leg[];
  holidayStart: string;
  holidayEnd: string;
  clock: BodyClock;
  shiftMinutesPerDay: number;
}): void {
  const blob = new Blob([tripIcs(args)], { type: "text/calendar" });
  saveBlob(blob, `meridian-${args.holidayStart}.ics`);
}

export function runOutDay(medicine: Medicine, holidayStart: string): string | null {
  if (!medicine.tablets || medicine.tablets < 1) return null;
  const perDay = Math.max(1, medicine.times.length);
  const days = Math.floor(medicine.tablets / perDay);
  if (days < 1) return holidayStart;
  return shiftDayKey(holidayStart, days - 1);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function tripHtml(args: {
  medicines: Medicine[];
  legs: Leg[];
  holidayStart: string;
  holidayEnd: string;
  wallet: Wallet;
  clock: BodyClock;
  shiftMinutesPerDay: number;
}): string {
  const choice = { source: "journey" as const };
  const targetAt = makeTargetAt(args.legs, choice, HOME_TZ);
  const clock = args.clock;
  const zones = (key: string) => scheduleZoneForDay(key, args.legs, choice);
  const lastDay = scheduleEnd(args.medicines, args.holidayStart, args.holidayEnd, args.shiftMinutesPerDay, zones);
  const days: string[] = [];
  for (let day = args.holidayStart; day <= lastDay; day = shiftDayKey(day, 1)) days.push(day);

  const sections = days
    .map((day) => {
      const zone = scheduleZoneForDay(day, args.legs, choice);
      const [year, month, date] = day.split("-").map(Number);
      const noon = zonedTimeToUtc(zone, year, month, date, 12, 0);
      const place = placeLabel(args.legs, zone, noon);
      const offset = ukOffsetLabel(zone, noon);
      const zones = (key: string) => scheduleZoneForDay(key, args.legs, choice);
      const { doses } = liveAgenda({
        medicines: args.medicines,
        dayKey: day,
        labelZone: zone,
        zoneForDay: zones,
        now: new Date(`${day}T00:00:00Z`),
        leadMinutes: 0,
        logs: [],
        clock,
        shiftMinutesPerDay: args.shiftMinutesPerDay,
        targetAt,
        carryover: false,
        holidayStart: args.holidayStart,
        holidayEnd: args.holidayEnd,
      });
      const rows = doses
        .map((dose) => {
          const moved = dose.movedFrom ? ` Moved from ${esc(dose.movedFrom)} (asleep until 06:00).` : "";
          return `<tr><td>${esc(dose.localLabel)}</td><td>${esc(dose.ukLabel)} UK</td><td>${esc(dose.name)} ${esc(dose.dose)}</td><td>${esc(FOOD_LABEL[dose.food])}</td><td>${esc(WATER_LABEL[dose.water])}${moved}</td></tr>`;
        })
        .join("");
      return `<section><h2>${esc(formatDayKey(day))} · ${esc(place)} ${esc(offset)}</h2>${
        rows
          ? `<table><thead><tr><th>Local</th><th>UK</th><th>Medicine</th><th>Food</th><th>Water</th></tr></thead><tbody>${rows}</tbody></table>`
          : "<p>No doses.</p>"
      }</section>`;
    })
    .join("");

  const kit = args.medicines
    .map((medicine) => {
      const out = runOutDay(medicine, args.holidayStart);
      const supply = out ? ` Pack runs out ${esc(formatDayKey(out))}.` : "";
      const held = medicine.holdTime ? " Time is held, not moved for sleep." : "";
      return `<li>${esc(medicine.name)} ${esc(medicine.dose)} at ${esc(medicine.times.join(", "))} UK.${supply}${held}</li>`;
    })
    .join("");

  const card = [
    ["Name", args.wallet.name],
    ["Conditions", args.wallet.conditions],
    ["Clinic", args.wallet.clinic],
    ["Emergency", args.wallet.emergency],
    ["Insurance", args.wallet.insurance],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `<p><strong>${label}.</strong> ${esc(value)}</p>`)
    .join("");

  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Meridian trip</title>
<style>
  body { font: 14px "Outfit", "Avenir Next", sans-serif; color: #1c211f; margin: 24px; }
  h1 { font-family: Palatino, Georgia, serif; font-weight: 500; margin: 0; }
  h2 { font-size: 16px; margin: 20px 0 8px; }
  p, li { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; border-bottom: 1px solid #d9d5cb; padding: 6px 8px 6px 0; vertical-align: top; }
  .card { border: 2px solid #1c211f; padding: 12px; margin-top: 16px; }
  .note { color: #5c6560; margin-top: 24px; }
  @media print { body { margin: 12mm; } section, .card { break-inside: avoid; } }
</style></head><body>
<h1>Meridian</h1>
<p>${esc(formatDayKey(args.holidayStart))} to ${esc(formatDayKey(args.holidayEnd))}. Times are local. UK time is beside them.</p>
${card ? `<div class="card"><h2>Wallet card</h2>${card}</div>` : ""}
<h2>Kit</h2><ul>${kit || "<li>No medicines.</li>"}</ul>
${sections}
<p class="note">Not medical advice. Eased doses walk about an hour a day toward local time from the day you leave. Doses between midnight and 06:00 local move to 06:00 unless that medicine is marked hold. Import the calendar file so the phone alarms at each dose.</p>
</body></html>`;
}

function tripIcs(args: {
  medicines: Medicine[];
  legs: Leg[];
  holidayStart: string;
  holidayEnd: string;
  clock: BodyClock;
  shiftMinutesPerDay: number;
}): string {
  const choice = { source: "journey" as const };
  const targetAt = makeTargetAt(args.legs, choice, HOME_TZ);
  const clock = args.clock;
  const events: string[] = [];
  const zonesForEnd = (key: string) => scheduleZoneForDay(key, args.legs, choice);
  const lastDay = scheduleEnd(args.medicines, args.holidayStart, args.holidayEnd, args.shiftMinutesPerDay, zonesForEnd);
  for (let day = args.holidayStart; day <= lastDay; day = shiftDayKey(day, 1)) {
    const zone = scheduleZoneForDay(day, args.legs, choice);
    const zones = (key: string) => scheduleZoneForDay(key, args.legs, choice);
    const { doses } = liveAgenda({
      medicines: args.medicines,
      dayKey: day,
      labelZone: zone,
      zoneForDay: zones,
      now: new Date(`${day}T00:00:00Z`),
      leadMinutes: 0,
      logs: [],
      clock,
      shiftMinutesPerDay: args.shiftMinutesPerDay,
      targetAt,
      carryover: false,
      holidayStart: args.holidayStart,
      holidayEnd: args.holidayEnd,
    });
    for (const dose of doses) {
      const start = new Date(dose.scheduledAt);
      const end = new Date(start.getTime() + 15 * 60_000);
      const place = placeLabel(args.legs, zone, start);
      const summary = `${dose.name} ${dose.dose}`;
      const description = `${place}. Local ${dose.localLabel}. UK ${dose.ukLabel}. ${FOOD_LABEL[dose.food]}. ${WATER_LABEL[dose.water]}.`;
      events.push(`BEGIN:VEVENT
UID:${dose.key.replace(/[^a-zA-Z0-9]/g, "")}@meridian
DTSTAMP:${icsUtc(new Date())}
DTSTART:${icsUtc(start)}
DTEND:${icsUtc(end)}
SUMMARY:${icsText(summary)}
DESCRIPTION:${icsText(description)}
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:${icsText(summary)}
END:VALARM
BEGIN:VALARM
TRIGGER:PT0M
ACTION:DISPLAY
DESCRIPTION:${icsText(summary)}
END:VALARM
END:VEVENT`);
    }
  }
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Meridian//Trip//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
${events.join("\n")}
END:VCALENDAR
`;
}

function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsText(value: string): string {
  return value.replace(/[,;\\]/g, " ").replace(/\n/g, " ");
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    if (char === "&") return "&" + "amp;";
    if (char === "<") return "&" + "lt;";
    if (char === ">") return "&" + "gt;";
    return "&" + "quot;";
  });
}
