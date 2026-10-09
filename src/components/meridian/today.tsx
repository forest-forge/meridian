import { GlassWater, Utensils, UtensilsCrossed } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { DoseView } from "@/lib/schedule";
import {
  FOOD_LABEL,
  MODE_LABEL,
  WATER_LABEL,
  clockLine,
  easeNote,
  gapIsExpected,
  gapLabel,
  holidayError,
  liveAgenda,
  makeTargetAt,
  placeLabel,
  scheduleZoneForDay,
  type ClockMode,
} from "@/lib/schedule";
import { useMeridian } from "@/lib/store";
import {
  HOME_TZ,
  aheadLabel,
  countdown,
  dayKeyInZone,
  formatDayKey,
  formatWhen,
  offsetMinutes,
  pairedClock,
  shiftDayKey,
  ukOffsetLabel,
  zoneAbbrev,
  zonedTimeToUtc,
} from "@/lib/time";
import { useShell } from "./shell";
import { Button, Note } from "./ui";

export function Today({ onEdit }: { onEdit: (id: string) => void }) {
  const shell = useShell();
  const medicines = useMeridian((s) => s.medicines);
  const legs = useMeridian((s) => s.legs);
  const logs = useMeridian((s) => s.logs);
  const clock = useMeridian((s) => s.bodyClock);
  const shift = useMeridian((s) => s.shiftMinutesPerDay);
  const lead = useMeridian((s) => s.leadMinutes);
  const choice = useMeridian((s) => s.zoneChoice);
  const sampleNote = useMeridian((s) => s.sampleNote);
  const dismissSampleNote = useMeridian((s) => s.dismissSampleNote);
  const logDose = useMeridian((s) => s.logDose);
  const holidayStart = useMeridian((s) => s.holidayStart);
  const holidayEnd = useMeridian((s) => s.holidayEnd);
  const kitSavedAt = useMeridian((s) => s.kitSavedAt);
  const { now, phoneTz, planDay, setPlanDay } = shell;

  const zoneForSchedule = (key: string) => scheduleZoneForDay(key, legs, choice);
  const londonDay = dayKeyInZone(now, HOME_TZ);
  const todayKey = dayKeyInZone(now, zoneForSchedule(londonDay));
  const dayKey = planDay ?? todayKey;
  const zone = zoneForSchedule(dayKey);
  const planning = planDay != null && planDay !== todayKey;
  const targetAt = useMemo(() => makeTargetAt(legs, choice, phoneTz), [legs, choice, phoneTz]);
  const hasEase = medicines.some((medicine) => medicine.active && medicine.mode === "ease");
  const [year, month, day] = dayKey.split("-").map(Number);
  const probe = zonedTimeToUtc(zone, year, month, day, 12, 0);
  const londonNoon = zonedTimeToUtc(HOME_TZ, year, month, day, 12, 0);
  const place = placeLabel(legs, zone, probe);

  const { doses, carry } = liveAgenda({
    medicines,
    dayKey,
    labelZone: zone,
    zoneForDay: zoneForSchedule,
    now,
    leadMinutes: lead,
    logs,
    clock,
    shiftMinutesPerDay: shift,
    targetAt,
    carryover: !planning,
    holidayStart,
    holidayEnd,
    kitSavedDay: kitSavedAt ? dayKeyInZone(new Date(kitSavedAt), HOME_TZ) : null,
  });

  const open = [
    ...carry,
    ...doses.filter((dose) => dose.state === "upcoming" || dose.state === "due" || dose.state === "overdue" || dose.state === "snoozed"),
  ];
  const later = doses.filter((dose) => dose.state === "later");
  const earlier = doses.filter((dose) => dose.state === "taken" || dose.state === "skipped" || dose.state === "missed");
  const hero = open.find((dose) => dose.state === "due" || dose.state === "overdue") ?? open[0] ?? later[0] ?? null;
  const restOpen = hero ? open.filter((dose) => dose.key !== hero.key) : open;
  const laterRest = hero ? later.filter((dose) => dose.key !== hero.key) : later;
  const dayOffset = offsetMinutes(zone, londonNoon);
  const homeOffset = offsetMinutes(HOME_TZ, londonNoon);
  const bodyOffset = dayOffset;
  const clocks = pairedClock(now, dayOffset - homeOffset);

  function act(dose: DoseView, status: "taken" | "skipped" | "snoozed") {
    logDose({
      key: dose.key,
      medicineId: dose.medicineId,
      medicineName: dose.name,
      scheduledAt: dose.scheduledAt,
      status,
      actedAt: new Date().toISOString(),
      snoozeUntil: status === "snoozed" ? new Date(Date.now() + 15 * 60_000).toISOString() : undefined,
    });
  }

  return (
    <div className="relative grid gap-3">
      <p className="absolute right-0 top-0 text-right text-[11px] leading-4 text-subtle tabular-nums">
        Here {clocks.here} {zoneAbbrev(probe, zone)}
        <br />
        UK {clocks.uk} {zoneAbbrev(now, HOME_TZ)}
      </p>
      <header className="pr-28">
        <p className="text-xs text-subtle">{planning ? formatWhen(probe, zone, true) : formatWhen(now, HOME_TZ, true)}</p>
        <h1 className="truncate font-display text-xl font-medium tracking-tight">{place}</h1>
        <p className="text-sm text-muted">
          {ukOffsetLabel(zone, londonNoon)}
          {" · "}
          {aheadLabel(dayOffset, homeOffset)}
        </p>
      </header>

      {medicines.length === 0 ? (
        <p className="text-sm text-muted">Your kit is empty. Add a medicine and Meridian will remind you.</p>
      ) : hero ? (
        <DoseCard
          dose={hero}
          prominent
          dayKey={dayKey}
          zoneOffset={offsetMinutes(zone, new Date(hero.scheduledAt))}
          bodyOffset={bodyOffset}
          planning={planning}
          onMode={(mode) => {
            const medicine = useMeridian.getState().medicines.find((item) => item.id === hero.medicineId);
            if (medicine && medicine.mode !== mode) useMeridian.getState().saveMedicine({ ...medicine, mode });
          }}
          onTaken={() => act(hero, "taken")}
          onSnooze={() => act(hero, "snoozed")}
          onSkip={() => act(hero, "skipped")}
          onEdit={() => onEdit(hero.medicineId)}
          now={now}
        />
      ) : doses.length === 0 && carry.length === 0 ? (
        <p className="text-sm text-muted">Nothing scheduled this day.</p>
      ) : null}

      {hasEase ? <p className="text-sm text-muted">{easeNote(dayKey, holidayStart, holidayEnd, shift, zoneForSchedule, place)}</p> : null}

      <div className="flex items-center gap-2">
        <Button variant="quiet" aria-label="Previous day" onClick={() => setPlanDay(shiftDayKey(dayKey, -1))}>
          Prev
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium">{planning ? place : "Today"}</p>
          <input
            type="date"
            aria-label="Plan a day"
            value={dayKey}
            className="mx-auto mt-1 block bg-transparent text-center text-sm text-subtle"
            onChange={(event) => setPlanDay(event.target.value || null)}
          />
        </div>
        <Button variant="quiet" aria-label="Next day" onClick={() => setPlanDay(shiftDayKey(dayKey, 1))}>
          Next
        </Button>
      </div>
      {planning ? (
        <Button variant="quiet" onClick={() => setPlanDay(null)}>
          Back to today
        </Button>
      ) : null}
      {holidayStart && holidayEnd && !holidayError(holidayStart, holidayEnd) ? (
        <p className="text-sm text-subtle">Away {formatDayKey(holidayStart)} to {formatDayKey(holidayEnd)}</p>
      ) : null}

      {sampleNote ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-sm">
            Sample holiday loaded. Put in your leave and return dates, then replace the examples with the name and dosage you take.
          </p>
          <Button className="mt-3" variant="quiet" onClick={dismissSampleNote}>
            Hide this note
          </Button>
        </div>
      ) : null}

      {restOpen.length > 0 ? (
        <Section title="Also open">
          {restOpen.map((dose) => (
            <DoseCard
              key={dose.key}
              dose={dose}
              dayKey={dayKey}
              zoneOffset={offsetMinutes(zone, new Date(dose.scheduledAt))}
              bodyOffset={bodyOffset}
              planning={planning}
              onTaken={() => act(dose, "taken")}
              onSnooze={() => act(dose, "snoozed")}
              onSkip={() => act(dose, "skipped")}
              onEdit={() => onEdit(dose.medicineId)}
              now={now}
            />
          ))}
        </Section>
      ) : null}

      {laterRest.length > 0 ? (
        <Section title="Later">
          {laterRest.map((dose) => (
            <button
              key={dose.key}
              type="button"
              onClick={() => onEdit(dose.medicineId)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block font-display text-2xl font-medium tabular-nums">{dose.localLabel}</span>
                <span className="block text-sm text-subtle tabular-nums">{dayKeyInZone(new Date(dose.scheduledAt), HOME_TZ) < dayKey ? `${dose.ukLabel} London, the day before` : `${dose.ukLabel} London`}</span>
                <span className="mt-1 block text-sm font-medium">{dose.name}</span>
                <span className="mt-1 block text-sm text-subtle">
                  {FOOD_LABEL[dose.food]} · {WATER_LABEL[dose.water]}
                  {dose.movedFrom ? ` · moved from ${dose.movedFrom}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm text-subtle">
                <span className="block">{MODE_LABEL[dose.mode]}</span>
                <span className="mt-1 block tabular-nums">{countdown(new Date(dose.scheduledAt), now)}</span>
              </span>
            </button>
          ))}
        </Section>
      ) : null}

      {earlier.length > 0 ? (
        <Section title="Earlier">
          {earlier.map((dose) => (
            <DoseCard
              key={dose.key}
              dose={dose}
              dayKey={dayKey}
              zoneOffset={offsetMinutes(zone, new Date(dose.scheduledAt))}
              bodyOffset={bodyOffset}
              planning={planning}
              onTaken={() => act(dose, "taken")}
              onSnooze={() => act(dose, "snoozed")}
              onSkip={() => act(dose, "skipped")}
              onEdit={() => onEdit(dose.medicineId)}
              now={now}
            />
          ))}
        </Section>
      ) : null}

      <Note>
        Not medical advice. Ask your pharmacist or GP before you travel, especially for time-critical medicines.
        Meridian only reminds you.
      </Note>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-medium text-subtle">{title}</h2>
      {children}
    </section>
  );
}

function DoseCard({
  dose,
  prominent,
  dayKey,
  zoneOffset,
  bodyOffset,
  planning,
  now,
  onMode,
  onTaken,
  onSnooze,
  onSkip,
  onEdit,
}: {
  dose: DoseView;
  prominent?: boolean;
  dayKey?: string;
  zoneOffset: number;
  bodyOffset: number;
  planning: boolean;
  now: Date;
  onMode?: (mode: ClockMode) => void;
  onTaken: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  onEdit: () => void;
}) {
  const stateLabel =
    dose.state === "due"
      ? "Due now"
      : dose.state === "overdue"
        ? "Overdue"
        : dose.state === "upcoming"
          ? "Coming up"
          : dose.state === "snoozed"
            ? "Snoozed"
            : dose.state === "taken"
              ? "Taken"
              : dose.state === "skipped"
                ? "Skipped"
                : dose.state === "missed"
                  ? "Missed"
                  : prominent
                    ? "Next"
                    : "Later";
  const urgent = dose.state === "due" || dose.state === "overdue";
  const FoodIcon = dose.food === "empty" ? UtensilsCrossed : Utensils;
  const gap = gapLabel(dose.gapHours, useMeridian.getState().shiftMinutesPerDay);
  const gapExpected = gapIsExpected(dose.gapHours, useMeridian.getState().shiftMinutesPerDay);
  const when =
    dose.state === "snoozed" && dose.snoozeUntil
      ? `back ${countdown(new Date(dose.snoozeUntil), now)}`
      : countdown(new Date(dose.scheduledAt), now);
  const londonDay = dayKeyInZone(new Date(dose.scheduledAt), HOME_TZ);
  const londonWhen =
    dayKey && londonDay < dayKey
      ? `${dose.ukLabel} London, the day before`
      : dayKey && londonDay > dayKey
        ? `${dose.ukLabel} London, the next day`
        : `${dose.ukLabel} London`;

  return (
    <article className={`rounded-xl border border-line bg-surface p-4 ${urgent ? "due-live" : ""}`}>
      <div>
        <p className={`font-display tabular-nums tracking-tight ${prominent ? "text-6xl" : "text-2xl"} font-medium`}>{dose.localLabel}</p>
        <p className={`tabular-nums text-subtle ${prominent ? "text-lg" : "text-sm"}`}>{londonWhen}</p>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-medium">{dose.name}</h3>
        <p className={`text-sm tabular-nums ${urgent ? "text-danger" : "text-subtle"}`}>{stateLabel}</p>
      </div>
      <p className="text-sm text-muted">{dose.dose}</p>
      {prominent && onMode ? (
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Clock">
          {(
            [
              ["ease", "Ease"],
              ["uk", "UK"],
              ["local", "Jump"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={dose.mode === mode}
              className={`min-h-11 rounded-md border text-sm ${dose.mode === mode ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface"}`}
              onClick={() => onMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="mt-3 grid gap-2 text-sm">
        <li className="flex items-center gap-2">
          <FoodIcon className="size-4 shrink-0" aria-hidden="true" />
          {FOOD_LABEL[dose.food]}
        </li>
        <li className="flex items-center gap-2">
          <GlassWater className="size-4 shrink-0" aria-hidden="true" />
          {WATER_LABEL[dose.water]}
        </li>
      </ul>
      {dose.notes ? <p className="mt-3 text-sm">{dose.notes}</p> : null}
      {dose.movedFrom ? (
        <p className="mt-3 text-sm text-subtle">Moved from {dose.movedFrom}. Asleep until 06:00.</p>
      ) : null}
      {dose.mode === "ease" ? null : (
        <p className="mt-3 text-sm text-subtle">
          {dose.mode === "uk" ? clockLine(dose, zoneOffset, bodyOffset) : `${MODE_LABEL[dose.mode]} · ${clockLine(dose, zoneOffset, bodyOffset)}`}
        </p>
      )}
      {!planning && dose.state !== "taken" && dose.state !== "skipped" ? <p className="text-sm text-subtle tabular-nums">{when}</p> : null}
      {gap ? <p className={`mt-2 text-sm ${gapExpected ? "text-subtle" : "text-danger"}`}>{gap}</p> : null}
      {!planning && dose.state !== "taken" && dose.state !== "skipped" ? (
        dose.state === "later" ? (
          <Button className="mt-4" variant="quiet" onClick={onTaken}>
            I've taken it
          </Button>
        ) : (
          <div className="mt-4 grid gap-2">
            <Button onClick={onTaken}>I've taken it</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="quiet" onClick={onSnooze}>
                Snooze 15 min
              </Button>
              <Button variant="quiet" onClick={onSkip}>
                Skip
              </Button>
            </div>
          </div>
        )
      ) : null}
      <button type="button" className="mt-3 inline-flex min-h-11 items-center text-sm text-subtle" onClick={onEdit}>
        Edit medicine
      </button>
    </article>
  );
}
