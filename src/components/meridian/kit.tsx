import { FOOD_LABEL, MODE_LABEL, WATER_LABEL, type Medicine } from "@/lib/schedule";
import { useMeridian } from "@/lib/store";
import { HolidayDates } from "./editors";
import { Button } from "./ui";

export function Kit({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const medicines = useMeridian((s) => s.medicines);

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Kit</h1>
          <p className="mt-1 text-sm text-subtle">Add each medicine by name and dosage.</p>
        </div>
      </div>
      <HolidayDates />
      {medicines.length === 0 ? (
        <p className="text-sm text-muted">Nothing in the kit yet.</p>
      ) : (
        <ul className="grid gap-3">
          {medicines.map((medicine) => (
            <li key={medicine.id}>
              <MedicineRow medicine={medicine} onEdit={() => onEdit(medicine.id)} />
            </li>
          ))}
        </ul>
      )}
      <Button onClick={onAdd}>Add medicine</Button>
    </div>
  );
}

function MedicineRow({ medicine, onEdit }: { medicine: Medicine; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full rounded-xl border border-line bg-surface p-4 text-left"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">{medicine.name}</h2>
        <span className="text-sm text-subtle">{medicine.active ? MODE_LABEL[medicine.mode] : "Paused"}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{medicine.dose}</p>
      <p className="mt-1 text-sm text-subtle">{medicine.times.join(", ")}</p>
      <p className="mt-2 text-sm text-subtle">
        {FOOD_LABEL[medicine.food]} · {WATER_LABEL[medicine.water]}
      </p>
    </button>
  );
}
