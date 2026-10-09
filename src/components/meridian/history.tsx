import { useMemo } from "react";
import { liveAgenda, makeTargetAt, scheduleZoneForDay } from "@/lib/schedule";
import { useMeridian } from "@/lib/store";
import { HOME_TZ, dayKeyInZone, formatHm, formatWhen, shiftDayKey } from "@/lib/time";
import { useShell } from "./shell";

const STATE_WORD: Record<string, string> = {
  taken: "Taken",
  skipped: "Skipped",
  missed: "Missed",
  snoozed: "Snoozed",
  due: "Still due",
  overdue: "Overdue",
  upcoming: "Coming up",
  later: "Later",
};

export function History() {
  const medicines = useMeridian((s) => s.medicines);
  const legs = useMeridian((s) => s.legs);
  const logs = useMeridian((s) => s.logs);
  const clock = useMeridian((s) => s.bodyClock);
  const shift = useMeridian((s) => s.shiftMinutesPerDay);
  const lead = useMeridian((s) => s.leadMinutes);
  const choice = useMeridian((s) => s.zoneChoice);
  const holidayStart = useMeridian((s) => s.holidayStart);
  const holidayEnd = useMeridian((s) => s.holidayEnd);
  const kitSavedAt = useMeridian((s) => s.kitSavedAt);
  const { now, phoneTz } = useShell();
  const zones = (key: string) => scheduleZoneForDay(key, legs, choice);
  const today = dayKeyInZone(now, zones(dayKeyInZone(now, HOME_TZ)));
  const targetAt = useMemo(() => makeTargetAt(legs, choice, phoneTz), [legs, choice, phoneTz]);

  const days = Array.from({ length: 10 }, (_, index) => shiftDayKey(today, -index));
  const groups = days.map((dayKey) => {
    const { doses } = liveAgenda({
      medicines,
      dayKey,
      labelZone: scheduleZoneForDay(dayKey, legs, choice),
      zoneForDay: (key) => scheduleZoneForDay(key, legs, choice),
      now,
      leadMinutes: lead,
      logs,
      clock,
      shiftMinutesPerDay: shift,
      targetAt,
      carryover: false,
      holidayStart,
      holidayEnd,
      kitSavedDay: kitSavedAt ? dayKeyInZone(new Date(kitSavedAt), HOME_TZ) : null,
    });
    const logged = doses.filter((dose) => dose.state === "taken" || dose.state === "skipped" || dose.state === "missed");
    return { dayKey, doses: logged };
  });

  const any = groups.some((group) => group.doses.length > 0);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Log</h1>
        <p className="mt-1 text-sm text-subtle">Taken, skipped, and missed doses from the last 10 days.</p>
      </div>
      {!any ? <p className="text-sm text-muted">Nothing to show yet. Mark a dose when you take it.</p> : null}
      {groups.map((group) =>
        group.doses.length === 0 ? null : (
          <section key={group.dayKey} className="grid gap-2">
            <h2 className="text-sm font-medium text-subtle">
              {formatWhen(new Date(`${group.dayKey}T12:00:00Z`), "UTC")}
            </h2>
            <ul className="grid gap-2">
              {group.doses.map((dose) => (
                <li key={dose.key} className="rounded-xl border border-line bg-surface px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">{dose.name}</p>
                    <p className="text-sm text-subtle tabular-nums">{STATE_WORD[dose.state] ?? dose.state}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted tabular-nums">
                    {dose.localLabel} local · {formatHm(new Date(dose.scheduledAt), HOME_TZ)} UK
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
