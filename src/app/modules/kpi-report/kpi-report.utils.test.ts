/**
 * Unit tests for the KPI report time rules and extra item key checks.
 * They need no database. Run with: npm run test:kpi
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canSubmitReport,
  checkExtraResultKeys,
  getReportDeadline,
  getSubmitOpensAt,
  isLateSubmission,
} from "./kpi-report.utils";

const iso = (date: Date) => date.toISOString();

describe("submit window", () => {
  it("opens at 00:00 Dhaka on the last day of the month", () => {
    // 30 Nov 00:00 Dhaka = 29 Nov 18:00 UTC
    assert.equal(iso(getSubmitOpensAt("2026-11")), "2026-11-29T18:00:00.000Z");
  });

  it("is closed before the last day and open from its first moment", () => {
    // 23:59 Dhaka on 29 Nov: still closed
    assert.equal(canSubmitReport("2026-11", new Date("2026-11-29T17:59:59.999Z")), false);
    // 00:00 Dhaka on 30 Nov: open
    assert.equal(canSubmitReport("2026-11", new Date("2026-11-29T18:00:00.000Z")), true);
  });

  it("stays open in the following month", () => {
    assert.equal(canSubmitReport("2026-11", new Date("2026-12-10T05:00:00.000Z")), true);
  });

  it("uses the real last day of a 31-day month and of a leap February", () => {
    assert.equal(iso(getSubmitOpensAt("2026-12")), "2026-12-30T18:00:00.000Z"); // 31 Dec Dhaka
    assert.equal(iso(getSubmitOpensAt("2028-02")), "2028-02-28T18:00:00.000Z"); // 29 Feb Dhaka
  });

  it("cannot be used for a month that has not started yet", () => {
    assert.equal(canSubmitReport("2027-01", new Date("2026-11-30T00:00:00.000Z")), false);
  });
});

describe("deadline", () => {
  it("is the last moment of the 5th day of the next month in Dhaka", () => {
    // 5 Dec 23:59:59.999 Dhaka = 5 Dec 17:59:59.999 UTC
    assert.equal(iso(getReportDeadline("2026-11")), "2026-12-05T17:59:59.999Z");
  });

  it("rolls over the year for December", () => {
    assert.equal(iso(getReportDeadline("2026-12")), "2027-01-05T17:59:59.999Z");
  });

  it("does not mark a submission on the last day of the month as late", () => {
    assert.equal(isLateSubmission("2026-11", new Date("2026-11-30T10:00:00.000Z")), false);
  });

  it("does not mark a submission on the 5th at 23:59 Dhaka as late", () => {
    assert.equal(isLateSubmission("2026-11", new Date("2026-12-05T17:59:59.999Z")), false);
  });

  it("marks a submission from 00:00 Dhaka on the 6th as late", () => {
    assert.equal(isLateSubmission("2026-11", new Date("2026-12-05T18:00:00.000Z")), true);
    assert.equal(isLateSubmission("2026-11", new Date("2026-12-20T09:00:00.000Z")), true);
  });
});

describe("extra item result keys", () => {
  const kpiKeys = ["calls", "revenue"];

  it("accepts a partial draft", () => {
    assert.equal(checkExtraResultKeys(kpiKeys, ["calls"], false), null);
    assert.equal(checkExtraResultKeys(kpiKeys, [], false), null);
  });

  it("rejects a key that is not on the KPI", () => {
    assert.match(checkExtraResultKeys(kpiKeys, ["meetings"], false) ?? "", /not an extra item/);
  });

  it("rejects duplicate keys", () => {
    assert.match(checkExtraResultKeys(kpiKeys, ["calls", "calls"], false) ?? "", /Duplicate/);
  });

  it("requires every key on submit", () => {
    assert.match(checkExtraResultKeys(kpiKeys, ["calls"], true) ?? "", /Missing results for: revenue/);
    assert.equal(checkExtraResultKeys(kpiKeys, ["revenue", "calls"], true), null);
  });

  it("is fine for a KPI without extra items", () => {
    assert.equal(checkExtraResultKeys([], [], true), null);
  });
});
