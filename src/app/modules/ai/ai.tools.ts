import { JwtPayload } from "jsonwebtoken";
import { z } from "zod";
import { MAX_TOOL_RECORDS, MAX_TOOL_RESULT_CHARS } from "./ai.constant";
import { Role } from "../user/user.interface";
import { ProjectServices } from "../project/project.service";
import { ClientServices } from "../clients/client.service";
import { LeadServices } from "../lead/lead.service";
import { DashboardService } from "../dashboard/dashboard.service";
import { LoanService } from "../loan/loan.service";
import { FinancialAccountService } from "../financial-account/financial-account.service";
import {
  canViewProjectValue,
  sanitizeClientsForRole,
  sanitizeProjectForRole,
  sanitizeProjectsForRole,
} from "../../utils/projectValue";
import { FinanceActor } from "../../utils/financeScope";
import { TeamSalaryServices } from "../team-salary/team-salary.service";
import { AttendanceService } from "../attendance/attendance.service";
import { LeaveService } from "../leave/leave.service";
import { LeaveBalanceService } from "../leave/leave.balance.service";
import { ExpenseService } from "../expense/expense.service";
import { TransactionService } from "../transaction/transaction.service";
import { FundTransferService } from "../fund-transfer/fund-transfer.service";
import { UserServices } from "../user/user.service";
import { AiToolDeclaration, AiToolSchema } from "./providers/ai-provider.interface";

/**
 * Read-only tools for the AI assistant.
 *
 * Rules every tool follows:
 *  - It only calls an existing service-layer function (never a model directly, never a write).
 *  - `allowedRoles` mirrors the role list of the matching REST route, because several services
 *    do not check the role themselves.
 *  - Money fields are stripped for roles that may not see project value (see utils/projectValue).
 *  - Results are compacted and capped so they cannot flood the model context.
 */

type Json = Record<string, unknown>;

export interface AiTool {
  name: string;
  description: string;
  parameters: AiToolSchema;
  allowedRoles: string[];
  run: (args: unknown, actor: JwtPayload) => Promise<unknown>;
}

const ADMINS = [Role.SUPER_ADMIN, Role.ADMIN];
const ADMINS_AND_MANAGER = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER];
const SALES_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGER,
  Role.SALES_MARKETING,
  Role.MARKETING_SALES_LEAD,
];
const ALL_ROLES = Object.values(Role) as string[];

const PROJECT_STATUSES = [
  "PLANNING",
  "IN_PROGRESS",
  "QA_TESTING",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
  "DONE_DUE",
  "DELIVERED",
  "PENDING",
] as const;
const ACTIVE_PROJECT_STATUSES = ["PLANNING", "IN_PROGRESS", "QA_TESTING", "ON_HOLD", "PENDING"];

// ---------- small helpers ----------

const toPlain = (value: unknown): Json => {
  const doc = value as { toObject?: () => Json } | null;
  if (doc && typeof doc.toObject === "function") return doc.toObject();
  return (value ?? {}) as Json;
};

const personName = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  const v = toPlain(value);
  if (typeof v.fullName === "string" && v.fullName) return v.fullName;
  const joined = [v.firstName, v.lastName].filter((x) => typeof x === "string" && x).join(" ");
  if (joined) return joined;
  if (typeof v.companyName === "string") return v.companyName;
  if (typeof v.name === "string") return v.name;
  return undefined;
};

const day = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

const clampLimit = (limit: number | undefined, fallback = 10) =>
  Math.min(Math.max(limit ?? fallback, 1), MAX_TOOL_RECORDS);

const compactProject = (project: unknown, role: string): Json => {
  const p = toPlain(sanitizeProjectForRole(project, role));
  const out: Json = {
    id: String(p._id ?? ""),
    name: p.name,
    status: p.status,
    type: p.type,
    client: personName(p.client),
    projectManager: personName(p.projectManager),
    developers: Array.isArray(p.developers)
      ? p.developers.map(personName).filter(Boolean)
      : undefined,
    startDate: day(p.startDate),
    endDate: day(p.endDate),
    priority: p.priority,
  };
  // sanitizeProjectForRole already removed these for non-admins; only copy them for admins.
  if (canViewProjectValue(role)) {
    out.budget = p.budget;
    out.paymentStatus = p.paymentStatus;
    out.receivedAmount = p.receivedAmount;
    out.outstandingAmount = p.outstandingAmount;
    out.overpaidAmount = p.overpaidAmount;
    out.nextPaymentDate = day(p.nextPaymentDate);
  }
  return out;
};

const compactClient = (client: unknown, role: string): Json => {
  const c = toPlain(client);
  const out: Json = {
    id: String(c._id ?? ""),
    clientCode: c.clientCode,
    name: personName(c),
    companyName: c.companyName,
    email: c.email,
    phone: c.phone,
    status: c.status,
    totalProjects: c.totalProjects,
    activeProjects: c.activeProjects,
    completedProjects: c.completedProjects,
    nextFollowUp: day(c.nextFollowUp),
  };
  if (canViewProjectValue(role)) {
    out.totalRevenue = c.totalRevenue;
    out.totalPaid = c.totalPaid;
    out.totalDue = c.totalDue;
  }
  return out;
};

const compactLead = (lead: unknown): Json => {
  const l = toPlain(lead);
  return {
    id: String(l._id ?? ""),
    name: personName(l),
    company: l.company,
    email: l.email,
    phone: l.phone,
    source: l.source,
    status: l.status,
    priority: l.priority,
    pipelineStage: l.pipelineStage,
    estimatedValue: l.estimatedValue,
    expectedCloseDate: day(l.expectedCloseDate),
    nextContactAt: day(l.nextContactAt),
    requirementTitle: l.requirementTitle,
  };
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// ---------- tools ----------

const findProjectsArgs = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  limit: z.number().int().min(1).max(MAX_TOOL_RECORDS).optional(),
});

const projectDuesArgs = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(MAX_TOOL_RECORDS).optional(),
});

const getProjectArgs = z.object({ projectId: z.string().regex(/^[0-9a-fA-F]{24}$/) });

const deadlinesArgs = z.object({
  days: z.number().int().min(1).max(180).optional(),
});

const searchArgs = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(MAX_TOOL_RECORDS).optional(),
});

const searchLeadsArgs = searchArgs.extend({
  status: z.string().trim().max(40).optional(),
});

// ---------- HR / finance helpers ----------
// allowedRoles below copy the role list of the matching REST route. Scoping to "own data only"
// (expenses, accounts, leave, attendance) is done by the service itself from the actor.

/** Same list as GET /team-salaries/my-salaries (admins use team_salaries instead). */
const MY_SALARY_ROLES = ALL_ROLES.filter((r) => r !== Role.SUPER_ADMIN && r !== Role.ADMIN);

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "must be a 24-char id");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM");
const limitArg = z.number().int().min(1).max(MAX_TOOL_RECORDS).optional();

const followUpCalendarArgs = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  limit: limitArg,
});

const limitSchema = { type: "integer", minimum: 1, maximum: MAX_TOOL_RECORDS } as const;

const compactSalary = (salary: unknown): Json => {
  const s = toPlain(salary);
  const payments = Array.isArray(s.payments) ? (s.payments as unknown[]) : [];
  return {
    id: String(s._id ?? ""),
    employee: personName(s.user),
    month: s.month,
    year: s.year,
    status: s.status,
    salaryAmount: s.salaryAmount,
    extraName: s.extraName,
    extraAmount: s.extraAmount,
    totalAmount: s.totalAmount,
    paidAmount: s.paidAmount,
    dueAmount: s.dueAmount,
    note: s.note,
    payments: payments.slice(0, 10).map((p) => {
      const x = toPlain(p);
      return {
        amount: x.amount,
        paymentFor: x.paymentFor,
        paymentMethod: x.paymentMethod,
        paymentDate: day(x.paymentDate),
        reference: x.paymentReference,
      };
    }),
  };
};

const compactAttendanceDay = (record: unknown): Json => {
  const a = toPlain(record);
  const time = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  return {
    employee: personName(a.user),
    date: a.date,
    state: a.state,
    checkIn: time(a.checkIn),
    checkOut: time(a.checkOut),
    totalWorkMinutes: a.totalWorkMinutes,
    breakMinutes: a.breakMinutes,
    isMissingCheckOut: a.isMissingCheckOut,
    isEdited: a.isEdited,
  };
};

const compactLeave = (request: unknown): Json => {
  const l = toPlain(request);
  return {
    id: String(l._id ?? ""),
    employee: personName(l.staff),
    leaveType: l.leaveType,
    status: l.status,
    startDate: day(l.startDate),
    endDate: day(l.endDate),
    totalDays: l.totalDays,
    paidDays: l.paidDays,
    extraDays: l.extraDays,
    reason: l.reason,
    decidedBy: personName(l.decidedBy),
    decidedAt: day(l.decidedAt),
    decisionNote: l.decisionNote,
    rejectReason: l.rejectReason,
  };
};

const compactExpense = (expense: unknown): Json => {
  const e = toPlain(expense);
  return {
    id: String(e._id ?? ""),
    date: day(e.expenseDate),
    amount: e.amount,
    category: personName(e.categoryId),
    account: toPlain(e.financialAccountId).accountName,
    description: e.description,
    reference: e.reference,
    createdBy: personName(e.createdBy),
  };
};

const compactAccount = (account: unknown): Json => {
  const a = toPlain(account);
  return {
    id: String(a._id ?? ""),
    accountName: a.accountName,
    accountType: a.accountType,
    bankName: a.bankName,
    accountNumber: a.accountNumber,
    owner: personName(a.ownerId),
    openingBalance: a.openingBalance,
    currentBalance: a.currentBalance,
    status: a.status,
  };
};

const compactTransaction = (tx: unknown): Json => {
  const t = toPlain(tx);
  return {
    date: day(t.date),
    account: toPlain(t.accountId).accountName,
    direction: t.direction,
    type: t.type,
    amount: t.amount,
    balanceAfter: t.balanceAfter,
    note: t.note,
    isReversal: t.isReversal,
    createdBy: personName(t.createdBy),
  };
};

const compactTransfer = (transfer: unknown): Json => {
  const t = toPlain(transfer);
  return {
    id: String(t._id ?? ""),
    date: day(t.transferDate),
    from: toPlain(t.fromAccountId).accountName,
    to: toPlain(t.toAccountId).accountName,
    amount: t.amount,
    reference: t.reference,
    note: t.note,
    createdBy: personName(t.createdBy),
  };
};

const compactLoan = (loan: unknown): Json => {
  const l = toPlain(loan);
  return {
    id: String(l._id ?? ""),
    lender: l.lenderName,
    principalAmount: l.principalAmount,
    repaidAmount: l.repaidAmount,
    dueAmount: l.dueAmount,
    status: l.status,
    receivedDate: day(l.receivedDate),
    dueDate: day(l.dueDate),
    account: toPlain(l.receivedAccountId).accountName,
    note: l.note,
  };
};

const compactStaff = (user: unknown): Json => {
  const u = toPlain(user);
  return {
    id: String(u._id ?? ""),
    name: personName(u),
    role: u.role,
    designation: u.designation,
    department: u.department,
    status: u.status,
  };
};

const resultList = (res: unknown): unknown[] => {
  const r = res as { result?: unknown[]; data?: unknown[] };
  return r.result ?? r.data ?? [];
};

const salaryListArgs = z.object({
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(3000).optional(),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]).optional(),
  limit: limitArg,
});
const teamSalaryArgs = salaryListArgs.extend({
  userId: objectId.optional(),
  search: z.string().trim().max(100).optional(),
});
const salarySummaryArgs = salaryListArgs.omit({ limit: true });
const attendanceMonthArgs = z.object({ month: monthStr.optional() });
const attendanceListArgs = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  userId: objectId.optional(),
  limit: limitArg,
});
const leaveListArgs = z.object({
  status: z.string().trim().max(30).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  staffId: objectId.optional(),
  limit: limitArg,
});
const leaveBalanceArgs = z.object({
  staffId: objectId.optional(),
  year: z.number().int().min(2000).max(3000).optional(),
});
const expenseArgs = z.object({
  search: z.string().trim().max(100).optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  mine: z.boolean().optional(),
  limit: limitArg,
});
const accountsArgs = z.object({
  search: z.string().trim().max(100).optional(),
  allAccounts: z.boolean().optional(),
  limit: limitArg,
});
const transactionsArgs = z.object({
  accountId: objectId.optional(),
  direction: z.enum(["IN", "OUT"]).optional(),
  type: z.string().trim().max(30).optional(),
  search: z.string().trim().max(100).optional(),
  limit: limitArg,
});
const loansArgs = z.object({
  status: z.enum(["ACTIVE", "PAID"]).optional(),
  search: z.string().trim().max(100).optional(),
  limit: limitArg,
});
const staffArgs = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.string().trim().max(30).optional(),
  limit: limitArg,
});
const projectPaymentsArgs = z.object({
  projectId: objectId.optional(),
  financialAccountId: objectId.optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  limit: limitArg,
});

const AI_TOOLS: AiTool[] = [
  {
    name: "find_projects",
    description:
      "List/search projects by name and optionally by status. Returns name, status, client, dates, team " +
      "and (admins only) budget/received/outstanding. Also returns status counts for the matched set. " +
      "Use it for project status questions.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Project name or keyword, e.g. 'SM Bazar'." },
        status: { type: "string", enum: [...PROJECT_STATUSES] },
        limit: { type: "integer", minimum: 1, maximum: MAX_TOOL_RECORDS },
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw, actor) => {
      const args = findProjectsArgs.parse(raw ?? {});
      const query: Record<string, string> = {
        limit: String(clampLimit(args.limit)),
        sort: "-startDate",
      };
      if (args.search) query.searchTerm = args.search;
      if (args.status) query.status = args.status;
      const res = await ProjectServices.getProjects(query, actor);
      return {
        projects: sanitizeProjectsForRole(res.data, actor.role).map((p) =>
          compactProject(p, actor.role),
        ),
        total: (res.meta as Json | undefined)?.total,
        stats: res.stats,
      };
    },
  },
  {
    name: "get_project",
    description: "Get the details of one project by its id (use find_projects first to get ids).",
    parameters: {
      type: "object",
      properties: { projectId: { type: "string", description: "24-char project id" } },
      required: ["projectId"],
    },
    allowedRoles: [...ADMINS_AND_MANAGER, Role.DEVELOPER],
    run: async (raw, actor) => {
      const { projectId } = getProjectArgs.parse(raw ?? {});
      const res = await ProjectServices.getProjectById(projectId, actor);
      return { project: compactProject((res as Json).data, actor.role) };
    },
  },
  {
    name: "project_dues",
    description:
      "Outstanding (unpaid) amount per project: budget, received and outstanding. With 'search' it " +
      "returns the matching project(s) even if fully paid (outstanding 0). Without 'search' it lists " +
      "projects that still have a due, largest first, plus the overall total due. " +
      "Use it for 'koto baki / how much is due' questions. Never compute the numbers yourself.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Project name, e.g. 'SM Bazar'. Omit for all dues." },
        limit: { type: "integer", minimum: 1, maximum: MAX_TOOL_RECORDS },
      },
    },
    allowedRoles: ADMINS,
    run: async (raw, actor) => {
      const args = projectDuesArgs.parse(raw ?? {});
      const query: Record<string, string> = { limit: String(clampLimit(args.limit)) };
      if (args.search) {
        query.searchTerm = args.search;
        query.sort = "-startDate";
      } else {
        query.paymentStatus = "OUTSTANDING";
        query.sort = "-outstandingAmount";
      }
      const res = await ProjectServices.getProjects(query, actor);
      return {
        projects: sanitizeProjectsForRole(res.data, actor.role).map((p) => {
          const c = compactProject(p, actor.role);
          return {
            id: c.id,
            name: c.name,
            client: c.client,
            status: c.status,
            paymentStatus: c.paymentStatus,
            budget: c.budget,
            receivedAmount: c.receivedAmount,
            outstandingAmount: c.outstandingAmount,
            overpaidAmount: c.overpaidAmount,
            nextPaymentDate: c.nextPaymentDate,
          };
        }),
        total: (res.meta as Json | undefined)?.total,
        stats: res.stats,
      };
    },
  },
  {
    name: "upcoming_deadlines",
    description:
      "Active projects (planning, in progress, QA, on hold, pending) whose end date is within the next " +
      "N days, plus active projects already past their end date (overdue).",
    parameters: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 180, description: "Look-ahead window. Default 30." },
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw, actor) => {
      const { days = 30 } = deadlinesArgs.parse(raw ?? {});
      const today = startOfToday();
      const until = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

      const results = await Promise.all(
        ACTIVE_PROJECT_STATUSES.map((status) =>
          ProjectServices.getProjects({ status, sort: "endDate", limit: "100" }, actor),
        ),
      );
      const withEnd = results
        .flatMap((r) => sanitizeProjectsForRole(r.data, actor.role))
        .map((p) => ({ p, end: toPlain(p).endDate ? new Date(String(toPlain(p).endDate)) : null }))
        .filter((x): x is { p: (typeof x)["p"]; end: Date } => !!x.end && !Number.isNaN(x.end.getTime()))
        .sort((a, b) => a.end.getTime() - b.end.getTime());

      const upcoming = withEnd.filter((x) => x.end >= today && x.end <= until);
      const overdue = withEnd.filter((x) => x.end < today);
      const pick = (list: typeof withEnd) =>
        list.slice(0, MAX_TOOL_RECORDS).map((x) => {
          const c = compactProject(x.p, actor.role);
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            client: c.client,
            endDate: c.endDate,
            outstandingAmount: c.outstandingAmount,
          };
        });
      return {
        today: day(today),
        windowDays: days,
        upcomingCount: upcoming.length,
        upcoming: pick(upcoming),
        overdueCount: overdue.length,
        overdue: pick(overdue),
      };
    },
  },
  {
    name: "search_clients",
    description: "Search clients by name, company, email or phone.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: MAX_TOOL_RECORDS },
      },
    },
    allowedRoles: SALES_ROLES,
    run: async (raw, actor) => {
      const args = searchArgs.parse(raw ?? {});
      const query: Record<string, string> = { limit: String(clampLimit(args.limit)) };
      if (args.search) query.searchTerm = args.search;
      const res = await ClientServices.getClients(query, actor);
      return {
        clients: sanitizeClientsForRole(res.data as unknown[], actor.role).map((c) =>
          compactClient(c, actor.role),
        ),
        total: (res.meta as Json | undefined)?.total,
      };
    },
  },
  {
    name: "search_leads",
    description: "Search sales leads by name, company, email or phone; optionally filter by status.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        status: { type: "string", description: "Lead status value, e.g. NEW." },
        limit: { type: "integer", minimum: 1, maximum: MAX_TOOL_RECORDS },
      },
    },
    allowedRoles: SALES_ROLES,
    run: async (raw) => {
      const args = searchLeadsArgs.parse(raw ?? {});
      const query: Record<string, string> = { limit: String(clampLimit(args.limit)) };
      if (args.search) query.searchTerm = args.search;
      if (args.status) query.status = args.status;
      const res = (await LeadServices.getLeads(query)) as unknown as {
        data?: unknown[];
        meta?: Json;
        stats?: unknown;
      };
      return {
        leads: (res.data ?? []).map(compactLead),
        total: res.meta?.total,
        stats: res.stats,
      };
    },
  },
  {
    name: "followup_calendar",
    description:
      "Lead follow-up calendar: confirmed-meeting leads with a scheduled next contact, grouped by date " +
      "(Bangladesh date, YYYY-MM-DD), earliest first. Each lead has name, phone, status, next contact " +
      "time and the latest note. Optional from/to (YYYY-MM-DD) limit the dates; default is today onwards. " +
      "Use it for 'kon din kar follow-up / today's or this week's follow-ups' questions.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD. Default: today (Bangladesh time)." },
        to: { type: "string", description: "YYYY-MM-DD. Default: no upper limit." },
        limit: limitSchema,
      },
    },
    allowedRoles: SALES_ROLES,
    run: async (raw) => {
      const args = followUpCalendarArgs.parse(raw ?? {});
      const todayBd = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const from = args.from ?? todayBd;
      const res = await LeadServices.getFollowUpCalendar();
      const days = res.data.filter((d) => d.date >= from && (!args.to || d.date <= args.to));

      let remaining = clampLimit(args.limit, 20);
      let totalLeads = 0;
      const calendar: Json[] = [];
      for (const d of days) {
        totalLeads += d.leads.length;
        if (remaining <= 0) continue;
        const leads = d.leads.slice(0, remaining);
        remaining -= leads.length;
        calendar.push({
          date: d.date,
          count: d.leads.length,
          leads: leads.map((l) => {
            const lastNote = l.notes[l.notes.length - 1]?.message;
            return {
              id: l._id,
              name: l.fullName,
              phone: l.phone,
              status: l.status,
              nextContactAt: l.nextContactAt.toISOString(),
              latestNote: lastNote ? lastNote.slice(0, 200) : undefined,
            };
          }),
        });
      }
      return { today: todayBd, from, to: args.to, totalDays: days.length, totalLeads, calendar };
    },
  },
  {
    name: "dashboard_overview",
    description:
      "The same role-scoped overview the user sees on the dashboard home page (key numbers for their role).",
    parameters: { type: "object", properties: {} },
    allowedRoles: ALL_ROLES,
    run: async (_raw, actor) => DashboardService.getOverview(actor as FinanceActor, {}),
  },
  {
    name: "finance_summary",
    description:
      "Financial account balances summary and loan summary, scoped to the accounts the user owns " +
      "(admins see everything).",
    parameters: { type: "object", properties: {} },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (_raw, actor) => {
      const [accounts, loans] = await Promise.all([
        FinancialAccountService.getFinancialAccountSummary(actor as FinanceActor),
        LoanService.getLoanSummary(actor as FinanceActor),
      ]);
      return { accounts, loans };
    },
  },

  // ----- staff directory -----
  {
    name: "find_staff",
    description:
      "Look up team members by name/email to get their id, role, designation and department. " +
      "Use it to turn a person's name into a userId/staffId for the salary, attendance and leave tools.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Name, email, designation or department." },
        role: { type: "string", description: "Role value, e.g. DEVELOPER." },
        limit: limitSchema,
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw) => {
      const args = staffArgs.parse(raw ?? {});
      const query: Record<string, string> = { limit: String(clampLimit(args.limit)) };
      if (args.search) query.searchTerm = args.search;
      if (args.role) query.role = args.role;
      const res = await UserServices.getUsers(query);
      return {
        staff: resultList(res).map(compactStaff),
        total: (res.meta as Json | undefined)?.total,
      };
    },
  },

  // ----- salary -----
  {
    name: "my_salaries",
    description:
      "The logged-in user's own salary records (month, salary, extra, total, paid, due, status and " +
      "payments), newest first, with their personal salary totals. Optional month (1-12), year, status.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "integer", minimum: 1, maximum: 12 },
        year: { type: "integer" },
        status: { type: "string", enum: ["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] },
        limit: limitSchema,
      },
    },
    allowedRoles: MY_SALARY_ROLES,
    run: async (raw, actor) => {
      const args = salaryListArgs.parse(raw ?? {});
      const query: Record<string, string> = { limit: String(clampLimit(args.limit)) };
      if (args.month) query.month = String(args.month);
      if (args.year) query.year = String(args.year);
      if (args.status) query.status = args.status;
      const res = await TeamSalaryServices.getMySalaries(actor, query);
      return {
        salaries: resultList(res).map(compactSalary),
        total: (res.meta as Json | undefined)?.total,
        stats: (res as { stats?: Json }).stats,
      };
    },
  },
  {
    name: "team_salaries",
    description:
      "Salary records of team members: salary, extra, total, paid, due, status and payments. Filter by " +
      "month (1-12), year, status, a userId (from find_staff) or a name keyword.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "integer", minimum: 1, maximum: 12 },
        year: { type: "integer" },
        status: { type: "string", enum: ["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] },
        userId: { type: "string", description: "24-char user id" },
        search: { type: "string", description: "Employee name keyword." },
        limit: limitSchema,
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw) => {
      const args = teamSalaryArgs.parse(raw ?? {});
      const query: Record<string, string> = {
        limit: String(clampLimit(args.limit)),
        sort: "-year,-month",
      };
      if (args.month) query.month = String(args.month);
      if (args.year) query.year = String(args.year);
      if (args.status) query.status = args.status;
      if (args.userId) query.user = args.userId;
      if (args.search) query.searchTerm = args.search;
      const res = await TeamSalaryServices.getTeamSalaries(query);
      return {
        salaries: resultList(res).map(compactSalary),
        total: (res.meta as Json | undefined)?.total,
      };
    },
  },
  {
    name: "salary_summary",
    description:
      "Payroll totals (total, paid, due and counts per status) for a month/year, or overall when no filter is given.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "integer", minimum: 1, maximum: 12 },
        year: { type: "integer" },
        status: { type: "string", enum: ["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] },
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw) => {
      const args = salarySummaryArgs.parse(raw ?? {});
      const query: Record<string, string> = {};
      if (args.month) query.month = String(args.month);
      if (args.year) query.year = String(args.year);
      if (args.status) query.status = args.status;
      const res = await TeamSalaryServices.getSalarySummary(query);
      return (res as { data?: unknown }).data ?? res;
    },
  },

  // ----- attendance -----
  {
    name: "my_attendance",
    description:
      "The logged-in user's own attendance for a month (YYYY-MM, default this month): days present, " +
      "check-in/out, work and break minutes, and total minutes for the month. Also returns today's state.",
    parameters: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM" } },
    },
    allowedRoles: ALL_ROLES,
    run: async (raw, actor) => {
      const { month } = attendanceMonthArgs.parse(raw ?? {});
      const who = { userId: String(actor.userId), role: String(actor.role) };
      const [monthData, today] = await Promise.all([
        AttendanceService.getMyMonth(who, month),
        AttendanceService.getToday(who),
      ]);
      return {
        month: monthData.month,
        daysPresent: monthData.daysPresent,
        monthlyTotalMinutes: monthData.monthlyTotalMinutes,
        days: monthData.days.slice(0, 31).map(compactAttendanceDay),
        today: { state: today.state, record: today.record ? compactAttendanceDay(today.record) : null },
      };
    },
  },
  {
    name: "attendance_records",
    description:
      "Attendance records of team members, newest first. Filter by from/to dates (YYYY-MM-DD) and/or a " +
      "userId (from find_staff).",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        userId: { type: "string", description: "24-char user id" },
        limit: limitSchema,
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw) => {
      const args = attendanceListArgs.parse(raw ?? {});
      const res = await AttendanceService.list({
        page: 1,
        limit: clampLimit(args.limit),
        from: args.from,
        to: args.to,
        userId: args.userId,
      });
      return { records: res.result.map(compactAttendanceDay), total: res.meta.total };
    },
  },
  {
    name: "attendance_summary",
    description:
      "Monthly attendance totals per team member (days present, total minutes, days with a missing " +
      "check-out). Month is YYYY-MM, default this month.",
    parameters: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM" } },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw) => {
      const { month } = attendanceMonthArgs.parse(raw ?? {});
      const res = await AttendanceService.getSummary(month);
      return {
        month: res.month,
        staff: res.staff.slice(0, 60).map((row) => ({
          employee: personName(row.user),
          role: toPlain(row.user).role,
          daysPresent: row.daysPresent,
          totalMinutes: row.totalMinutes,
          missingCheckOutDays: row.missingCheckOutDays,
        })),
      };
    },
  },

  // ----- leave -----
  {
    name: "leave_requests",
    description:
      "Leave requests. Normal staff get only their own; admins and managers get everyone's (optionally " +
      "for one staffId). Filter by status, from/to dates (YYYY-MM-DD).",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "e.g. PENDING, APPROVED, REJECTED, CANCELLED" },
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        staffId: { type: "string", description: "24-char user id (admins/managers only)" },
        limit: limitSchema,
      },
    },
    allowedRoles: ALL_ROLES,
    run: async (raw, actor) => {
      const args = leaveListArgs.parse(raw ?? {});
      const res = await LeaveService.listRequests(
        {
          page: 1,
          limit: clampLimit(args.limit),
          status: args.status as never,
          from: args.from,
          to: args.to,
          staff: args.staffId,
        },
        { userId: String(actor.userId), role: String(actor.role) },
      );
      return { requests: res.result.map(compactLeave), total: res.meta.total };
    },
  },
  {
    name: "leave_balance",
    description:
      "Leave balance (quota, used, remaining per leave type) for a year (default this year). Without " +
      "staffId it is the logged-in user's own balance; staffId is for admins and managers only.",
    parameters: {
      type: "object",
      properties: {
        staffId: { type: "string", description: "24-char user id (admins/managers only)" },
        year: { type: "integer" },
      },
    },
    allowedRoles: ALL_ROLES,
    run: async (raw, actor) => {
      const args = leaveBalanceArgs.parse(raw ?? {});
      const targetId = args.staffId ?? String(actor.userId);
      if (targetId !== String(actor.userId) && !ADMINS_AND_MANAGER.includes(actor.role)) {
        throw new Error("You can only view your own leave balance.");
      }
      return LeaveBalanceService.getBalanceSummary(targetId, args.year ?? new Date().getUTCFullYear());
    },
  },

  // ----- expenses -----
  {
    name: "expenses",
    description:
      "Expenses (date, amount, category, account, description), newest first, with their total. " +
      "Admins see everyone's expenses (set mine=true for only their own); other roles see only expenses they recorded. " +
      "Filter by startDate/endDate (YYYY-MM-DD) or a keyword.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
        mine: { type: "boolean" },
        limit: limitSchema,
      },
    },
    allowedRoles: ALL_ROLES,
    run: async (raw, actor) => {
      const args = expenseArgs.parse(raw ?? {});
      const query: Record<string, string> = {
        limit: String(clampLimit(args.limit)),
        sort: "-expenseDate",
      };
      if (args.search) query.searchTerm = args.search;
      if (args.startDate) query.startDate = args.startDate;
      if (args.endDate) query.endDate = args.endDate;
      if (args.mine) query.mine = "true";
      const res = await ExpenseService.getAllExpenses(query, actor as FinanceActor);
      return { expenses: resultList(res).map(compactExpense), total: res.meta?.total };
    },
  },
  {
    name: "expense_summary",
    description:
      "Expense totals (overall, this month, by category) for the same expenses the 'expenses' tool can see. " +
      "Optional startDate/endDate (YYYY-MM-DD); mine=true for only the user's own.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
        mine: { type: "boolean" },
      },
    },
    allowedRoles: ALL_ROLES,
    run: async (raw, actor) => {
      const args = expenseArgs.omit({ search: true, limit: true }).parse(raw ?? {});
      const query: Record<string, unknown> = {};
      if (args.startDate) query.startDate = args.startDate;
      if (args.endDate) query.endDate = args.endDate;
      if (args.mine) query.mine = "true";
      return ExpenseService.getExpenseSummary(query, actor as FinanceActor);
    },
  },

  // ----- accounts and money movement -----
  {
    name: "financial_accounts",
    description:
      "Financial accounts (cash, bank, mobile banking) with owner and balances. Users see only accounts " +
      "they own; admins can set allAccounts=true to list every account.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Account name, bank or number." },
        allAccounts: { type: "boolean", description: "Admins only: include every owner's accounts." },
        limit: limitSchema,
      },
    },
    allowedRoles: ALL_ROLES,
    run: async (raw, actor) => {
      const args = accountsArgs.parse(raw ?? {});
      const query: Record<string, unknown> = { limit: String(clampLimit(args.limit)) };
      if (args.search) query.searchTerm = args.search;
      // The service only honours scope=all for admins; non-admins always get their own accounts.
      if (args.allAccounts && ADMINS.includes(actor.role)) query.scope = "all";
      const res = await FinancialAccountService.getAllFinancialAccounts(query, actor as FinanceActor);
      return { accounts: resultList(res).map(compactAccount), total: res.meta?.total };
    },
  },
  {
    name: "transactions",
    description:
      "Ledger transactions (money in/out) on the user's own accounts, newest first: date, account, " +
      "direction, type, amount, balance after, note. Filter by accountId, direction, type or note keyword.",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "24-char account id" },
        direction: { type: "string", enum: ["IN", "OUT"] },
        type: {
          type: "string",
          description:
            "DEPOSIT, LOAN_RECEIVED, LOAN_REPAYMENT, TRANSFER_IN, TRANSFER_OUT, SALARY, EXPENSE, PROJECT_PAYMENT",
        },
        search: { type: "string", description: "Keyword in the note." },
        limit: limitSchema,
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw, actor) => {
      const args = transactionsArgs.parse(raw ?? {});
      const query: Record<string, unknown> = { limit: String(clampLimit(args.limit)), sort: "-date" };
      if (args.accountId) query.accountId = args.accountId;
      if (args.direction) query.direction = args.direction;
      if (args.type) query.type = args.type;
      if (args.search) query.searchTerm = args.search;
      const res = await TransactionService.getAllTransactions(query, actor as FinanceActor);
      return { transactions: resultList(res).map(compactTransaction), total: res.meta?.total };
    },
  },
  {
    name: "fund_transfers",
    description: "Transfers between financial accounts: date, from, to, amount, reference, note.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Keyword in reference or note." },
        limit: limitSchema,
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw) => {
      const args = searchArgs.parse(raw ?? {});
      const query: Record<string, unknown> = { limit: String(clampLimit(args.limit)), sort: "-transferDate" };
      if (args.search) query.searchTerm = args.search;
      const res = await FundTransferService.getAllFundTransfers(query);
      return { transfers: resultList(res).map(compactTransfer), total: res.meta?.total };
    },
  },
  {
    name: "loans",
    description:
      "Loans received into the user's own accounts: lender, principal, repaid, due, status, dates. " +
      "Filter by status (ACTIVE/PAID) or lender keyword.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ACTIVE", "PAID"] },
        search: { type: "string", description: "Lender name or phone." },
        limit: limitSchema,
      },
    },
    allowedRoles: ADMINS_AND_MANAGER,
    run: async (raw, actor) => {
      const args = loansArgs.parse(raw ?? {});
      const query: Record<string, unknown> = { limit: String(clampLimit(args.limit)), sort: "-receivedDate" };
      if (args.status) query.status = args.status;
      if (args.search) query.searchTerm = args.search;
      const res = await LoanService.getAllLoans(query, actor as FinanceActor);
      return { loans: resultList(res).map(compactLoan), total: res.meta?.total };
    },
  },
  {
    name: "project_payments",
    description:
      "Client payments received on projects (all projects, all accounts). Filter by projectId, " +
      "financialAccountId or startDate/endDate (YYYY-MM-DD).",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "24-char project id" },
        financialAccountId: { type: "string", description: "24-char account id" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
        limit: limitSchema,
      },
    },
    allowedRoles: ADMINS,
    run: async (raw) => {
      const args = projectPaymentsArgs.parse(raw ?? {});
      const query: Record<string, string> = { limit: String(clampLimit(args.limit)) };
      if (args.projectId) query.projectId = args.projectId;
      if (args.financialAccountId) query.financialAccountId = args.financialAccountId;
      if (args.startDate) query.startDate = args.startDate;
      if (args.endDate) query.endDate = args.endDate;
      return FinancialAccountService.getAllPayments(query);
    },
  },
];

// ---------- registry API ----------

export const getToolsForRole = (role: string): AiTool[] =>
  AI_TOOLS.filter((t) => t.allowedRoles.includes(role));

export const toToolDeclarations = (tools: AiTool[]): AiToolDeclaration[] =>
  tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

const truncate = (text: string): string =>
  text.length <= MAX_TOOL_RESULT_CHARS
    ? text
    : `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n...[truncated: result too large, narrow the question]`;

export interface ToolExecution {
  content: string;
  isError: boolean;
  durationMs: number;
  errorMessage?: string;
}

/** Runs one tool call. Only tools in `allowed` (already filtered by role) can run. */
export const executeTool = async (
  name: string,
  input: unknown,
  actor: JwtPayload,
  allowed: AiTool[],
): Promise<ToolExecution> => {
  const started = Date.now();
  const tool = allowed.find((t) => t.name === name);
  if (!tool) {
    return {
      content: "This tool is not available for your role.",
      isError: true,
      durationMs: 0,
      errorMessage: "tool not available",
    };
  }
  try {
    const result = await tool.run(input, actor);
    return {
      content: truncate(JSON.stringify(result ?? null)),
      isError: false,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? `Invalid tool input: ${err.issues.map((i) => i.message).join("; ")}`
        : err instanceof Error
          ? err.message
          : "Tool failed";
    return {
      content: truncate(message),
      isError: true,
      durationMs: Date.now() - started,
      errorMessage: message,
    };
  }
};
