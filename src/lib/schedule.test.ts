import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSample } from "./sample.ts";
import {
  clockLine,
  easeNote,
  gapLabel,
  holidayError,
  holidayLength,
  legAt,
  liveAgenda,
  placeLabel,
  scheduleZoneForDay,
  shiftLegs,
  slideHoliday,
  stopLengthDays,
  tripSpanDays,
  validateLegs,
  zoneForInstant,
  type Medicine,
} from "./schedule.ts";
import { HOME_TZ, formatDayKey, pairedClock, phoneZoneName, ukOffsetLabel, zoneAbbrev, zonedTimeToUtc } from "./time.ts";

describe("time zones", () => {
  it("converts a UK morning in BST to UTC", () => {
    const at = zonedTimeToUtc(HOME_TZ, 2026, 10, 8, 8, 0);
    assert.equal(at.toISOString(), "2026-10-08T07:00:00.000Z");
  });

  it("converts Singapore wall time to UTC", () => {
    const at = zonedTimeToUtc("Asia/Singapore", 2026, 10, 9, 8, 0);
    assert.equal(at.toISOString(), "2026-10-09T00:00:00.000Z");
  });
});

describe("offsets from the UK", () => {
  it("uses the day, not a fixed GMT label", () => {
    const august = zonedTimeToUtc("Europe/Paris", 2026, 8, 2, 12, 0);
    const november = zonedTimeToUtc("Europe/Paris", 2026, 11, 2, 12, 0);
    // Paris and London both change clocks, so Paris stays +1 in August and November.
    assert.equal(ukOffsetLabel("Europe/Paris", august), "+1");
    assert.equal(ukOffsetLabel("Europe/Paris", november), "+1");
    assert.equal(ukOffsetLabel("Europe/Istanbul", august), "+2");
    assert.equal(ukOffsetLabel("Europe/Istanbul", november), "+3");
    assert.equal(ukOffsetLabel("Asia/Dubai", august), "+3");
    assert.equal(ukOffsetLabel("Asia/Dubai", november), "+4");
    assert.equal(ukOffsetLabel("Asia/Kolkata", august), "+4:30");
    assert.equal(ukOffsetLabel("Asia/Kolkata", november), "+5:30");
  });

  it("keeps the header clocks apart by that day's offset", () => {
    const now = new Date("2026-10-09T20:46:00.000Z");
    const same = pairedClock(now, 0);
    assert.equal(same.uk, "21:46");
    assert.equal(same.here, "21:46");
    const paris = pairedClock(now, 60);
    assert.equal(paris.uk, "21:46");
    assert.equal(paris.here, "22:46");
  });

  it("counts 2 Nov to 16 Nov as 15 days on the holiday and the stop", () => {
    assert.equal(holidayLength("2026-11-02", "2026-11-16"), 15);
    assert.equal(holidayLength("2026-08-02", "2026-08-16"), 15);
    assert.equal(
      stopLengthDays({ id: "paris", place: "Paris", timeZone: "Europe/Paris", arrive: "2026-11-02T12:00", depart: "2026-11-16T18:00" }),
      15,
    );
    assert.equal(formatDayKey("2026-11-29"), "29 Nov 2026");
  });

  it("slides every stop when only the start date changes, and keeps the clock time", () => {
    const paris = { id: "paris", place: "Paris", timeZone: "Europe/Paris", arrive: "2026-11-02T12:00", depart: "2026-11-16T12:00" };
    const slid = slideHoliday("2026-11-02", "2026-11-16", "2026-08-02", "2026-11-16");
    assert.equal(slid.start, "2026-08-02");
    assert.equal(slid.end, "2026-08-16");
    const legs = shiftLegs([paris], slid.delta);
    assert.equal(legs[0]?.arrive, "2026-08-02T12:00");
    assert.equal(legs[0]?.depart, "2026-08-16T12:00");
    assert.equal(stopLengthDays(legs[0]!), 15);
    assert.notEqual(legs[0]?.arrive.slice(0, 10), legs[0]?.depart.slice(0, 10));
    const noon = zonedTimeToUtc("Europe/Paris", 2026, 8, 2, 12, 0);
    assert.equal(ukOffsetLabel("Europe/Paris", noon), "+1");
  });

  it("does not call a BST phone UTC", () => {
    const now = new Date("2026-10-09T20:46:00.000Z");
    assert.equal(zoneAbbrev(now, "Europe/London"), "BST");
    assert.equal(phoneZoneName("UTC"), "Europe/London");
    assert.equal(phoneZoneName("Europe/Paris"), "Europe/Paris");
    assert.notEqual(zoneAbbrev(now, phoneZoneName("UTC")), "UTC");
  });
});

describe("ease from the leave date", () => {
  const zone = "Europe/Paris";
  const legs = [
    { id: "paris", place: "Paris", timeZone: zone, arrive: "2026-11-02T18:00", depart: "2026-11-16T18:00" },
  ];
  const zoneForDay = (key: string) => scheduleZoneForDay(key, legs, { source: "journey" });
  const medicine: Medicine = {
    id: "ramipril",
    name: "Ramipril",
    dose: "5 mg",
    times: ["08:00"],
    food: "either",
    water: "either",
    notes: "",
    mode: "ease",
    active: true,
    startDate: null,
    endDate: null,
  };

  function day(dayKey: string, mode: Medicine["mode"] = "ease", step = 60) {
    return liveAgenda({
      medicines: [{ ...medicine, mode }],
      dayKey,
      labelZone: zone,
      zoneForDay,
      now: new Date("2026-10-09T08:00:00.000Z"),
      leadMinutes: 0,
      logs: [],
      clock: { offsetMinutes: 0, asOf: "2026-09-01T00:00:00.000Z" },
      shiftMinutesPerDay: step,
      targetAt: () => 0,
      carryover: true,
      holidayStart: "2026-11-02",
      holidayEnd: "2026-11-16",
    });
  }

  it("stays on UK time before the trip, even if the journey was saved earlier", () => {
    const dose = day("2026-10-09").doses.find((item) => item.medicineId === "ramipril");
    assert.ok(dose);
    assert.equal(dose.ukLabel, "08:00");
    assert.equal(dose.localLabel, "08:00");
    assert.match(clockLine(dose), /nothing is shifting/);
    const note = easeNote("2026-10-09", "2026-11-02", "2026-11-16", 60, zoneForDay, "United Kingdom");
    assert.match(note, /Nothing is shifting/);
    assert.doesNotMatch(note, /behind/);
  });

  it("stays on London time on the leave day and does not jump yet", () => {
    const dose = day("2026-11-02").doses.find((item) => item.medicineId === "ramipril");
    assert.ok(dose);
    assert.equal(dose.ukLabel, "08:00");
    assert.equal(dose.localLabel, "09:00");
    assert.equal(dose.gapHours, 24);
    assert.match(clockLine(dose), /Has not jumped yet/);
    assert.equal(gapLabel(dose.gapHours), "Gap since the previous dose: 24 hours.");
    assert.match(easeNote("2026-11-02", "2026-11-02", "2026-11-16", 60, zoneForDay, "Paris"), /Has not jumped yet/);
  });

  it("is 08:00 in Paris and 07:00 in London on 3 Nov, one step earlier", () => {
    const dose = day("2026-11-03").doses.find((item) => item.medicineId === "ramipril");
    assert.ok(dose);
    assert.equal(dose.localLabel, "08:00");
    assert.equal(dose.ukLabel, "07:00");
    assert.equal(dose.gapHours, 23);
    assert.match(clockLine(dose), /08:00 local · 07:00 London/);
    assert.equal(gapLabel(dose.gapHours), "Gap since the previous dose: 23 hours.");
  });

  it("stays on Paris time on 4 Nov, 24 hours on", () => {
    const dose = day("2026-11-04").doses.find((item) => item.medicineId === "ramipril");
    assert.ok(dose);
    assert.equal(dose.localLabel, "08:00");
    assert.equal(dose.ukLabel, "07:00");
    assert.equal(dose.gapHours, 24);
  });

  it("keeps UK doses on London time and jumps the whole dose on arrival", () => {
    const stayed = day("2026-11-03", "uk").doses[0];
    assert.equal(stayed?.ukLabel, "08:00");
    assert.equal(stayed?.localLabel, "09:00");
    const jumped = day("2026-11-02", "local").doses[0];
    assert.equal(jumped?.localLabel, "08:00");
    assert.equal(jumped?.ukLabel, "07:00");
    assert.equal(jumped?.gapHours, 23);
  });

  it("moves 30 minutes a day, starting the day after departure", () => {
    const leave = day("2026-11-02", "ease", 30).doses[0];
    const first = day("2026-11-03", "ease", 30).doses[0];
    const second = day("2026-11-04", "ease", 30).doses[0];
    const settled = day("2026-11-05", "ease", 30).doses[0];
    assert.equal(leave?.ukLabel, "08:00");
    assert.equal(leave?.localLabel, "09:00");
    assert.equal(leave?.gapHours, 24);
    assert.equal(first?.gapHours, 23.5);
    assert.equal(second?.gapHours, 23.5);
    assert.equal(settled?.localLabel, "08:00");
    assert.equal(settled?.ukLabel, "07:00");
    assert.equal(settled?.gapHours, 24);
  });

  it("is back on UK time after the home date", () => {
    const dose = day("2026-11-17").doses[0];
    assert.equal(dose?.ukLabel, "08:00");
    assert.equal(dose?.localLabel, "08:00");
    assert.match(clockLine(dose!), /nothing is shifting/);
    assert.match(easeNote("2026-11-17", "2026-11-02", "2026-11-16", 60, zoneForDay, "Paris"), /back on UK time/);
  });
});

describe("sample holiday", () => {
  const now = new Date("2026-10-08T16:11:00.000Z");
  const sample = buildSample(now);

  it("is a valid trip under three months, currently in Singapore", () => {
    assert.equal(validateLegs(sample.legs), null);
    assert.ok(tripSpanDays(sample.legs) <= 92);
    const zone = zoneForInstant(sample.legs, now, sample.zoneChoice, "UTC");
    assert.equal(zone, "Asia/Singapore");
    assert.equal(legAt(sample.legs, now)?.place, "Singapore");
    assert.equal(placeLabel(sample.legs, zone, now), "Singapore");
    assert.equal(holidayError(sample.holidayStart, sample.holidayEnd), null);
    assert.ok(holidayLength(sample.holidayStart, sample.holidayEnd) <= 92);
    assert.ok(sample.holidayStart <= "2026-10-09" && sample.holidayEnd >= "2026-10-09");
  });

  it("places UK, local, and eased doses on the Singapore day", () => {
    const zone = "Asia/Singapore";
    const { doses, carry } = liveAgenda({
      medicines: sample.medicines,
      dayKey: "2026-10-09",
      labelZone: zone,
      zoneForDay: () => zone,
      now,
      leadMinutes: 15,
      logs: [],
      clock: sample.bodyClock,
      shiftMinutesPerDay: 60,
      targetAt: () => 0,
      carryover: true,
      holidayStart: sample.holidayStart,
      holidayEnd: sample.holidayEnd,
    });
    const uk = doses.find((dose) => dose.medicineId === "med-morning");
    assert.ok(uk);
    assert.equal(uk.ukLabel, "08:00");
    assert.equal(uk.localLabel, "15:00");
    const breakfast = doses.find((dose) => dose.medicineId === "med-meals" && dose.hhmm === "08:00");
    assert.equal(breakfast?.localLabel, "08:00");
    const empty = doses.find((dose) => dose.medicineId === "med-empty");
    assert.equal(empty?.hhmm, "07:00");
    assert.equal(empty?.localLabel, "07:00");
    assert.match(clockLine(empty!), /07:00 local/);
    const supper = carry.find((dose) => dose.hhmm === "19:00");
    assert.equal(supper?.state, "overdue");
  });

  it("moves a dose that lands while asleep to 06:00 local", () => {
    const zone = "Asia/Singapore";
    const { doses } = liveAgenda({
      medicines: [
        {
          id: "night",
          name: "Evening",
          dose: "1",
          times: ["22:00"],
          food: "either",
          water: "either",
          notes: "",
          mode: "uk",
          active: true,
          startDate: null,
          endDate: null,
        },
      ],
      dayKey: "2026-10-10",
      labelZone: zone,
      zoneForDay: () => zone,
      now: new Date("2026-10-09T12:00:00.000Z"),
      leadMinutes: 15,
      logs: [],
      clock: { offsetMinutes: 60, asOf: "2026-10-01T00:00:00.000Z" },
      shiftMinutesPerDay: 60,
      targetAt: () => 60,
      carryover: false,
      holidayStart: "2026-10-01",
      holidayEnd: "2026-10-20",
    });
    assert.equal(doses.length, 1);
    assert.equal(doses[0].movedFrom, "05:00");
    assert.equal(doses[0].localLabel, "06:00");
  });

  it("leaves a held dose in the night", () => {
    const zone = "Asia/Singapore";
    const { doses } = liveAgenda({
      medicines: [
        {
          id: "night",
          name: "Evening",
          dose: "1",
          times: ["22:00"],
          food: "either",
          water: "either",
          notes: "",
          mode: "uk",
          active: true,
          startDate: null,
          endDate: null,
          holdTime: true,
        },
      ],
      dayKey: "2026-10-10",
      labelZone: zone,
      zoneForDay: () => zone,
      now: new Date("2026-10-09T12:00:00.000Z"),
      leadMinutes: 15,
      logs: [],
      clock: { offsetMinutes: 60, asOf: "2026-10-01T00:00:00.000Z" },
      shiftMinutesPerDay: 60,
      targetAt: () => 60,
      carryover: false,
      holidayStart: "2026-10-01",
      holidayEnd: "2026-10-20",
    });
    assert.equal(doses.length, 1);
    assert.equal(doses[0].movedFrom, null);
    assert.equal(doses[0].localLabel, "05:00");
  });

  it("keeps doses on UK time outside the holiday dates", () => {
    const zone = "Asia/Singapore";
    const { doses } = liveAgenda({
      medicines: sample.medicines,
      dayKey: "2026-10-09",
      labelZone: zone,
      zoneForDay: () => zone,
      now,
      leadMinutes: 15,
      logs: [],
      clock: sample.bodyClock,
      shiftMinutesPerDay: 60,
      targetAt: () => 0,
      carryover: false,
      holidayStart: "2026-11-01",
      holidayEnd: "2026-11-20",
    });
    const morning = doses.find((dose) => dose.medicineId === "med-morning");
    assert.ok(morning);
    assert.equal(morning.ukLabel, "08:00");
    assert.equal(morning.localLabel, "15:00");
    const eased = doses.find((dose) => dose.medicineId === "med-empty");
    assert.equal(eased?.ukLabel, "07:00");
    assert.match(clockLine(eased!), /Has not jumped yet/);
    const note = easeNote("2026-10-09", "2026-11-01", "2026-11-20", 60, () => "Europe/London", "United Kingdom");
    assert.match(note, /Nothing is shifting/);
    assert.doesNotMatch(note, /behind/);
  });
});
