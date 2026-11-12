import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLIENT_VALUE_FIELDS,
  PROJECT_VALUE_FIELDS,
  projectValueSelectFor,
  sanitizeClientForRole,
  sanitizeClientStatsForRole,
  sanitizeProjectForRole,
  sanitizeProjectsForRole,
  stripValueQueryForRole,
} from "./projectValue";

const fullProject = () => ({
  _id: "p1",
  name: "Website",
  status: "IN_PROGRESS",
  budget: 100000,
  payments: [{ amount: 20000 }],
  paymentSchedule: [{ amount: 50000 }],
  paymentStatus: "PARTIAL",
  nextPaymentDate: "2026-12-01",
  balanceReversed: false,
  receivedAmount: 20000,
  outstandingAmount: 80000,
  overpaidAmount: 0,
  hasAdvance: true,
});

const fullClient = () => ({
  _id: "c1",
  firstName: "A",
  totalRevenue: 100000,
  totalInvoices: 1,
  totalPaid: 20000,
  totalDue: 80000,
  projects: [fullProject()],
});

// Every role that is not an admin must get the same stripped output
const HIDDEN_ROLES = ["SALES_MARKETING", "MARKETING_SALES_LEAD", "MANAGER", "DEVELOPER", "DESIGNER", "STAFF", "VIDEO_EDITOR"];

describe("project value hiding", () => {
  for (const role of HIDDEN_ROLES) {
    it(`strips every project value field for ${role}`, () => {
      const out = sanitizeProjectForRole(fullProject(), role) as Record<string, unknown>;
      for (const field of PROJECT_VALUE_FIELDS) assert.equal(field in out, false, `${field} leaked`);
      assert.equal(out.name, "Website");
    });

    it(`strips client totals and embedded project values for ${role}`, () => {
      const out = sanitizeClientForRole(fullClient(), role) as Record<string, unknown>;
      for (const field of CLIENT_VALUE_FIELDS) assert.equal(field in out, false, `${field} leaked`);
      for (const project of out.projects as Record<string, unknown>[]) {
        for (const field of PROJECT_VALUE_FIELDS) assert.equal(field in project, false, `${field} leaked`);
      }
    });

    it(`strips money totals from client stats for ${role}`, () => {
      const out = sanitizeClientStatsForRole({ total: 3, totalRevenue: 5, totalDue: 2 }, role) as Record<string, unknown>;
      assert.equal(out.total, 3);
      assert.equal("totalRevenue" in out, false);
      assert.equal("totalDue" in out, false);
    });

    it(`cannot filter, sort or project by money for ${role}`, () => {
      const query = stripValueQueryForRole(
        {
          "budget[gte]": "1",
          budget: "5",
          sort: "-budget,name",
          fields: "budget,name",
          search: "web",
        } as Record<string, string>,
        role,
      );
      assert.equal("budget[gte]" in query, false);
      assert.equal("budget" in query, false);
      assert.equal("fields" in query, false);
      assert.equal(query.sort, "name");
      assert.equal(query.search, "web");
    });

    it(`excludes value fields in the Mongoose select for ${role}`, () => {
      const select = projectValueSelectFor(role);
      for (const field of PROJECT_VALUE_FIELDS) assert.ok(select.includes(`-${field}`));
    });
  }

  for (const role of ["SUPER_ADMIN", "ADMIN"]) {
    it(`leaves data untouched for ${role}`, () => {
      const project = fullProject();
      assert.equal(sanitizeProjectForRole(project, role), project);
      assert.equal(projectValueSelectFor(role), "");
      const list = [project];
      assert.equal(sanitizeProjectsForRole(list, role), list);
    });
  }

  it("treats a missing role as non-admin", () => {
    const out = sanitizeProjectForRole(fullProject(), undefined) as Record<string, unknown>;
    assert.equal("budget" in out, false);
  });
});
