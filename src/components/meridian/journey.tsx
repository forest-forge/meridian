import { legRange, placeLabel, sortedLegs, tripSpanDays, zoneForInstant, type ZoneChoice } from "@/lib/schedule";
import { useMeridian } from "@/lib/store";
import { HOME_TZ, cityFromZone, formatShortWhen, offsetLabel, offsetMinutes, wallToUtc } from "@/lib/time";
import { downloadTripCalendar, downloadTripSheet, runOutDay } from "@/lib/print-trip";
import { useShell } from "./shell";
import { HolidayDates } from "./editors";
import { Button, Choice, Note } from "./ui";

export function Journey({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const legs = useMeridian((s) => s.legs);
  const choice = useMeridian((s) => s.zoneChoice);
  const setZoneChoice = useMeridian((s) => s.setZoneChoice);
  const { now, phoneTz } = useShell();
  const ordered = sortedLegs(legs);
  const zone = zoneForInstant(legs, now, choice, phoneTz);
  const place = placeLabel(legs, zone, now);
  const days = tripSpanDays(legs);
  const holidayStart = useMeridian((s) => s.holidayStart);
  const holidayEnd = useMeridian((s) => s.holidayEnd);
  const medicines = useMeridian((s) => s.medicines);
  const wallet = useMeridian((s) => s.wallet);
  const clock = useMeridian((s) => s.bodyClock);
  const shift = useMeridian((s) => s.shiftMinutesPerDay);

  function download() {
    if (!holidayStart || !holidayEnd) return;
    downloadTripSheet({ medicines, legs, holidayStart, holidayEnd, wallet, clock, shiftMinutesPerDay: shift });
  }

  function calendar() {
    if (!holidayStart || !holidayEnd) return;
    downloadTripCalendar({ medicines, legs, holidayStart, holidayEnd, clock, shiftMinutesPerDay: shift });
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
          {medicines.filter((medicine) => runOutDay(medicine, holidayStart)).map((medicine) => (
            <p key={medicine.id} className="text-sm text-subtle">{medicine.name} runs out {runOutDay(medicine, holidayStart)}</p>
          ))}
        </div>
      ) : null}

      <Choice<ZoneChoice["source"]>
        legend="Reminders follow"
        value={choice.source}
        onChange={(source) => {
          if (source === "locked") setZoneChoice({ source: "locked", timeZone: choice.source === "locked" ? choice.timeZone : zone });
          else setZoneChoice({ source });
        }}
        options={[
          { value: "journey", label: "My journey", hint: "The stop that covers right now, even if the phone stays on UK time." },
          { value: "phone", label: "This phone", hint: `The phone is set to ${cityFromZone(phoneTz)}.` },
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
        Right now that is {place} ({offsetLabel(offsetMinutes(zone, now))}).
        {days > 0 ? ` This holiday is ${days} day${days === 1 ? "" : "s"}.` : ""}
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
            const length = range ? Math.max(1, Math.round((range.end - range.start) / 86_400_000)) : 0;
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
                    {cityFromZone(leg.timeZone)} · {offsetLabel(offsetMinutes(leg.timeZone, arrive ?? now))}
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
