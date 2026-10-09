import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSample } from "./sample.ts";
import {
  clockLine,
  easeSummary,
  holidayError,
  holidayLength,
  legAt,
  liveAgenda,
  makeTargetAt,
  placeLabel,
  projectOffset,
  tripSpanDays,
  validateLegs,
  zoneForInstant,
} from "./schedule.ts";
import { HOME_TZ, offsetMinutes, zonedTimeToUtc } from "./time.ts";

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

describe("body clock", () => {
  it("walks toward the destination and then holds", () => {
    const clock = { offsetMinutes: 60, asOf: "2026-09-01T00:00:00.000Z" };
    const target = () => 480;
    assert.equal(projectOffset(clock, 60, new Date("2026-09-04T00:00:00.000Z"), target), 240);
    assert.equal(projectOffset(clock, 60, new Date("2026-09-04T12:00:00.000Z"), target), 270);
    assert.equal(projectOffset(clock, 60, new Date("2026-09-20T00:00:00.000Z"), target), 480);
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
    const targetAt = makeTargetAt(sample.legs, sample.zoneChoice, "UTC");
    const body = projectOffset(sample.bodyClock, 60, now, targetAt);
    assert.equal(body, offsetMinutes(HOME_TZ, now));
    assert.equal(body, 60);
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
      targetAt,
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
    assert.equal(empty?.localLabel, "14:00");
    assert.equal(empty?.ukLabel, "07:00");
    assert.match(clockLine(empty!, offsetMinutes(zone, now), body), /07:00 UK, shifting/);
    assert.match(easeSummary(body, offsetMinutes(zone, now), 60, "Singapore"), /7 hours behind Singapore/);
    const supper = carry.find((dose) => dose.hhmm === "19:00");
    assert.equal(supper?.state, "overdue");
  });

  it("skips doses outside the holiday dates", () => {
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
      targetAt: makeTargetAt(sample.legs, sample.zoneChoice, "UTC"),
      carryover: false,
      holidayStart: "2026-11-01",
      holidayEnd: "2026-11-20",
    });
    assert.equal(doses.length, 0);
  });
});
