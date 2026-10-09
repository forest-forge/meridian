import { useState, type ReactNode } from "react";
import { PLACES } from "@/lib/places";
import { holidayError, type FoodRule, type Medicine, type WaterRule } from "@/lib/schedule";
import { useMeridian } from "@/lib/store";
import { formatDayKey, formatWallInput, wallToUtc } from "@/lib/time";
import { cn } from "@/lib/cn";
import { Button } from "./ui";

type Draft = {
  name: string;
  dose: string;
  time: string;
  food: FoodRule | null;
  water: WaterRule | null;
};

type Stop = { place: string; from: string };

const emptyDraft = (): Draft => ({
  name: "",
  dose: "",
  time: "08:00",
  food: null,
  water: null,
});

const FOOD: Array<{ value: FoodRule; label: string }> = [
  { value: "with-food", label: "With food" },
  { value: "empty", label: "Empty" },
  { value: "either", label: "Either" },
];

const WATER: Array<{ value: WaterRule; label: string }> = [
  { value: "full", label: "Full glass" },
  { value: "sip", label: "Sip" },
  { value: "none", label: "None" },
  { value: "either", label: "Either" },
];

export function Wizard() {
  const holidayStart = useMeridian((s) => s.holidayStart);
  const holidayEnd = useMeridian((s) => s.holidayEnd);
  const setHoliday = useMeridian((s) => s.setHoliday);
  const medicines = useMeridian((s) => s.medicines);
  const saveMedicine = useMeridian((s) => s.saveMedicine);
  const deleteMedicine = useMeridian((s) => s.deleteMedicine);
  const saveLeg = useMeridian((s) => s.saveLeg);
  const deleteLeg = useMeridian((s) => s.deleteLeg);
  const finishWizard = useMeridian((s) => s.finishWizard);
  const startFromUk = useMeridian((s) => s.startFromUk);

  const [step, setStep] = useState<"medicines" | "trip">("medicines");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [stops, setStops] = useState<Stop[]>([]);
  const [place, setPlace] = useState("");
  const [from, setFrom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dateError = holidayError(holidayStart, holidayEnd);

  function built(): Medicine | null {
    const name = draft.name.trim();
    const dose = draft.dose.trim();
    if (!name && !dose && !draft.food && !draft.water) return null;
    if (!name || !dose || !draft.food || !draft.water || !/^\d{2}:\d{2}$/.test(draft.time)) return null;
    return {
      id: crypto.randomUUID(),
      name,
      dose,
      times: [draft.time],
      food: draft.food,
      water: draft.water,
      notes: "",
      mode: "uk",
      active: true,
      startDate: null,
      endDate: null,
    };
  }

  function formProblem(): string | null {
    const started = draft.name.trim() || draft.dose.trim() || draft.food || draft.water;
    if (!started) return medicines.length === 0 ? "Add a medicine." : null;
    if (!draft.name.trim()) return "Add the name on the packet.";
    if (!draft.dose.trim()) return "Add the dosage, such as 10 mg.";
    if (!draft.food) return "Say if it is with food.";
    if (!draft.water) return "Say if it is with water.";
    return null;
  }

  function saveCurrent(): boolean {
    const problem = formProblem();
    if (problem) {
      setError(problem);
      return false;
    }
    const medicine = built();
    if (medicine) saveMedicine(medicine);
    return true;
  }

  function addAnother() {
    if (!saveCurrent()) return;
    setDraft(emptyDraft());
    setError(null);
  }

  function next() {
    if (!saveCurrent()) return;
    setDraft(emptyDraft());
    setError(null);
    setStep("trip");
  }

  function addStop() {
    if (!holidayStart || !holidayEnd || dateError) {
      setError(dateError ?? "Add the day you leave and the day you get home.");
      return;
    }
    if (!place) {
      setError("Choose a place.");
      return;
    }
    if (!from) {
      setError("Add the day you arrive.");
      return;
    }
    if (from < holidayStart || from > holidayEnd) {
      setError("That day is outside the holiday.");
      return;
    }
    if (stops.some((stop) => stop.from === from)) {
      setError("Two places cannot start on the same day.");
      return;
    }
    setStops([...stops, { place, from }].sort((a, b) => a.from.localeCompare(b.from)));
    setPlace("");
    setFrom("");
    setError(null);
  }

  function writeStops(): string | null {
    const legs = useMeridian.getState().legs;
    for (const leg of legs) deleteLeg(leg.id);
    const end = holidayEnd;
    if (!end) return "Add the day you get home.";
    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index];
      const item = PLACES.find((entry) => entry.place === stop.place);
      if (!item) continue;
      const nextStop = stops[index + 1];
      const nextItem = nextStop ? PLACES.find((entry) => entry.place === nextStop.place) : null;
      const nextInstant = nextItem ? wallToUtc(nextItem.timeZone, `${nextStop.from}T12:00`) : null;
      const depart = nextInstant
        ? formatWallInput(item.timeZone, nextInstant)
        : stop.from === end
          ? `${end}T18:00`
          : `${end}T12:00`;
      const result = saveLeg({
        id: crypto.randomUUID(),
        place: item.place,
        timeZone: item.timeZone,
        arrive: `${stop.from}T12:00`,
        depart,
      });
      if (result) return result;
    }
    return null;
  }

  function done() {
    if (!holidayStart || !holidayEnd || dateError) {
      setError(dateError ?? "Add the day you leave and the day you get home.");
      return;
    }
    const problem = writeStops();
    if (problem) {
      setError(problem);
      return;
    }
    startFromUk(new Date());
    finishWizard();
  }

  if (step === "trip") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-3">
        <header className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl font-medium tracking-tight">Where you go</h1>
          <p className="text-xs text-subtle">Not medical advice</p>
        </header>
        <p className="mt-1 text-sm text-muted">Add each place and the day you arrive. Meridian turns your UK times into the local time there.</p>

        <div className="mt-2 grid gap-1.5">
          <div className="grid grid-cols-2 gap-2">
            <Label text="Leave">
              <input type="date" aria-label="Leave" className={control} value={holidayStart ?? ""} onChange={(event) => { setHoliday(event.target.value || null, holidayEnd); setError(null); }} />
            </Label>
            <Label text="Home">
              <input type="date" aria-label="Home" className={control} value={holidayEnd ?? ""} onChange={(event) => { setHoliday(holidayStart, event.target.value || null); setError(null); }} />
            </Label>
          </div>
          <Label text="Place">
            <select aria-label="Place" className={control} value={place} onChange={(event) => setPlace(event.target.value)}>
              <option value="">Choose</option>
              {PLACES.map((item) => (
                <option key={item.place} value={item.place}>{item.place}</option>
              ))}
            </select>
          </Label>
          <Label text="Arrive">
            <input type="date" aria-label="Arrive" className={control} value={from} onChange={(event) => setFrom(event.target.value)} />
          </Label>
          <Button variant="quiet" onClick={addStop}>Add place</Button>
          {stops.length > 0 ? (
            <ul className="grid gap-1">
              {stops.map((stop) => (
                <li key={`${stop.place}-${stop.from}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{stop.place} from {formatDayKey(stop.from)}</span>
                  <button type="button" className="min-h-11 shrink-0 text-subtle" onClick={() => setStops(stops.filter((item) => item !== stop))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">No places yet. Times stay on the UK clock.</p>
          )}
        </div>

        {error || dateError ? <p className="mt-1 text-sm text-danger">{error ?? dateError}</p> : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="quiet" onClick={() => { setError(null); setStep("medicines"); }}>Back</Button>
          <Button onClick={done}>Done</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-3">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-medium tracking-tight">UK times</h1>
        <p className="text-xs text-subtle">Not medical advice</p>
      </header>
      <p className="mt-1 text-sm text-muted">When you take each medicine at home. The holiday comes next.</p>

      <div className="mt-2 grid gap-1.5">
        {medicines.length > 0 ? (
          <ul className="grid gap-1">
            {medicines.map((medicine) => (
              <li key={medicine.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{medicine.name} {medicine.dose} · {medicine.times[0]}</span>
                <button type="button" className="min-h-11 shrink-0 text-subtle" onClick={() => deleteMedicine(medicine.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Label text="Name">
            <input aria-label="Name" className={control} placeholder="Ramipril" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Label>
          <Label text="Dosage">
            <input aria-label="Dosage" className={control} placeholder="10 mg" value={draft.dose} onChange={(event) => setDraft({ ...draft, dose: event.target.value })} />
          </Label>
        </div>
        <Label text="Time at home">
          <input type="time" aria-label="Time at home" className={control} value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
        </Label>
        <Chips legend="Food" value={draft.food} options={FOOD} onChange={(food) => setDraft({ ...draft, food })} />
        <Chips legend="Water" value={draft.water} options={WATER} onChange={(water) => setDraft({ ...draft, water })} />
      </div>

      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="quiet" onClick={addAnother}>Add another</Button>
        <Button onClick={next}>Next</Button>
      </div>
    </main>
  );
}

const control = "h-11 w-full rounded-md border border-line bg-surface px-2 text-base";

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-subtle">{text}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Chips<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T | null;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-subtle">{legend}</legend>
      <div className={cn("mt-1 grid gap-1.5", options.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              className={cn(
                "min-h-11 rounded-md border px-1 text-sm",
                selected ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface",
              )}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
