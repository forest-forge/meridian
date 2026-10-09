import type { BodyClock, Leg, Medicine, ZoneChoice } from "./schedule.ts";
import { HOME_TZ, dayKeyInZone, formatWallInput, localDayBounds, offsetMinutes } from "./time.ts";

const DAY = 86_400_000;

export type SampleBundle = {
  medicines: Medicine[];
  legs: Leg[];
  bodyClock: BodyClock;
  zoneChoice: ZoneChoice;
  holidayStart: string;
  holidayEnd: string;
};

export function buildSample(now: Date): SampleBundle {
  const t = now.getTime();
  const dubaiArrive = new Date(t - 16 * DAY);
  const dubaiDepart = new Date(t - 9 * DAY);
  const singArrive = new Date(dubaiDepart.getTime() + 60 * 60_000);
  const singDepart = new Date(t + 6 * DAY);
  const sydArrive = new Date(singDepart.getTime() + 60 * 60_000);
  const sydDepart = new Date(t + 28 * DAY);

  const legs: Leg[] = [
    {
      id: "leg-dubai",
      place: "Dubai",
      timeZone: "Asia/Dubai",
      arrive: formatWallInput("Asia/Dubai", dubaiArrive),
      depart: formatWallInput("Asia/Dubai", dubaiDepart),
    },
    {
      id: "leg-singapore",
      place: "Singapore",
      timeZone: "Asia/Singapore",
      arrive: formatWallInput("Asia/Singapore", singArrive),
      depart: formatWallInput("Asia/Singapore", singDepart),
    },
    {
      id: "leg-sydney",
      place: "Sydney",
      timeZone: "Australia/Sydney",
      arrive: formatWallInput("Australia/Sydney", sydArrive),
      depart: formatWallInput("Australia/Sydney", sydDepart),
    },
  ];

  const medicines: Medicine[] = [
    {
      id: "med-morning",
      name: "Morning tablet",
      dose: "1 tablet",
      times: ["08:00"],
      food: "either",
      water: "full",
      notes: "Example. Stays on UK time so the gap stays 24 hours.",
      mode: "uk",
      active: true,
      startDate: null,
      endDate: null,
    },
    {
      id: "med-meals",
      name: "Meal capsule",
      dose: "1 capsule",
      times: ["08:00", "19:00"],
      food: "with-food",
      water: "full",
      notes: "Example. Follows local mealtimes.",
      mode: "local",
      active: true,
      startDate: null,
      endDate: null,
    },
    {
      id: "med-empty",
      name: "Empty-stomach tablet",
      dose: "1 tablet",
      times: ["07:00"],
      food: "empty",
      water: "full",
      notes: "Example. Starts on UK time, then shifts toward local time.",
      mode: "ease",
      active: true,
      startDate: null,
      endDate: null,
    },
  ];

  const here = "Asia/Singapore";
  const todayEnd = localDayBounds(dayKeyInZone(now, here), here)?.end ?? now;
  const bodyClock: BodyClock = {
    offsetMinutes: offsetMinutes(HOME_TZ, now),
    asOf: todayEnd.toISOString(),
  };

  return {
    medicines,
    legs,
    bodyClock,
    zoneChoice: { source: "journey" },
    holidayStart: dayKeyInZone(dubaiArrive, "Asia/Dubai"),
    holidayEnd: dayKeyInZone(sydDepart, "Australia/Sydney"),
  };
}
