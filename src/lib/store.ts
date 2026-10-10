import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BodyClock, Leg, LogEntry, Medicine, ZoneChoice } from "./schedule";
import { shiftLegs, slideHoliday, validateLegs, zoneForInstant } from "./schedule";
import { buildSample } from "./sample";
import { HOME_TZ, dayKeyInZone, localDayBounds, offsetMinutes, shiftDayKey, zonedTimeToUtc } from "./time";

export type WizardStop = { place: string; from: string };

export type Wallet = {
  name: string;
  conditions: string;
  clinic: string;
  emergency: string;
  insurance: string;
};

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
  kitSavedAt: string | null;
  wallet: Wallet;
  wizardStops: WizardStop[];
  wizardStep: "medicines" | "trip";
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
  setWallet: (wallet: Wallet) => void;
  setWizardStops: (stops: WizardStop[]) => void;
  setWizardStep: (step: "medicines" | "trip") => void;
};

const emptyClock = (now: Date): BodyClock => ({
  offsetMinutes: offsetMinutes(HOME_TZ, now),
  asOf: now.toISOString(),
});

const emptyWallet = (): Wallet => ({
  name: "",
  conditions: "",
  clinic: "",
  emergency: "",
  insurance: "",
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
  kitSavedAt: null,
  wallet: emptyWallet(),
  wizardStops: [],
  wizardStep: "medicines",
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
          kitSavedAt: new Date().toISOString(),
        });
      },
      clearAll: (now) =>
        set({
          medicines: [],
          legs: [],
          logs: [],
          bodyClock: emptyClock(now),
          shiftMinutesPerDay: 60,
          leadMinutes: 15,
          zoneChoice: { source: "journey" },
          seeded: true,
          sampleNote: false,
          holidayStart: null,
          holidayEnd: null,
          wizardDone: false,
          kitSavedAt: null,
          wallet: emptyWallet(),
          wizardStops: [],
          wizardStep: "medicines",
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
        const parts = state.holidayStart?.split("-").map(Number);
        const anchor =
          parts && parts.length === 3
            ? zonedTimeToUtc(HOME_TZ, parts[0], parts[1], parts[2], 8, 0)
            : now;
        set({
          bodyClock: { offsetMinutes: offsetMinutes(HOME_TZ, anchor), asOf: anchor.toISOString() },
          shiftMinutesPerDay: 60,
          easeRev: 2,
        });
      },
      setHoliday: (start, end) =>
        set((state) => {
          const slid = slideHoliday(state.holidayStart, state.holidayEnd, start, end);
          let legs = shiftLegs(state.legs, slid.delta);
          if (slid.delta === 0 && state.holidayEnd && slid.end && state.holidayEnd !== slid.end) {
            const previousEnd = state.holidayEnd;
            legs = legs.map((leg) => {
              if (leg.depart.slice(0, 10) !== previousEnd) return leg;
              if (slid.end! < leg.arrive.slice(0, 10)) return leg;
              return { ...leg, depart: `${slid.end}${leg.depart.slice(10)}` };
            });
          }
          const wizardStops = slid.delta === 0 ? state.wizardStops : state.wizardStops.map((stop) => ({ ...stop, from: shiftDayKey(stop.from, slid.delta) }));
          return {
            holidayStart: slid.start,
            holidayEnd: slid.end,
            sampleNote: false,
            legs,
            wizardStops,
          };
        }),
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
          kitSavedAt: null,
          zoneChoice: { source: "journey" },
        });
      },
      finishWizard: () =>
        set((state) => ({
          wizardDone: true,
          seeded: true,
          sampleNote: false,
          kitSavedAt: state.kitSavedAt ?? new Date().toISOString(),
        })),
      setWallet: (wallet) => set({ wallet }),
      setWizardStops: (wizardStops) => set({ wizardStops }),
      setWizardStep: (wizardStep) => set({ wizardStep }),
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
        kitSavedAt: state.kitSavedAt,
        wallet: state.wallet,
        wizardStops: state.wizardStops ?? [],
        wizardStep: state.wizardStep ?? "medicines",
      }),
      version: 2,
      migrate: (persisted) => {
        const state = persisted as MeridianData;
        if (state.wizardDone && !state.kitSavedAt) state.kitSavedAt = new Date().toISOString();
        return state;
      },
    },
  ),
);
