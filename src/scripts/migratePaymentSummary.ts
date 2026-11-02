/**
 * Payment summary migration.
 *
 * Default run is a DRY RUN: it only reads the database and writes a JSON report.
 *   npx ts-node-dev --transpile-only src/scripts/migratePaymentSummary.ts [--report=path/to/report.json]
 *
 * --apply writes the derived fields and tags legacy advance lines.
 *   It never changes payment amounts, statuses, financial accounts, budgets or the ledger.
 *   Take a database backup before running it with --apply.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { envVars } from "../app/config/env";
import { Project } from "../app/modules/project/project.model";
import { computePaymentSummary } from "../app/modules/project/project.payment.utils";
import { PaymentStatus } from "../app/modules/project/project.interface";

const APPLY = process.argv.includes("--apply");

const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const reportPath = reportArg
  ? path.resolve(reportArg.split("=")[1])
  : path.resolve(process.cwd(), `payment-migration-report-${Date.now()}.json`);

interface ProjectRow {
  id: string;
  name: string;
  isDeleted: boolean;
  budget: number | null;
  storedStatus: string | null;
  derivedStatus: string;
  storedStatusMismatch: boolean;
  receivedAmount: number;
  outstandingAmount: number;
  overpaidAmount: number;
  hasAdvance: boolean;
  legacyAdvanceLines: number;
  legacyAdvanceAmount: number;
  completeLinesWithoutAccount: number;
  paymentLines: number;
}

const run = async () => {
  await mongoose.connect(envVars.DB_URL);
  console.log(`Connected. Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  // Includes soft-deleted projects, because they still hold payment history
  const projects = await Project.find({}).lean();

  const rows: ProjectRow[] = [];
  let storedMismatches = 0;
  let overpaidProjects = 0;
  let noBudgetProjects = 0;
  let legacyAdvanceProjects = 0;

  for (const project of projects) {
    const payments = (project.payments ?? []) as Array<{
      amount: number;
      status: string;
      isAdvance?: boolean;
      financialAccountId?: unknown;
    }>;

    const summary = computePaymentSummary(payments as never, project.budget);
    const storedMismatch = project.paymentStatus !== summary.paymentStatus;

    const legacyAdvance = payments.filter((p) => p.status === PaymentStatus.ADVANCED);
    const completeWithoutAccount = payments.filter(
      (p) => p.status === PaymentStatus.COMPLETE && !p.financialAccountId,
    ).length;

    if (storedMismatch) storedMismatches++;
    if (summary.overpaidAmount > 0) overpaidProjects++;
    if (summary.paymentStatus === "NO_BUDGET") noBudgetProjects++;
    if (legacyAdvance.length > 0) legacyAdvanceProjects++;

    rows.push({
      id: String(project._id),
      name: project.name,
      isDeleted: project.isDeleted === true,
      budget: project.budget ?? null,
      storedStatus: project.paymentStatus ?? null,
      derivedStatus: summary.paymentStatus,
      storedStatusMismatch: storedMismatch,
      receivedAmount: summary.receivedAmount,
      outstandingAmount: summary.outstandingAmount,
      overpaidAmount: summary.overpaidAmount,
      hasAdvance: summary.hasAdvance,
      legacyAdvanceLines: legacyAdvance.length,
      legacyAdvanceAmount: legacyAdvance.reduce((s, p) => s + (Number(p.amount) || 0), 0),
      completeLinesWithoutAccount: completeWithoutAccount,
      paymentLines: payments.length,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "APPLY" : "DRY_RUN",
    totals: {
      projects: projects.length,
      storedStatusMismatches: storedMismatches,
      overpaidProjects,
      noBudgetProjects,
      projectsWithLegacyAdvance: legacyAdvanceProjects,
      totalReceived: rows.reduce((s, r) => s + r.receivedAmount, 0),
      totalOutstanding: rows.reduce((s, r) => s + r.outstandingAmount, 0),
      totalOverpaid: rows.reduce((s, r) => s + r.overpaidAmount, 0),
    },
    projects: rows,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Report written: ${reportPath}`);
  console.log(JSON.stringify(report.totals, null, 2));

  if (!APPLY) {
    console.log("Dry run only. Nothing was written. Re-run with --apply after a backup.");
    await mongoose.disconnect();
    return;
  }

  const operations = [];

  for (const project of projects) {
    const payments = (project.payments ?? []) as Array<{ status: string; isAdvance?: boolean; category?: string }>;
    const summary = computePaymentSummary(payments as never, project.budget);

    const $set: Record<string, unknown> = {
      paymentStatus: summary.paymentStatus,
      receivedAmount: summary.receivedAmount,
      outstandingAmount: summary.outstandingAmount,
      overpaidAmount: summary.overpaidAmount,
      hasAdvance: summary.hasAdvance,
    };

    operations.push({
      updateOne: { filter: { _id: project._id }, update: { $set } },
    });

    // Tag legacy ADVANCED lines as advance (the status itself is kept, so nothing is lost)
    if (payments.some((p) => p.status === PaymentStatus.ADVANCED && p.isAdvance !== true)) {
      operations.push({
        updateOne: {
          filter: { _id: project._id },
          update: { $set: { "payments.$[advance].isAdvance": true } },
          arrayFilters: [{ "advance.status": PaymentStatus.ADVANCED }],
        },
      });
    }

    // Existing maintenance vs project split is unknown, so every old line becomes PROJECT
    if (payments.some((p) => p.category === undefined)) {
      operations.push({
        updateOne: {
          filter: { _id: project._id },
          update: { $set: { "payments.$[line].category": "PROJECT" } },
          arrayFilters: [{ "line.category": { $exists: false } }],
        },
      });
    }
  }

  if (operations.length > 0) {
    const result = await Project.collection.bulkWrite(operations as never, { ordered: false });
    console.log(`Applied. Modified documents: ${result.modifiedCount}`);
  } else {
    console.log("Nothing to apply.");
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
