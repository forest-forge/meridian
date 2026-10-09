import { useEffect, useMemo, useState } from "react";
import { PLACES } from "@/lib/places";
import {
  holidayError,
  holidayLength,
  type ClockMode,
  type FoodRule,
  type Leg,
  type Medicine,
  type WaterRule,
  type ZoneChoice,
} from "@/lib/schedule";
import { useMeridian } from "@/lib/store";
import { allTimeZones, cityFromZone, formatDayKey, formatWallInput, offsetOnDay } from "@/lib/time";
import { Button, Choice, Field, Note, Sheet, TextArea, TextInput } from "./ui";

function blankMedicine(): Medicine {
  return {
    id: crypto.randomUUID(),
    name: "",
    dose: "",
    times: ["08:00"],
    food: "either",
    water: "full",
    notes: "",
    mode: "uk",
    active: true,
    startDate: null,
    endDate: null,
    holdTime: false,
    tablets: null,
  };
}

export function MedicineEditor({
  initial,
  onClose,
}: {
  initial: Medicine | null;
  onClose: () => void;
}) {
  const saveMedicine = useMeridian((s) => s.saveMedicine);
  const deleteMedicine = useMeridian((s) => s.deleteMedicine);
  const [draft, setDraft] = useState<Medicine>(initial ?? blankMedicine());
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    const name = draft.name.trim();
    if (!name) {
      setError("Give the medicine a name you will recognise.");
      return;
    }
    const dose = draft.dose.trim();
    if (!dose) {
      setError("Enter the dosage, such as 10 mg or 1 tablet.");
      return;
    }
    const times = [...new Set(draft.times.map((time) => time.trim()).filter(Boolean))].sort();
    if (times.length === 0 || times.some((time) => !/^\d{2}:\d{2}$/.test(time))) {
      setError("Add at least one time, using the 24-hour clock.");
      return;
    }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      setError("The end date has to be after the start.");
      return;
    }
    saveMedicine({
      ...draft,
      name,
      dose,
      times,
      notes: draft.notes.trim(),
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
    });
    onClose();
  }

  return (
    <Sheet title={initial ? "Edit medicine" : "Add medicine"} onClose={onClose}>
      <Field label="Name" hint="The name on the box.">
        <TextInput
          autoFocus
          value={draft.name}
          placeholder="Ramipril"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field label="Dosage" hint="How much you take each time.">
        <TextInput
          value={draft.dose}
          placeholder="10 mg"
          onChange={(event) => setDraft({ ...draft, dose: event.target.value })}
        />
      </Field>
      <Field label="Tablets in the pack" hint="Used to warn when the pack runs out.">
        <TextInput
          inputMode="numeric"
          value={draft.tablets ?? ""}
          placeholder="42"
          onChange={(event) => setDraft({ ...draft, tablets: event.target.value ? Number(event.target.value.replace(/[^\d]/g, "")) : null })}
        />
      </Field>
      <button
        type="button"
        aria-pressed={Boolean(draft.holdTime)}
        className={`min-h-11 rounded-md border px-3 text-left text-sm ${draft.holdTime ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface"}`}
        onClick={() => setDraft({ ...draft, holdTime: !draft.holdTime })}
      >
        {draft.holdTime ? "Hold this time. Do not move it for sleep." : "Move to 06:00 if it lands while asleep."}
      </button>
      <fieldset>
        <legend className="text-sm font-medium">Times</legend>
        <p className="mt-1 text-sm text-subtle">24-hour clock. Add every time you take it in a day.</p>
        <div className="mt-2 grid gap-2">
          {draft.times.map((time, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="time"
                aria-label={`Time ${index + 1}`}
                value={time}
                className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-base"
                onChange={(event) => {
                  const times = [...draft.times];
                  times[index] = event.target.value;
                  setDraft({ ...draft, times });
                }}
              />
              <Button
                variant="quiet"
                disabled={draft.times.length === 1}
                onClick={() => setDraft({ ...draft, times: draft.times.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          className="mt-2"
          variant="quiet"
          onClick={() => setDraft({ ...draft, times: [...draft.times, "12:00"] })}
        >
          Add another time
        </Button>
      </fieldset>
      <Choice<FoodRule>
        legend="Food"
        value={draft.food}
        onChange={(food) => setDraft({ ...draft, food })}
        options={[
          { value: "with-food", label: "With food", hint: "Take it with a meal or a snack. The reminder will say so." },
          { value: "empty", label: "Empty stomach", hint: "Take it before food. Many of these say to wait before you eat. Check the packet." },
          { value: "either", label: "Food doesn't matter", hint: "You can take it with food or without." },
        ]}
      />
      <Choice<WaterRule>
        legend="Water"
        value={draft.water}
        onChange={(water) => setDraft({ ...draft, water })}
        options={[
          { value: "full", label: "Full glass of water", hint: "Swallow with a full glass. Some tablets need that so they go down properly." },
          { value: "sip", label: "A sip of water", hint: "Just enough to swallow it." },
          { value: "none", label: "No water", hint: "The packet says not to drink with it." },
          { value: "either", label: "Water doesn't matter", hint: "With water or without is fine." },
        ]}
      />
      <Choice<ClockMode>
        legend="Which clock"
        value={draft.mode}
        onChange={(mode) => setDraft({ ...draft, mode })}
        options={[
          {
            value: "uk",
            label: "UK clock",
            hint: "Always this time in the UK. The gap stays about 24 hours.",
          },
          {
            value: "local",
            label: "Local time",
            hint: "This time wherever you are. It jumps when the time zone changes.",
          },
          {
            value: "ease",
            label: "Ease across",
            hint: "Starts on UK time, then walks toward local time a little each day.",
          },
        ]}
      />
      <Field label="Note" hint="Optional. Shown on the reminder.">
        <TextArea
          rows={3}
          value={draft.notes}
          placeholder="Wait 30 minutes before food"
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        />
      </Field>
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-line bg-surface px-3">
        <span className="text-sm font-medium">Remind me</span>
        <input
          type="checkbox"
          className="size-5"
          checked={draft.active}
          onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button onClick={save}>Save medicine</Button>
      {initial ? (
        confirmDelete ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" onClick={() => { deleteMedicine(initial.id); onClose(); }}>
              Confirm delete
            </Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete medicine
          </Button>
        )
      ) : null}
    </Sheet>
  );
}

export function HolidayDates() {
  const start = useMeridian((s) => s.holidayStart);
  const end = useMeridian((s) => s.holidayEnd);
  const setHoliday = useMeridian((s) => s.setHoliday);
  const error = holidayError(start, end);
  const days = start && end && !error ? holidayLength(start, end) : null;

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h2 className="text-base font-medium">Holiday</h2>
        <p className="mt-1 text-sm text-subtle">The day you leave and the day you get home. Up to 3 months.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start">
          <TextInput
            type="date"
            value={start ?? ""}
            onChange={(event) => setHoliday(event.target.value || null, end)}
          />
        </Field>
        <Field label="Finish">
          <TextInput
            type="date"
            value={end ?? ""}
            onChange={(event) => setHoliday(start, event.target.value || null)}
          />
        </Field>
      </div>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : days ? (
        <p className="text-sm text-muted">
          {days} day{days === 1 ? "" : "s"}, {formatDayKey(start!)} to {formatDayKey(end!)}. Before you leave and after you are home, doses stay on UK time.
        </p>
      ) : (
        <p className="text-sm text-muted">Leave these blank to be reminded every day.</p>
      )}
    </div>
  );
}

function blankLeg(now: Date): Leg {
  const timeZone = "Europe/Paris";
  const arrive = new Date(now.getTime() + 86_400_000);
  const depart = new Date(now.getTime() + 8 * 86_400_000);
  return {
    id: crypto.randomUUID(),
    place: "",
    timeZone,
    arrive: formatWallInput(timeZone, arrive),
    depart: formatWallInput(timeZone, depart),
  };
}

export function LegEditor({
  initial,
  now,
  onClose,
}: {
  initial: Leg | null;
  now: Date;
  onClose: () => void;
}) {
  const saveLeg = useMeridian((s) => s.saveLeg);
  const deleteLeg = useMeridian((s) => s.deleteLeg);
  const [draft, setDraft] = useState<Leg>(initial ?? blankLeg(now));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zones = useMemo(() => {
    const all = allTimeZones();
    const q = query.trim().toLowerCase().replace(/\s+/g, "_");
    const list = q ? all.filter((zone) => zone.toLowerCase().includes(q)) : all.filter((zone) => zone === draft.timeZone);
    const unique = [...new Set(q ? list : [draft.timeZone, ...list])];
    return unique.slice(0, 40);
  }, [query, draft.timeZone]);

  function save() {
    const result = saveLeg({ ...draft, place: draft.place.trim() });
    if (result) {
      setError(result);
      return;
    }
    onClose();
  }

  return (
    <Sheet title={initial ? "Edit stop" : "Add stop"} onClose={onClose}>
      <Field label="Place">
        <TextInput
          autoFocus
          value={draft.place}
          placeholder="Singapore"
          onChange={(event) => setDraft({ ...draft, place: event.target.value })}
        />
      </Field>
      <div>
        <p className="text-sm font-medium">Common from the UK</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {PLACES.map((place) => (
            <button
              key={place.place}
              type="button"
              className="min-h-11 shrink-0 rounded-full border border-line bg-surface px-3 text-sm"
              onClick={() => setDraft({ ...draft, place: place.place, timeZone: place.timeZone })}
            >
              {place.place} {offsetOnDay(place.timeZone, draft.arrive.slice(0, 10), now)}
            </button>
          ))}
        </div>
      </div>
      <Field label="Time zone" hint={cityFromZone(draft.timeZone)}>
        <TextInput
          value={query}
          placeholder="Search time zones"
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      <div className="max-h-48 overflow-y-auto rounded-md border border-line bg-surface">
        {zones.map((zone) => (
          <button
            key={zone}
            type="button"
            className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm ${zone === draft.timeZone ? "bg-surface-2" : ""}`}
            onClick={() => setDraft({ ...draft, timeZone: zone })}
          >
            <span className="truncate">{zone.replace(/_/g, " ")}</span>
            <span className="shrink-0 text-subtle tabular-nums">
              {offsetOnDay(zone, draft.arrive.slice(0, 10), now)}
            </span>
          </button>
        ))}
      </div>
      <Field label="Arrive" hint="Local time at this stop.">
        <TextInput
          type="datetime-local"
          value={draft.arrive}
          onChange={(event) => setDraft({ ...draft, arrive: event.target.value })}
        />
      </Field>
      <Field label="Leave">
        <TextInput
          type="datetime-local"
          value={draft.depart}
          onChange={(event) => setDraft({ ...draft, depart: event.target.value })}
        />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button onClick={save}>Save stop</Button>
      {initial ? (
        confirmDelete ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" onClick={() => { deleteLeg(initial.id); onClose(); }}>
              Confirm delete
            </Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete stop
          </Button>
        )
      ) : null}
      <Note>The whole holiday, first arrival to last departure, can be up to 3 months.</Note>
    </Sheet>
  );
}

export function SettingsSheet({
  now,
  onClose,
}: {
  now: Date;
  phoneTz: string;
  onClose: () => void;
}) {
  const shift = useMeridian((s) => s.shiftMinutesPerDay);
  const lead = useMeridian((s) => s.leadMinutes);
  const sound = useMeridian((s) => s.sound);
  const setShift = useMeridian((s) => s.setShift);
  const setLead = useMeridian((s) => s.setLead);
  const setSound = useMeridian((s) => s.setSound);
  const loadSample = useMeridian((s) => s.loadSample);
  const clearAll = useMeridian((s) => s.clearAll);
  const [perm, setPerm] = useState<string>("default");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") setPerm("unsupported");
    else setPerm(Notification.permission);
  }, []);

  return (
    <Sheet title="Reminders" onClose={onClose}>
      <Choice
        legend="Remind me before"
        value={String(lead)}
        onChange={(value) => setLead(Number(value))}
        options={[
          { value: "0", label: "At the time" },
          { value: "5", label: "5 minutes before" },
          { value: "15", label: "15 minutes before" },
          { value: "30", label: "30 minutes before" },
        ]}
      />
      <Choice
        legend="Ease across, per day"
        value={String(shift)}
        onChange={(value) => setShift(Number(value))}
        options={[
          { value: "30", label: "30 minutes" },
          { value: "60", label: "1 hour" },
          { value: "120", label: "2 hours" },
        ]}
      />
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-line bg-surface px-3">
        <span className="text-sm font-medium">Chime while this page is open</span>
        <input type="checkbox" className="size-5" checked={sound} onChange={(event) => setSound(event.target.checked)} />
      </label>
      {perm === "granted" ? (
        <Note>Browser alerts are on. They fire while Meridian is open.</Note>
      ) : perm === "unsupported" ? (
        <Note>This browser will not show system alerts. The on-screen reminder still works.</Note>
      ) : (
        <Button
          variant="quiet"
          onClick={() => {
            if (typeof Notification === "undefined") return;
            void Notification.requestPermission().then((result) => setPerm(result));
          }}
        >
          Allow browser alerts
        </Button>
      )}
      <p className="text-sm text-muted">
        Ease starts from UK time on the day you leave, then moves by the step above once a day. Use Jump on a medicine if the whole dose should switch on arrival.
      </p>
      {confirmSample ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => {
              loadSample(now);
              onClose();
            }}
          >
            Load sample
          </Button>
          <Button variant="quiet" onClick={() => setConfirmSample(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="quiet" onClick={() => setConfirmSample(true)}>
          Load sample holiday
        </Button>
      )}
      {confirmClear ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="danger"
            onClick={() => {
              clearAll(now);
              onClose();
            }}
          >
            Clear everything
          </Button>
          <Button variant="quiet" onClick={() => setConfirmClear(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirmClear(true)}>
          Clear kit and journey
        </Button>
      )}
      <Note>
        Alerts need this page open, or the app installed and left handy. A website cannot promise a locked-screen
        alarm the way a phone clock can. Nothing here is medical advice.
      </Note>
    </Sheet>
  );
}
