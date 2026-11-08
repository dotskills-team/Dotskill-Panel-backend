import { Model, Types } from "mongoose";
import { FinanceActor } from "../../utils/financeScope";
import { Role } from "../user/user.interface";
import { User } from "../user/user.model";
import { Project } from "../project/project.model";
import { isReceivedPayment } from "../project/project.payment.utils";
import { Lead } from "../lead/lead.model";
import { Client } from "../clients/client.model";
import { Expense } from "../expense/expense.model";
import { FinancialAccount } from "../financial-account/financial-account.model";
import { TeamSalary } from "../team-salary/team-salary.model";
import { SalaryPaymentStatus } from "../team-salary/team-salary.constant";
import { LeadStatus } from "../lead/lead.interface";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type Tone = "indigo" | "emerald" | "rose" | "amber" | "violet" | "sky" | "teal" | "blue";

export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  format: "currency" | "number" | "percent";
  hint: string;
  tone: Tone;
}

export interface DashboardTrend {
  title: string;
  keys: { key: string; label: string; color: string }[];
  points: Array<Record<string, string | number>>;
}

export interface DashboardBreakdown {
  key: string;
  title: string;
  type: "donut" | "bar";
  items: { label: string; value: number }[];
}

export interface DashboardListRow {
  primary: string;
  secondary?: string;
  value?: number;
  badge?: string;
  date?: string;
}

export interface DashboardList {
  key: string;
  title: string;
  valueFormat?: "currency" | "number";
  rows: DashboardListRow[];
}

/** The date window used for period figures. Snapshot figures ignore it. */
interface DashboardRange {
  from: Date;
  to: Date;
  startDate: string;
  endDate: string;
  months: { key: string; label: string }[];
}

export interface DashboardOverview {
  role: string;
  name: string;
  generatedAt: string;
  range: { startDate: string; endDate: string };
  kpis: DashboardKpi[];
  /** null when the role's dashboard has no trend chart. */
  trend: DashboardTrend | null;
  breakdowns: DashboardBreakdown[];
  lists: DashboardList[];
}

type Body = Omit<DashboardOverview, "role" | "name" | "generatedAt" | "range">;

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Projects still in progress (money may still be owed). */
const ACTIVE_PROJECT_STATUSES = ["PLANNING", "IN_PROGRESS", "PENDING", "ON_HOLD", "DONE_DUE"];
const FINISHED_PROJECT_STATUSES = ["COMPLETED", "DELIVERED"];

const oid = (id: string) => new Types.ObjectId(id);
const monthKey = (year: number, month: number) => `${year}-${month}`;
const now = () => new Date();

const monthStart = () => {
  const d = now();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

const sixMonthsAgo = () => {
  const d = now();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 5, 1));
};

/** The last six calendar months, oldest first (used by roles without a date filter). */
const lastSixMonths = () => {
  const d = now();
  return Array.from({ length: 6 }, (_, i) => {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (5 - i), 1));
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + 1;
    return {
      key: monthKey(year, month),
      label: `${MONTHS[start.getUTCMonth()]} ${String(year).slice(2)}`,
    };
  });
};

const currentMonthKey = () => {
  const d = now();
  return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
};

const parseDay = (value: unknown, endOfDay: boolean) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Resolves ?startDate / ?endDate (YYYY-MM-DD). Without them the window is the
 * last six months up to today. Months listed here drive the trend chart.
 */
const resolveRange = (query: Record<string, unknown>): DashboardRange => {
  const d = now();
  let from = parseDay(query.startDate, false) ?? sixMonthsAgo();
  let to =
    parseDay(query.endDate, true) ??
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  if (from > to) [from, to] = [to, from];

  const months: { key: string; label: string }[] = [];
  const last = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1);
  let cursor = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1);
  while (cursor <= last) {
    const c = new Date(cursor);
    months.push({
      key: monthKey(c.getUTCFullYear(), c.getUTCMonth() + 1),
      label: `${MONTHS[c.getUTCMonth()]} ${String(c.getUTCFullYear()).slice(2)}`,
    });
    cursor = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
  }

  return {
    from,
    to,
    startDate: from.toISOString().slice(0, 10),
    endDate: to.toISOString().slice(0, 10),
    months: months.slice(-24),
  };
};

const inRange = (date: Date | string, range: DashboardRange) => {
  const d = new Date(date);
  return d >= range.from && d <= range.to;
};

const clientName = (client: unknown) => {
  const c = client as
    | { fullName?: string; companyName?: string; firstName?: string; lastName?: string }
    | null
    | undefined;
  if (!c) return "No client";
  return (
    c.fullName ||
    c.companyName ||
    `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() ||
    "Client"
  );
};

const personName = (u: unknown) => {
  const p = u as { firstName?: string; lastName?: string; email?: string } | null | undefined;
  if (!p) return "Unknown";
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email || "Unknown";
};

const formatDay = (date?: Date | string | null) =>
  date ? new Date(date).toISOString() : undefined;

/** Days from now until `date`. Negative = already passed. */
const daysUntil = (date: Date) => (date.getTime() - now().getTime()) / DAY_MS;

const formatCount = (amount: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(amount);

const countBy = (items: string[]) => {
  const map = new Map<string, number>();
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
};

const pretty = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/* -------------------------------------------------------------------------- */
/*                           Project (snapshot + period)                      */
/* -------------------------------------------------------------------------- */

interface ProjectLite {
  _id: Types.ObjectId;
  name: string;
  type: string;
  status: string;
  budget?: number;
  endDate?: Date | null;
  startDate?: Date;
  client?: unknown;
  developers: Types.ObjectId[];
  projectManager: Types.ObjectId;
  payments: { amount: number; date: Date; note?: string; status?: string }[];
}

const loadProjects = async (match: Record<string, unknown>) => {
  const rows = await Project.find({ ...match, isDeleted: { $ne: true } })
    .select("name type status budget startDate endDate client developers projectManager payments")
    .populate("client", "fullName companyName firstName lastName")
    .lean();
  return rows as unknown as ProjectLite[];
};

// Received = COMPLETE + ADVANCED lines (same rule as project totals)
const receivedPayments = (p: ProjectLite) => (p.payments ?? []).filter(isReceivedPayment);

const paidOf = (p: ProjectLite) =>
  receivedPayments(p).reduce((sum, pay) => sum + (pay.amount ?? 0), 0);

/** Money owed on a project: budget minus everything paid so far. */
const dueOf = (p: ProjectLite) => Math.max(0, (p.budget ?? 0) - paidOf(p));

const isActive = (p: ProjectLite) => ACTIVE_PROJECT_STATUSES.includes(p.status);

/** Payments received across projects inside the date range, grouped by month. */
const collectedByMonth = (projects: ProjectLite[], range: DashboardRange) => {
  const map = new Map<string, number>();
  for (const p of projects) {
    for (const pay of receivedPayments(p)) {
      if (!inRange(pay.date, range)) continue;
      const d = new Date(pay.date);
      const key = monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
      map.set(key, (map.get(key) ?? 0) + (pay.amount ?? 0));
    }
  }
  return map;
};

const collectedBetween = (projects: ProjectLite[], range: DashboardRange) =>
  projects.reduce(
    (sum, p) =>
      sum +
      receivedPayments(p)
        .filter((pay) => inRange(pay.date, range))
        .reduce((s, pay) => s + (pay.amount ?? 0), 0),
    0,
  );

const recentPayments = (projects: ProjectLite[], range: DashboardRange, limit: number): DashboardListRow[] =>
  projects
    .flatMap((p) =>
      receivedPayments(p)
        .filter((pay) => inRange(pay.date, range))
        .map((pay) => ({
          primary: p.name,
          secondary: clientName(p.client),
          value: pay.amount,
          date: formatDay(pay.date),
          sortAt: new Date(pay.date).getTime(),
        })),
    )
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, limit)
    .map(({ sortAt: _ignored, ...row }) => row);

/** Active projects with a deadline in the next `days` days, or already overdue. */
const deadlineRows = (projects: ProjectLite[], days: number, limit: number): DashboardListRow[] =>
  projects
    .filter((p) => isActive(p) && p.endDate && daysUntil(new Date(p.endDate)) <= days)
    .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime())
    .slice(0, limit)
    .map((p) => {
      const left = daysUntil(new Date(p.endDate!));
      return {
        primary: p.name,
        secondary: clientName(p.client),
        badge: left < 0 ? "Overdue" : `${Math.ceil(left)} day${Math.ceil(left) === 1 ? "" : "s"} left`,
        date: formatDay(p.endDate),
      };
    });

/* -------------------------------------------------------------------------- */
/*                               Expense ledger                               */
/* -------------------------------------------------------------------------- */

const expenseMatch = (createdBy?: Types.ObjectId) => ({
  isDeleted: { $ne: true },
  ...(createdBy ? { createdBy } : {}),
});

/** Expense totals per month between `from` and `to`. */
const expensesByMonth = async (
  createdBy?: Types.ObjectId,
  from: Date = sixMonthsAgo(),
  to: Date = now(),
) => {
  const rows = (await Expense.aggregate([
    { $match: { ...expenseMatch(createdBy), expenseDate: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { y: { $year: "$expenseDate" }, m: { $month: "$expenseDate" } },
        total: { $sum: "$amount" },
      },
    },
  ])) as Array<{ _id: { y: number; m: number }; total: number }>;
  return new Map(rows.map((r) => [monthKey(r._id.y, r._id.m), r.total]));
};

const expensesSince = async (from: Date, createdBy?: Types.ObjectId, to: Date = now()) => {
  const [row] = (await Expense.aggregate([
    { $match: { ...expenseMatch(createdBy), expenseDate: { $gte: from, $lte: to } } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ])) as Array<{ total: number; count: number }>;
  return { total: row?.total ?? 0, count: row?.count ?? 0 };
};

const expensesByCategory = async (from: Date, to: Date) =>
  (await Expense.aggregate([
    { $match: { ...expenseMatch(), expenseDate: { $gte: from, $lte: to } } },
    { $group: { _id: "$categoryId", total: { $sum: "$amount" } } },
    { $sort: { total: -1 } },
    { $limit: 6 },
    {
      $lookup: {
        from: "expensecategories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, label: { $ifNull: ["$category.name", "Other"] }, value: "$total" } },
  ])) as Array<{ label: string; value: number }>;

const recentExpensesIn = (range: DashboardRange, limit: number) =>
  Expense.find({ ...expenseMatch(), expenseDate: { $gte: range.from, $lte: range.to } })
    .sort({ expenseDate: -1 })
    .limit(limit)
    .populate("createdBy", "firstName lastName email")
    .populate("categoryId", "name")
    .lean();

const myAccountsBalance = async (ownerId: Types.ObjectId) => {
  const [row] = (await FinancialAccount.aggregate([
    { $match: { ownerId, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$currentBalance" } } },
  ])) as Array<{ total: number }>;
  return row?.total ?? 0;
};

/** Counts of documents per month for a date field (last six months). */
const monthlyCounts = async (
  model: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  dateField: string,
  match: Record<string, unknown> = {},
) => {
  const rows = (await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: sixMonthsAgo() } } },
    {
      $group: {
        _id: { y: { $year: `$${dateField}` }, m: { $month: `$${dateField}` } },
        count: { $sum: 1 },
      },
    },
  ])) as Array<{ _id: { y: number; m: number }; count: number }>;
  return new Map(rows.map((r) => [monthKey(r._id.y, r._id.m), r.count]));
};

/* -------------------------------------------------------------------------- */
/*                              Role builders                                 */
/* -------------------------------------------------------------------------- */

const ADMIN_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN];

const LEAD_PIPELINE = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"];

/** Admins: company-wide money, projects, leads and team. Period figures use the range. */
const buildAdmin = async (actor: FinanceActor, range: DashboardRange): Promise<Body> => {
  const uid = oid(actor.userId);
  const projects = await loadProjects({});
  const active = projects.filter(isActive);
  const outstanding = active.reduce((s, p) => s + dueOf(p), 0);
  const allCollected = projects.reduce((s, p) => s + paidOf(p), 0);
  const periodCollected = collectedBetween(projects, range);

  const [expPeriod, myBalance, leadRows, openLeads, salaryRows, userRows, expenseMap, collectedMap, categories, recentExpenses] =
    await Promise.all([
      expensesSince(range.from, undefined, range.to),
      myAccountsBalance(uid),
      Lead.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]) as Promise<Array<{ _id: string; count: number }>>,
      Lead.countDocuments({
        isDeleted: { $ne: true },
        status: { $nin: [LeadStatus.WON, LeadStatus.LOST] },
      }),
      TeamSalary.aggregate([
        { $match: { status: { $in: [SalaryPaymentStatus.PENDING, SalaryPaymentStatus.PARTIAL, SalaryPaymentStatus.OVERDUE] }, cancelledAt: null } },
        { $group: { _id: null, due: { $sum: "$dueAmount" } } },
      ]) as Promise<Array<{ due: number }>>,
      User.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]) as Promise<Array<{ _id: string; count: number }>>,
      expensesByMonth(undefined, range.from, range.to),
      Promise.resolve(collectedByMonth(projects, range)),
      expensesByCategory(range.from, range.to),
      recentExpensesIn(range, 6),
    ]);

  const salaryDue = salaryRows[0]?.due ?? 0;
  const teamTotal = userRows.reduce((s, r) => s + r.count, 0);
  const totalLeads = leadRows.reduce((s, r) => s + r.count, 0);
  const leadCountOf = (status: string) => leadRows.find((r) => r._id === status)?.count ?? 0;
  const net = periodCollected - expPeriod.total;

  return {
    kpis: [
      { key: "collected", label: "Collected", value: periodCollected, format: "currency", hint: `In the selected period · ${formatCount(allCollected)} in total`, tone: "emerald" },
      { key: "expenses", label: "Expenses", value: expPeriod.total, format: "currency", hint: `${expPeriod.count} recorded in the period`, tone: "rose" },
      { key: "net", label: "Net", value: net, format: "currency", hint: "Collected minus expenses in the period", tone: net >= 0 ? "teal" : "amber" },
      { key: "outstanding", label: "Outstanding dues", value: outstanding, format: "currency", hint: `${active.length} active project${active.length === 1 ? "" : "s"} · as of today`, tone: "amber" },
      { key: "salaryDue", label: "Salary due", value: salaryDue, format: "currency", hint: "Pending team salaries · as of today", tone: "violet" },
      { key: "openLeads", label: "Open leads", value: openLeads, format: "number", hint: `${totalLeads} leads in total`, tone: "sky" },
      { key: "myBalance", label: "My accounts", value: myBalance, format: "currency", hint: "Balance on accounts you own", tone: "indigo" },
      { key: "team", label: "Team members", value: teamTotal, format: "number", hint: "Active and inactive users", tone: "blue" },
    ],
    trend: {
      title: "Money in vs money out",
      keys: [
        { key: "income", label: "Collected", color: "#10b981" },
        { key: "expense", label: "Expenses", color: "#f43f5e" },
      ],
      points: range.months.map((m) => ({
        label: m.label,
        income: collectedMap.get(m.key) ?? 0,
        expense: expenseMap.get(m.key) ?? 0,
      })),
    },
    breakdowns: [
      { key: "projectStatus", title: "Projects by status", type: "donut", items: countBy(projects.map((p) => pretty(p.status))) },
      {
        key: "leadPipeline",
        title: "Lead pipeline",
        type: "bar",
        items: LEAD_PIPELINE.map((s) => ({ label: pretty(s), value: leadCountOf(s) })),
      },
      { key: "expenseCategories", title: "Expenses by category (period)", type: "donut", items: categories },
      // { key: "teamRoles", title: "Team by role", type: "bar", items: userRows.map((r) => ({ label: pretty(r._id), value: r.count })) },
    ],
    lists: [
      {
        key: "recentExpenses",
        title: "Recent expenses (all users)",
        valueFormat: "currency",
        rows: recentExpenses.map((e) => {
          const cat = e.categoryId as unknown as { name?: string } | null;
          return {
            primary: e.description || cat?.name || "Expense",
            secondary: `By ${personName(e.createdBy)}`,
            value: e.amount,
            date: formatDay(e.expenseDate),
          };
        }),
      },
      { key: "deadlines", title: "Deadlines (next 14 days)", rows: deadlineRows(projects, 14, 6) },
      { key: "recentPayments", title: "Recent payments received", valueFormat: "currency", rows: recentPayments(projects, range, 6) },
    ],
  };
};

/**
 * Managers see every project (not only the ones they manage). They get no payment
 * data (collections, dues, payment history) and no trend chart. Their own expenses
 * follow the date range.
 */
const buildManager = async (actor: FinanceActor, range: DashboardRange): Promise<Body> => {
  const uid = oid(actor.userId);
  const projects = await loadProjects({});
  const active = projects.filter(isActive);
  const developers = new Set(projects.flatMap((p) => (p.developers ?? []).map((d) => String(d))));
  const overdue = active.filter((p) => p.endDate && daysUntil(new Date(p.endDate)) < 0).length;

  // Managers do not see payment data (collections, dues, payment history).
  const [expPeriod, myBalance, leadRows] = await Promise.all([
    expensesSince(range.from, uid, range.to),
    myAccountsBalance(uid),
    Lead.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]) as Promise<Array<{ _id: string; count: number }>>,
  ]);
  const openLeads = leadRows
    .filter((r) => r._id !== LeadStatus.WON && r._id !== LeadStatus.LOST)
    .reduce((s, r) => s + r.count, 0);

  return {
    kpis: [
      { key: "allProjects", label: "All projects", value: projects.length, format: "number", hint: `${active.length} active · as of today`, tone: "indigo" },
      { key: "overdue", label: "Overdue projects", value: overdue, format: "number", hint: "Past their end date and still active", tone: "rose" },
      { key: "team", label: "Developers assigned", value: developers.size, format: "number", hint: "Unique developers across all projects", tone: "blue" },
      { key: "openLeads", label: "Open leads", value: openLeads, format: "number", hint: "Leads not won or lost", tone: "sky" },
      { key: "expenses", label: "My expenses", value: expPeriod.total, format: "currency", hint: `${expPeriod.count} recorded in the period`, tone: "rose" },
      { key: "myBalance", label: "My accounts", value: myBalance, format: "currency", hint: "Balance on accounts you own", tone: "teal" },
    ],
    trend: null,
    breakdowns: [
      { key: "projectStatus", title: "Projects by status", type: "donut", items: countBy(projects.map((p) => pretty(p.status))) },
      {
        key: "leadPipeline",
        title: "Lead pipeline",
        type: "bar",
        items: LEAD_PIPELINE.map((s) => ({ label: pretty(s), value: leadRows.find((r) => r._id === s)?.count ?? 0 })),
      },
    ],
    lists: [
      { key: "deadlines", title: "Upcoming deadlines", rows: deadlineRows(projects, 30, 6) },
    ],
  };
};

const buildDeveloper = async (actor: FinanceActor): Promise<Body> => {
  const uid = oid(actor.userId);
  const projects = await loadProjects({ developers: uid });
  const active = projects.filter(isActive);
  const finished = projects.filter((p) => FINISHED_PROJECT_STATUSES.includes(p.status));
  const dueSoon = active.filter((p) => p.endDate && daysUntil(new Date(p.endDate)) >= 0 && daysUntil(new Date(p.endDate)) <= 14).length;

  const salaries = await TeamSalary.find({ user: uid, status: { $ne: SalaryPaymentStatus.CANCELLED } })
    .sort({ year: -1, month: -1 })
    .limit(12)
    .lean();
  const liveSalaries = salaries.filter((s) => !s.cancelledAt);
  const salaryReceived = liveSalaries.reduce((s, row) => s + (row.paidAmount ?? 0), 0);
  const salaryDue = liveSalaries.reduce((s, row) => s + (row.dueAmount ?? 0), 0);

  const [expMonth, myBalance] = await Promise.all([
    expensesSince(monthStart(), uid),
    myAccountsBalance(uid),
  ]);

  return {
    kpis: [
      { key: "assigned", label: "Assigned projects", value: projects.length, format: "number", hint: `${finished.length} finished`, tone: "indigo" },
      { key: "active", label: "Active projects", value: active.length, format: "number", hint: "In progress or planned", tone: "blue" },
      { key: "dueSoon", label: "Due in 14 days", value: dueSoon, format: "number", hint: "Active projects with a close deadline", tone: "amber" },
      { key: "salaryReceived", label: "Salary received", value: salaryReceived, format: "currency", hint: "Last 12 salary records", tone: "emerald" },
      { key: "salaryDue", label: "Salary due", value: salaryDue, format: "currency", hint: "Still to be paid", tone: "violet" },
      { key: "expenses", label: "My expenses this month", value: expMonth.total, format: "currency", hint: `${expMonth.count} recorded`, tone: "rose" },
      { key: "myBalance", label: "My accounts", value: myBalance, format: "currency", hint: "Balance on accounts you own", tone: "teal" },
      { key: "finished", label: "Finished projects", value: finished.length, format: "number", hint: "Completed or delivered", tone: "sky" },
    ],
    trend: null,
    breakdowns: [
      { key: "projectStatus", title: "My projects by status", type: "donut", items: countBy(projects.map((p) => pretty(p.status))) },
      { key: "projectType", title: "My projects by type", type: "bar", items: countBy(projects.map((p) => pretty(p.type))) },
    ],
    lists: [
      { key: "deadlines", title: "Upcoming deadlines", rows: deadlineRows(projects, 30, 6) },
      {
        key: "salaries",
        title: "My recent salary records",
        valueFormat: "currency",
        rows: liveSalaries.slice(0, 6).map((s) => ({
          primary: `${MONTHS[(s.month ?? 1) - 1] ?? s.month} ${s.year}`,
          secondary: `Paid ${Number(s.paidAmount ?? 0).toLocaleString("en-US")} of ${Number(s.totalAmount ?? 0).toLocaleString("en-US")}`,
          value: s.dueAmount ?? 0,
          badge: pretty(String(s.status)),
        })),
      },
    ],
  };
};

const buildLeadFocused = async (actor: FinanceActor): Promise<Body> => {
  const uid = oid(actor.userId);
  const leadMatch = { isDeleted: { $ne: true } };

  const [leadRows, leadsByMonth, clientRows, clientsByMonth, recentLeads, expMonth, myBalance] = await Promise.all([
    Lead.aggregate([{ $match: leadMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }]) as Promise<
      Array<{ _id: string; count: number }>
    >,
    monthlyCounts(Lead, "createdAt", leadMatch),
    Client.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]) as Promise<Array<{ _id: string; count: number }>>,
    monthlyCounts(Client, "createdAt", { isDeleted: { $ne: true } }),
    Lead.find(leadMatch).sort({ createdAt: -1 }).limit(6).select("firstName lastName company status createdAt").lean(),
    expensesSince(monthStart(), uid),
    myAccountsBalance(uid),
  ]);

  const total = leadRows.reduce((s, r) => s + r.count, 0);
  const won = leadRows.find((r) => r._id === "WON")?.count ?? 0;
  const newLeads = leadRows.find((r) => r._id === "NEW")?.count ?? 0;
  const thisMonthLeads = leadsByMonth.get(currentMonthKey()) ?? 0;
  const clientsTotal = clientRows.reduce((s, r) => s + r.count, 0);
  const clientsActive = clientRows.find((r) => r._id === "ACTIVE")?.count ?? 0;
  const monthly = lastSixMonths();

  return {
    kpis: [
      { key: "leads", label: "Total leads", value: total, format: "number", hint: `${newLeads} new and waiting`, tone: "sky" },
      { key: "thisMonthLeads", label: "New leads this month", value: thisMonthLeads, format: "number", hint: "Added in the current month", tone: "indigo" },
      { key: "conversion", label: "Conversion rate", value: total ? Math.round((won / total) * 100) : 0, format: "percent", hint: `${won} leads won`, tone: "emerald" },
      { key: "clients", label: "Clients", value: clientsTotal, format: "number", hint: `${clientsActive} active`, tone: "blue" },
      { key: "expenses", label: "My expenses this month", value: expMonth.total, format: "currency", hint: `${expMonth.count} recorded`, tone: "rose" },
      { key: "myBalance", label: "My accounts", value: myBalance, format: "currency", hint: "Balance on accounts you own", tone: "teal" },
    ],
    trend: {
      title: "Leads and clients added (6 months)",
      keys: [
        { key: "leads", label: "Leads", color: "#0ea5e9" },
        { key: "clients", label: "Clients", color: "#6366f1" },
      ],
      points: monthly.map((m) => ({
        label: m.label,
        leads: leadsByMonth.get(m.key) ?? 0,
        clients: clientsByMonth.get(m.key) ?? 0,
      })),
    },
    breakdowns: [
      {
        key: "leadPipeline",
        title: "Lead pipeline",
        type: "bar",
        items: LEAD_PIPELINE.map((s) => ({ label: pretty(s), value: leadRows.find((r) => r._id === s)?.count ?? 0 })),
      },
      { key: "clientStatus", title: "Clients by status", type: "donut", items: clientRows.map((r) => ({ label: pretty(r._id), value: r.count })) },
    ],
    lists: [
      {
        key: "recentLeads",
        title: "Recent leads",
        rows: recentLeads.map((l) => ({
          primary: `${l.firstName} ${l.lastName}`.trim(),
          secondary: l.company || "No company",
          badge: pretty(String(l.status)),
          date: formatDay(l.createdAt),
        })),
      },
    ],
  };
};

/* -------------------------------------------------------------------------- */
/*                                  Entry                                     */
/* -------------------------------------------------------------------------- */

/**
 * The dashboard shows different data per role:
 * - SUPER_ADMIN / ADMIN: company-wide money, projects, leads and team. Date filter applies.
 * - MANAGER: all projects, deadlines and their own expenses (no payment data). Date filter applies to expenses.
 * - DEVELOPER / DESIGNER: the projects they are assigned to, their salary and deadlines.
 * - MARKETER / STAFF: leads and clients, plus their own expenses.
 * Balances are always limited to accounts the user owns.
 */
const getOverview = async (actor: FinanceActor, query: Record<string, unknown> = {}): Promise<DashboardOverview> => {
  const user = await User.findById(actor.userId).select("firstName lastName email").lean();
  const name = personName(user) || "there";
  const range = resolveRange(query);

  let body: Body;
  if (ADMIN_ROLES.includes(actor.role)) {
    body = await buildAdmin(actor, range);
  } else if (actor.role === Role.MANAGER) {
    body = await buildManager(actor, range);
  } else if (actor.role === Role.DEVELOPER || actor.role === Role.DESIGNER) {
    body = await buildDeveloper(actor);
  } else {
    body = await buildLeadFocused(actor);
  }

  return {
    role: actor.role,
    name,
    generatedAt: now().toISOString(),
    range: { startDate: range.startDate, endDate: range.endDate },
    ...body,
  };
};

export const DashboardService = { getOverview };
