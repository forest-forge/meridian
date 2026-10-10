import { jsPDF } from "jspdf";
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
import { walletLines } from "./wallet.ts";
import { HOME_TZ, formatDayKey, partsInZone, shiftDayKey, ukOffsetLabel, zonedTimeToUtc } from "./time.ts";
import type { BodyClock } from "./schedule.ts";

export type TripFile = {
  medicines: Medicine[];
  legs: Leg[];
  holidayStart: string;
  holidayEnd: string;
  wallet: Wallet;
  clock: BodyClock;
  shiftMinutesPerDay: number;
};

export async function viewTripPdf(args: TripFile): Promise<boolean> {
  const blob = tripPdf(args);
  const url = URL.createObjectURL(blob);
  const page = window.open(url, "_blank");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return Boolean(page);
}

export async function downloadTripPdf(args: TripFile): Promise<boolean> {
  const blob = tripPdf(args);
  return saveFile(blob, `meridian-${args.holidayStart}.pdf`, "application/pdf");
}

export async function downloadTripSheet(args: TripFile): Promise<boolean> {
  return downloadTripPdf(args);
}

export async function downloadTripCalendar(args: {
  medicines: Medicine[];
  legs: Leg[];
  holidayStart: string;
  holidayEnd: string;
  clock: BodyClock;
  shiftMinutesPerDay: number;
}): Promise<boolean> {
  const ics = tripIcs(args).replace(/\n/g, "\r\n");
  if (!ics.includes("BEGIN:VEVENT")) return false;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const file = new File([blob], `meridian-${args.holidayStart}.ics`, { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // A phone adds the alarms only if Calendar opens the file. A plain download does not.
  if (ios) {
    window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }
  const opened = window.open(url, "_blank");
  if (opened) {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }
  const share = navigator.share?.bind(navigator);
  if (share && navigator.canShare?.({ files: [file] })) {
    try {
      await share({ files: [file], title: "Meridian alarms" });
      URL.revokeObjectURL(url);
      return true;
    } catch {
      // Cancelled or refused. Fall through to a file the person can open in Calendar.
    }
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export function runOutDay(medicine: Medicine, holidayStart: string): string | null {
  if (!medicine.tablets || medicine.tablets < 1) return null;
  const perDay = Math.max(1, medicine.times.length);
  const days = Math.floor(medicine.tablets / perDay);
  if (days < 1) return holidayStart;
  return shiftDayKey(holidayStart, days - 1);
}

async function saveFile(blob: Blob, name: string, type: string): Promise<boolean> {
  const file = new File([blob], name, { type });
  const share = navigator.share?.bind(navigator);
  const canShare = navigator.canShare?.({ files: [file] });
  if (share && canShare) {
    try {
      await share({ files: [file], title: name });
      return true;
    } catch {
      // The person cancelled, or this browser will not share a file. Fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export function tripPdf(args: TripFile): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const left = 14;
  const right = width - 14;
  let y = 18;

  const gap = (n = 5) => {
    y += n;
    if (y > height - 16) {
      doc.addPage();
      y = 18;
    }
  };
  const write = (value: string, size = 11, style: "normal" | "bold" = "normal") => {
    doc.setFont("times", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, right - left) as string[];
    for (const line of lines) {
      if (y > height - 16) {
        doc.addPage();
        y = 18;
      }
      doc.text(line, left, y);
      y += size * 0.45;
    }
  };

  write("Meridian", 22);
  gap(2);
  write(`${formatDayKey(args.holidayStart)} to ${formatDayKey(args.holidayEnd)}. Times are local. UK time is beside them.`, 11);
  const lines = walletLines(args.wallet);
  if (lines.length > 0) {
    gap(6);
    write("Wallet card", 14, "bold");
    for (const [label, value] of lines) write(`${label}. ${value}`);
  }
  gap(6);
  write("Kit", 14, "bold");
  if (args.medicines.length === 0) write("No medicines.");
  for (const medicine of args.medicines) {
    const out = runOutDay(medicine, args.holidayStart);
    const supply = out ? ` Pack runs out ${formatDayKey(out)}.` : "";
    const held = medicine.holdTime ? " Time is held, not moved for sleep." : "";
    write(`${medicine.name} ${medicine.dose} at ${medicine.times.join(", ")} UK.${supply}${held}`);
  }

  const choice = { source: "journey" as const };
  const targetAt = makeTargetAt(args.legs, choice, HOME_TZ);
  const zones = (key: string) => scheduleZoneForDay(key, args.legs, choice);
  const lastDay = scheduleEnd(args.medicines, args.holidayStart, args.holidayEnd, args.shiftMinutesPerDay, zones);
  for (let day = args.holidayStart; day <= lastDay; day = shiftDayKey(day, 1)) {
    const zone = scheduleZoneForDay(day, args.legs, choice);
    const [year, month, date] = day.split("-").map(Number);
    const localNoon = zonedTimeToUtc(zone, year, month, date, 12, 0);
    const londonNoon = zonedTimeToUtc(HOME_TZ, year, month, date, 12, 0);
    const place = placeLabel(args.legs, zone, localNoon);
    const offset = ukOffsetLabel(zone, londonNoon);
    const { doses } = liveAgenda({
      medicines: args.medicines,
      dayKey: day,
      labelZone: zone,
      zoneForDay: zones,
      now: new Date(`${day}T00:00:00Z`),
      leadMinutes: 0,
      logs: [],
      clock: args.clock,
      shiftMinutesPerDay: args.shiftMinutesPerDay,
      targetAt,
      carryover: false,
      holidayStart: args.holidayStart,
      holidayEnd: args.holidayEnd,
    });
    gap(5);
    write(`${formatDayKey(day)} · ${place} ${offset}`, 13, "bold");
    if (doses.length === 0) write("No doses.");
    for (const dose of doses) {
      const moved = dose.movedFrom ? ` Moved from ${dose.movedFrom} (asleep until 06:00).` : "";
      write(`${dose.localLabel} local, ${dose.ukLabel} UK. ${dose.name} ${dose.dose}. ${FOOD_LABEL[dose.food]}. ${WATER_LABEL[dose.water]}.${moved}`);
    }
  }
  gap(8);
  write("Not medical advice. Eased doses walk about an hour a day toward local time from the day you leave. Doses between midnight and 06:00 local move to 06:00 unless that medicine is marked hold. Import the calendar file so the phone alarms at each dose.", 10);
  return doc.output("blob");
}

export function tripHtml(args: {
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
      const localNoon = zonedTimeToUtc(zone, year, month, date, 12, 0);
      const londonNoon = zonedTimeToUtc(HOME_TZ, year, month, date, 12, 0);
      const place = placeLabel(args.legs, zone, localNoon);
      const offset = ukOffsetLabel(zone, londonNoon);
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

  const lines = walletLines(args.wallet);
  const name = lines.find(([label]) => label === "Name")?.[1] ?? "";
  const rest = lines.filter(([label]) => label !== "Name");
  const card = [
    name ? `<p class="who">${esc(name)}</p>` : "",
    ...rest.map(([label, value]) => `<p><strong>${esc(label)}.</strong> ${esc(value)}</p>`),
  ].join("");

  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Meridian trip</title>
<style>
  body { font: 14px "Outfit", "Avenir Next", sans-serif; color: #1c211f; margin: 24px; }
  h1 { font-family: Palatino, Georgia, serif; font-weight: 500; margin: 0; }
  h2 { font-size: 16px; margin: 20px 0 8px; }
  p, li { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; border-bottom: 1px solid #d9d5cb; padding: 6px 8px 6px 0; vertical-align: top; }
  .card { border: 2px solid #1c211f; padding: 12px; margin-top: 16px; }
  .card .who { font-family: Palatino, Georgia, serif; font-size: 22px; margin: 0 0 6px; }
  .note { color: #5c6560; margin-top: 24px; }
  @media print { body { margin: 12mm; } section, .card { break-inside: avoid; } }
</style></head><body>
<h1>Meridian</h1>
<p>${esc(formatDayKey(args.holidayStart))} to ${esc(formatDayKey(args.holidayEnd))}. Times are local. UK time is beside them.</p>
${card ? `<div class="card"><p>Wallet card</p>${card}</div>` : ""}
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
      events.push(fold(`BEGIN:VEVENT
UID:${dose.key.replace(/[^a-zA-Z0-9]/g, "").slice(0, 48)}@meridian
DTSTAMP:${icsUtc(new Date())}
DTSTART:${icsUtc(start)}
DTEND:${icsUtc(end)}
SUMMARY:${icsText(summary)}
DESCRIPTION:${icsText(description)}
STATUS:CONFIRMED
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:${icsText(summary)}
TRIGGER:${alarmTrigger(start, zone)}
END:VALARM
END:VEVENT`));
    }
  }
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Meridian//Trip//EN
CALSCALE:GREGORIAN
X-WR-CALNAME:Meridian
${events.join("\n")}
END:VCALENDAR
`;
}

function alarmTrigger(at: Date, zone: string): string {
  const lead = new Date(at.getTime() - 15 * 60_000);
  if (partsInZone(lead, zone).hour >= 6) return "-PT15M";
  const parts = partsInZone(lead, zone);
  const wake = zonedTimeToUtc(zone, parts.year, parts.month, parts.day, 6, 0);
  const alert = wake.getTime() <= at.getTime() ? wake : at;
  const minutes = Math.round((alert.getTime() - at.getTime()) / 60_000);
  if (minutes === 0) return "PT0M";
  return minutes < 0 ? `-PT${Math.abs(minutes)}M` : `PT${minutes}M`;
}

function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function fold(block: string): string {
  return block
    .split("\n")
    .map((line) => {
      if (line.length <= 73) return line;
      const parts = [line.slice(0, 73)];
      for (let index = 73; index < line.length; index += 72) parts.push(" " + line.slice(index, index + 72));
      return parts.join("\n");
    })
    .join("\n");
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
