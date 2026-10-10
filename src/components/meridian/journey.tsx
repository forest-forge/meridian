import { useState } from "react";
import { easeJourneyLine, holidayError, holidayLength, legRange, placeLabel, scheduleZoneForDay, sortedLegs, stopLengthDays, zoneForInstant, type ZoneChoice } from "@/lib/schedule";
import { useMeridian } from "@/lib/store";
import { HOME_TZ, cityFromZone, dayKeyInZone, formatDayKey, formatShortWhen, offsetOnDay, ukOffsetLabel, wallToUtc, zoneAbbrev } from "@/lib/time";
import { downloadTripCalendar, downloadTripSheet, runOutDay } from "@/lib/print-trip";
import { useShell } from "./shell";
import { HolidayDates } from "./editors";
import { WalletCard } from "./wallet-card";
import { Button, Choice, Note } from "./ui";

export function Journey({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const legs = useMeridian((s) => s.legs);
  const choice = useMeridian((s) => s.zoneChoice);
  const setZoneChoice = useMeridian((s) => s.setZoneChoice);
  const { now, phoneTz } = useShell();
  const holidayStart = useMeridian((s) => s.holidayStart);
  const holidayEnd = useMeridian((s) => s.holidayEnd);
  const medicines = useMeridian((s) => s.medicines);
  const wallet = useMeridian((s) => s.wallet);
  const clock = useMeridian((s) => s.bodyClock);
  const shift = useMeridian((s) => s.shiftMinutesPerDay);
  const ordered = sortedLegs(legs);
  const zone = zoneForInstant(legs, now, choice, phoneTz);
  const londonDay = dayKeyInZone(now, HOME_TZ);
  const doseZone = scheduleZoneForDay(londonDay, legs, choice);
  const place = placeLabel(legs, doseZone, now);
  const lineup =
    holidayStart && holidayEnd && !holidayError(holidayStart, holidayEnd)
      ? easeJourneyLine(medicines, legs, holidayStart, holidayEnd, shift)
      : null;
  const shortPack =
    holidayStart && holidayEnd
      ? medicines.flatMap((medicine) => {
          const out = runOutDay(medicine, holidayStart);
          return out && out < holidayEnd ? [{ medicine, out }] : [];
        })
      : [];
  const holidayDays =
    holidayStart && holidayEnd && !holidayError(holidayStart, holidayEnd) ? holidayLength(holidayStart, holidayEnd) : 0;

  const [fileNote, setFileNote] = useState<string | null>(null);

  async function download() {
    if (!holidayStart || !holidayEnd) return;
    setFileNote(null);
    const opened = await downloadTripSheet({ medicines, legs, holidayStart, holidayEnd, wallet, clock, shiftMinutesPerDay: shift });
    if (!opened) setFileNote("The trip could not open. Try again.");
  }

  async function calendar() {
    if (!holidayStart || !holidayEnd) return;
    if (medicines.length === 0) {
      setFileNote("Add a medicine before the calendar alarms.");
      return;
    }
    setFileNote(null);
    const opened = await downloadTripCalendar({ medicines, legs, holidayStart, holidayEnd, clock, shiftMinutesPerDay: shift });
    if (!opened) setFileNote("The calendar file could not open. Try again.");
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Journey</h1>
        <p className="mt-1 text-sm text-subtle">You live in the UK. Home time is London, including BST.</p>
      </div>
      <HolidayDates />
      {holidayStart && holidayEnd ? (
        <div className="grid gap-2">
          <Button variant="quiet" onClick={download}>Download printable trip</Button>
          <Button variant="quiet" onClick={calendar}>Add alarms to calendar</Button>
          {fileNote ? <p className="text-sm text-danger">{fileNote}</p> : null}
          {shortPack.map(({ medicine, out }) => (
            <p key={medicine.id} className="text-sm text-subtle">
              {medicine.name} runs out {formatDayKey(out)}, before you get home on {formatDayKey(holidayEnd!)}.
            </p>
          ))}
        </div>
      ) : null}

      {lineup ? <p className="text-sm text-muted">{lineup}</p> : null}

      <WalletCard wallet={wallet} />

      <Choice<ZoneChoice["source"]>
        legend="Reminders follow"
        value={choice.source}
        onChange={(source) => {
          if (source === "locked") setZoneChoice({ source: "locked", timeZone: choice.source === "locked" ? choice.timeZone : zone });
          else setZoneChoice({ source });
        }}
        options={[
          { value: "journey", label: "My journey", hint: "The stop that covers right now, even if the phone stays on UK time." },
          { value: "phone", label: "This phone", hint: `The phone is set to ${cityFromZone(phoneTz)} (${zoneAbbrev(now, phoneTz)}).` },
          { value: "locked", label: "A fixed time zone", hint: "Hold one zone for the whole trip." },
        ]}
      />

      {choice.source === "locked" ? (
        <label className="block text-sm">
          <span className="font-medium">Locked zone</span>
          <select
            className="mt-2 h-11 w-full rounded-md border border-line bg-surface px-3"
            value={choice.timeZone}
            onChange={(event) => setZoneChoice({ source: "locked", timeZone: event.target.value })}
          >
            <option value={HOME_TZ}>United Kingdom</option>
            {ordered.map((leg) => (
              <option key={leg.id} value={leg.timeZone}>
                {leg.place}
              </option>
            ))}
            {!ordered.some((leg) => leg.timeZone === choice.timeZone) && choice.timeZone !== HOME_TZ ? (
              <option value={choice.timeZone}>{choice.timeZone}</option>
            ) : null}
          </select>
        </label>
      ) : null}

      <p className="text-sm text-muted">
        Right now that is {place} ({ukOffsetLabel(doseZone, now)}).
        {holidayDays > 0 ? ` This holiday is ${holidayDays} day${holidayDays === 1 ? "" : "s"}.` : ""}
      </p>

      {ordered.length === 0 ? (
        <p className="text-sm text-muted">Add where you are going. Meridian will translate each dose into that stop.</p>
      ) : (
        <ol className="grid gap-3">
          {ordered.map((leg) => {
            const arrive = wallToUtc(leg.timeZone, leg.arrive);
            const depart = wallToUtc(leg.timeZone, leg.depart);
            const range = legRange(leg);
            const here = range ? now.getTime() >= range.start && now.getTime() < range.end : false;
            const length = stopLengthDays(leg);
            return (
              <li key={leg.id}>
                <button
                  type="button"
                  onClick={() => onEdit(leg.id)}
                  className="w-full rounded-xl border border-line bg-surface p-4 text-left"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-base font-medium">{leg.place}</h2>
                    <span className="text-sm text-subtle">{here ? "Here now" : `${length} day${length === 1 ? "" : "s"}`}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {cityFromZone(leg.timeZone)} · {offsetOnDay(leg.timeZone, leg.arrive.slice(0, 10), now)}
                  </p>
                  <p className="mt-2 text-sm text-subtle tabular-nums">
                    {arrive ? formatShortWhen(arrive, leg.timeZone) : leg.arrive}
                    {" – "}
                    {depart ? formatShortWhen(depart, leg.timeZone) : leg.depart}
                  </p>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <Button onClick={onAdd}>Add stop</Button>
      <Note>Stops must not overlap, and the whole trip can run up to 3 months.</Note>
    </div>
  );
}
