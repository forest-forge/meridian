import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BodyClock, Leg, LogEntry, Medicine, ZoneChoice } from "./schedule";
import { validateLegs, zoneForInstant } from "./schedule";
import { buildSample } from "./sample";
import { HOME_TZ, dayKeyInZone, localDayBounds, offsetMinutes } from "./time";

export type MeridianData = {
  medicines: Medicine[];
  legs: Leg[];
  logs: LogEntry[];
  bodyClock: BodyClock;
  shiftMinutesPerDay: number;
  leadMinutes: number;
  sound: boolean;
  zoneChoice: ZoneChoice;
  seeded: boolean;
  sampleNote: boolean;
  easeRev: number;
  holidayStart: string | null;
  holidayEnd: string | null;
  wizardDone: boolean;
  setupRev: number;
};

type Actions = {
  loadSample: (now: Date) => void;
  clearAll: (now: Date) => void;
  dismissSampleNote: () => void;
  saveMedicine: (medicine: Medicine) => void;
  deleteMedicine: (id: string) => void;
  saveLeg: (leg: Leg) => string | null;
  deleteLeg: (id: string) => void;
  logDose: (entry: LogEntry) => void;
  setShift: (minutes: number) => void;
  setLead: (minutes: number) => void;
  setSound: (on: boolean) => void;
  setZoneChoice: (choice: ZoneChoice) => void;
  snapBody: (offsetMinutesValue: number, now: Date) => void;
  startFromUk: (now: Date) => void;
  setHoliday: (start: string | null, end: string | null) => void;
  beginSetup: () => void;
  finishWizard: () => void;
};

const emptyClock = (now: Date): BodyClock => ({
  offsetMinutes: offsetMinutes(HOME_TZ, now),
  asOf: now.toISOString(),
});

const initial = (): MeridianData => ({
  medicines: [],
  legs: [],
  logs: [],
  bodyClock: { offsetMinutes: 0, asOf: new Date(0).toISOString() },
  shiftMinutesPerDay: 60,
  leadMinutes: 15,
  sound: true,
  zoneChoice: { source: "journey" },
  seeded: false,
  sampleNote: false,
  easeRev: 0,
  holidayStart: null,
  holidayEnd: null,
  wizardDone: false,
  setupRev: 0,
});

export const useMeridian = create<MeridianData & Actions>()(
  persist(
    (set, get) => ({
      ...initial(),
      loadSample: (now) => {
        const sample = buildSample(now);
        set({
          medicines: sample.medicines,
          legs: sample.legs,
          logs: [],
          bodyClock: sample.bodyClock,
          zoneChoice: sample.zoneChoice,
          seeded: true,
          sampleNote: true,
          easeRev: 2,
          holidayStart: sample.holidayStart,
          holidayEnd: sample.holidayEnd,
          wizardDone: true,
          setupRev: 2,
        });
      },
      clearAll: (now) =>
        set({
          medicines: [],
          legs: [],
          logs: [],
          bodyClock: emptyClock(now),
          zoneChoice: { source: "phone" },
          seeded: true,
          sampleNote: false,
          holidayStart: null,
          holidayEnd: null,
          wizardDone: false,
        }),
      dismissSampleNote: () => set({ sampleNote: false }),
      saveMedicine: (medicine) =>
        set((state) => {
          const exists = state.medicines.some((item) => item.id === medicine.id);
          const medicines = exists
            ? state.medicines.map((item) => (item.id === medicine.id ? medicine : item))
            : [...state.medicines, medicine];
          return { medicines, sampleNote: false };
        }),
      deleteMedicine: (id) =>
        set((state) => ({
          medicines: state.medicines.filter((item) => item.id !== id),
          sampleNote: false,
        })),
      saveLeg: (leg) => {
        const state = get();
        const next = state.legs.some((item) => item.id === leg.id)
          ? state.legs.map((item) => (item.id === leg.id ? leg : item))
          : [...state.legs, leg];
        const error = validateLegs(next);
        if (error) return error;
        set({ legs: next, sampleNote: false });
        return null;
      },
      deleteLeg: (id) =>
        set((state) => ({
          legs: state.legs.filter((item) => item.id !== id),
          sampleNote: false,
        })),
      logDose: (entry) =>
        set((state) => ({
          logs: [entry, ...state.logs.filter((item) => item.key !== entry.key)].slice(0, 500),
        })),
      setShift: (minutes) => set({ shiftMinutesPerDay: minutes }),
      setLead: (minutes) => set({ leadMinutes: minutes }),
      setSound: (on) => set({ sound: on }),
      setZoneChoice: (choice) => set({ zoneChoice: choice }),
      snapBody: (offsetMinutesValue, now) =>
        set({ bodyClock: { offsetMinutes: offsetMinutesValue, asOf: now.toISOString() }, easeRev: 2 }),
      startFromUk: (now) => {
        const state = get();
        const zone = zoneForInstant(state.legs, now, state.zoneChoice, HOME_TZ);
        const end = localDayBounds(dayKeyInZone(now, zone), zone)?.end ?? now;
        const anchor = end.getTime() > now.getTime() ? end : now;
        set({
          bodyClock: { offsetMinutes: offsetMinutes(HOME_TZ, now), asOf: anchor.toISOString() },
          easeRev: 2,
        });
      },
      setHoliday: (start, end) => set({ holidayStart: start, holidayEnd: end, sampleNote: false }),
      beginSetup: () => {
        const state = get();
        if ((state.setupRev ?? 0) >= 2) return;
        set({
          medicines: [],
          legs: [],
          logs: [],
          holidayStart: null,
          holidayEnd: null,
          sampleNote: false,
          seeded: true,
          wizardDone: false,
          setupRev: 2,
          zoneChoice: { source: "journey" },
        });
      },
      finishWizard: () => set({ wizardDone: true, seeded: true, sampleNote: false }),
    }),
    {
      name: "meridian-v1",
      skipHydration: true,
      partialize: (state) => ({
        medicines: state.medicines,
        legs: state.legs,
        logs: state.logs,
        bodyClock: state.bodyClock,
        shiftMinutesPerDay: state.shiftMinutesPerDay,
        leadMinutes: state.leadMinutes,
        sound: state.sound,
        zoneChoice: state.zoneChoice,
        seeded: state.seeded,
        sampleNote: state.sampleNote,
        easeRev: state.easeRev,
        holidayStart: state.holidayStart,
        holidayEnd: state.holidayEnd,
        wizardDone: state.wizardDone,
        setupRev: state.setupRev,
      }),
    },
  ),
);
