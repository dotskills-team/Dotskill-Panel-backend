/**
 * Unit tests for the KPI month boundaries and the achievement filters.
 * They need no database. Run with: npm run test:kpi
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Types } from "mongoose";

import {
  buildCountableProjectMatch,
  buildCreditedProjectsPipeline,
  toPercentage,
} from "./kpi.achievement.utils";
import { getMonthRangeUtc, toDhakaMonth } from "./kpi.month";

const iso = (date: Date) => date.toISOString();

describe("KPI months (Asia/Dhaka)", () => {
  it("maps a month to its UTC range, start inclusive and end exclusive", () => {
    const { start, end } = getMonthRangeUtc("2026-11");
    // Dhaka midnight is 18:00 UTC of the previous day
    assert.equal(iso(start), "2026-10-31T18:00:00.000Z");
    assert.equal(iso(end), "2026-11-30T18:00:00.000Z");
  });

  it("rolls December over into the next year", () => {
    const { start, end } = getMonthRangeUtc("2026-12");
    assert.equal(iso(start), "2026-11-30T18:00:00.000Z");
    assert.equal(iso(end), "2026-12-31T18:00:00.000Z");
  });

  it("handles a leap-year February", () => {
    const { start, end } = getMonthRangeUtc("2028-02");
    assert.equal(iso(start), "2028-01-31T18:00:00.000Z");
    assert.equal(iso(end), "2028-02-29T18:00:00.000Z");
  });

  it("puts 23:30 Dhaka time on the last day of a month in that month", () => {
    // 23:30 Dhaka on 30 Nov = 17:30 UTC
    const instant = new Date("2026-11-30T17:30:00.000Z");
    assert.equal(toDhakaMonth(instant), "2026-11");

    const { start, end } = getMonthRangeUtc("2026-11");
    assert.ok(instant >= start && instant < end);
  });

  it("puts 00:30 Dhaka time on the first day of a month in the new month", () => {
    // 00:30 Dhaka on 1 Dec = 18:30 UTC on 30 Nov (still November in UTC!)
    const instant = new Date("2026-11-30T18:30:00.000Z");
    assert.equal(toDhakaMonth(instant), "2026-12");

    const november = getMonthRangeUtc("2026-11");
    const december = getMonthRangeUtc("2026-12");
    assert.ok(!(instant >= november.start && instant < november.end));
    assert.ok(instant >= december.start && instant < december.end);
  });

  it("treats the exact month start as inclusive and the exact next-month start as exclusive", () => {
    const { start, end } = getMonthRangeUtc("2026-11");
    assert.equal(toDhakaMonth(start), "2026-11");
    assert.equal(toDhakaMonth(new Date(start.getTime() - 1)), "2026-10");
    assert.equal(toDhakaMonth(end), "2026-12");
    assert.equal(toDhakaMonth(new Date(end.getTime() - 1)), "2026-11");
  });

  it("rejects a malformed month", () => {
    assert.throws(() => getMonthRangeUtc("2026-13"), RangeError);
    assert.throws(() => getMonthRangeUtc("2026-1"), RangeError);
    assert.throws(() => getMonthRangeUtc("November"), RangeError);
  });
});

/** Tiny evaluator for the three operators used by the countable-project filter. */
const matches = (doc: Record<string, unknown>, filter: Record<string, Record<string, unknown>>) =>
  Object.entries(filter).every(([field, condition]) => {
    const value = doc[field];
    return Object.entries(condition).every(([op, expected]) => {
      switch (op) {
        case "$ne":
          return value !== expected;
        case "$gte":
          return (value as Date) >= (expected as Date);
        case "$lt":
          return (value as Date) < (expected as Date);
        default:
          throw new Error(`Unsupported operator ${op}`);
      }
    });
  });

describe("countable projects", () => {
  const filter = buildCountableProjectMatch("2026-11") as unknown as Record<
    string,
    Record<string, unknown>
  >;
  const inNovember = new Date("2026-11-15T10:00:00.000Z");

  it("counts a normal project created in the month", () => {
    assert.ok(matches({ isDeleted: false, status: "IN_PROGRESS", createdAt: inNovember }, filter));
  });

  it("counts a project whose isDeleted flag was never set", () => {
    assert.ok(matches({ status: "PLANNING", createdAt: inNovember }, filter));
  });

  it("excludes soft-deleted projects", () => {
    assert.ok(!matches({ isDeleted: true, status: "IN_PROGRESS", createdAt: inNovember }, filter));
  });

  it("excludes cancelled projects", () => {
    assert.ok(!matches({ isDeleted: false, status: "CANCELLED", createdAt: inNovember }, filter));
  });

  it("keeps every other status, including completed and delivered work", () => {
    for (const status of ["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "DONE_DUE", "DELIVERED", "PENDING"]) {
      assert.ok(matches({ isDeleted: false, status, createdAt: inNovember }, filter), status);
    }
  });

  it("applies the Dhaka month boundaries to createdAt", () => {
    const base = { isDeleted: false, status: "IN_PROGRESS" };
    // 23:30 Dhaka on 30 Nov is still November
    assert.ok(matches({ ...base, createdAt: new Date("2026-11-30T17:30:00.000Z") }, filter));
    // 00:30 Dhaka on 1 Dec is December
    assert.ok(!matches({ ...base, createdAt: new Date("2026-11-30T18:30:00.000Z") }, filter));
    // 00:30 Dhaka on 1 Nov is November (it is still 31 Oct in UTC)
    assert.ok(matches({ ...base, createdAt: new Date("2026-10-31T18:30:00.000Z") }, filter));
    // 23:30 Dhaka on 31 Oct is October
    assert.ok(!matches({ ...base, createdAt: new Date("2026-10-31T17:30:00.000Z") }, filter));
  });
});

describe("credited projects pipeline", () => {
  const userA = new Types.ObjectId();
  const userB = new Types.ObjectId();
  const pipeline = buildCreditedProjectsPipeline({
    month: "2026-11",
    creditedToIds: [userA, userB],
    clientsCollection: "clients",
  });

  it("filters projects before joining clients", () => {
    assert.deepEqual(Object.keys(pipeline[0]), ["$match"]);
    assert.deepEqual(pipeline[0], { $match: buildCountableProjectMatch("2026-11") });
  });

  it("joins the client and keeps only clients credited to the given users", () => {
    assert.deepEqual(pipeline[1], {
      $lookup: {
        from: "clients",
        localField: "client",
        foreignField: "_id",
        as: "clientDoc",
      },
    });
    assert.deepEqual(pipeline[2], { $unwind: "$clientDoc" });
    assert.deepEqual(pipeline[3], { $match: { "clientDoc.creditedTo": { $in: [userA, userB] } } });
  });
});

describe("percentages", () => {
  it("is achieved / target * 100, rounded to 2 decimals", () => {
    assert.equal(toPercentage(50, 200), 25);
    assert.equal(toPercentage(1, 3), 33.33);
    assert.equal(toPercentage(300, 200), 150);
  });

  it("returns null instead of dividing by zero", () => {
    assert.equal(toPercentage(10, 0), null);
    assert.equal(toPercentage(10, undefined), null);
    assert.equal(toPercentage(10, null), null);
  });

  it("is 0 when nothing is achieved against a real target", () => {
    assert.equal(toPercentage(0, 100), 0);
  });
});
