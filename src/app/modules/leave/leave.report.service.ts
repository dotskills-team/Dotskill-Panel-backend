import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { QueryFilter, Types } from "mongoose";
import { User } from "../user/user.model";
import { LEAVE_TYPE_LABELS, LeaveStatus, LeaveType } from "./leave.constant";
import { ILeaveAuditLog } from "./leave.interface";
import { LeaveAuditLog, LeaveRequest } from "./leave.model";

const TYPES = Object.values(LeaveType);
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const fullName = (u?: { firstName?: string; lastName?: string } | null) =>
  `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim() || "Unknown";

type TypeFigures = { days: number; extraDays: number; count: number };
const emptyFigures = (): TypeFigures => ({ days: 0, extraDays: 0, count: 0 });

export interface LeaveReportRow {
  staffId: string;
  name: string;
  department: string | null;
  byType: Record<string, TypeFigures>;
  totalDays: number;
  extraDays: number;
}

export interface LeaveReport {
  year: number;
  month: number | null;
  periodLabel: string;
  rows: LeaveReportRow[];
  totals: { byType: Record<string, TypeFigures>; totalDays: number; extraDays: number };
}

const periodOf = (year: number, month?: number) => {
  const start = new Date(Date.UTC(year, month ? month - 1 : 0, 1));
  const end = month ? new Date(Date.UTC(year, month, 0)) : new Date(Date.UTC(year, 11, 31));
  const periodLabel = month ? `${MONTH_NAMES[month - 1]} ${year}` : `Year ${year}`;
  return { start, end, periodLabel };
};

/**
 * Approved leave per staff member, split by type. A request counts in the period in
 * which it starts, so a request crossing a month end is not counted twice.
 */
const getReport = async (year: number, month?: number, staff?: string): Promise<LeaveReport> => {
  const { start, end, periodLabel } = periodOf(year, month);

  const grouped = await LeaveRequest.aggregate<{
    _id: { staff: Types.ObjectId; type: string };
    days: number;
    extraDays: number;
    count: number;
  }>([
    {
      $match: {
        status: LeaveStatus.APPROVED,
        startDate: { $gte: start, $lte: end },
        ...(staff ? { staff: new Types.ObjectId(staff) } : {}),
      },
    },
    {
      $group: {
        _id: { staff: "$staff", type: "$leaveType" },
        days: { $sum: "$totalDays" },
        extraDays: { $sum: "$extraDays" },
        count: { $sum: 1 },
      },
    },
  ]);

  const users = await User.find({ _id: { $in: grouped.map((g) => g._id.staff) } }).select(
    "firstName lastName department",
  );
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  const rowsById = new Map<string, LeaveReportRow>();
  const totals = {
    byType: Object.fromEntries(TYPES.map((t) => [t, emptyFigures()])) as Record<string, TypeFigures>,
    totalDays: 0,
    extraDays: 0,
  };

  for (const g of grouped) {
    const id = g._id.staff.toString();
    let row = rowsById.get(id);
    if (!row) {
      const u = userById.get(id);
      row = {
        staffId: id,
        name: fullName(u),
        department: u?.department ?? null,
        byType: Object.fromEntries(TYPES.map((t) => [t, emptyFigures()])) as Record<string, TypeFigures>,
        totalDays: 0,
        extraDays: 0,
      };
      rowsById.set(id, row);
    }
    row.byType[g._id.type] = { days: g.days, extraDays: g.extraDays, count: g.count };
    row.totalDays += g.days;
    row.extraDays += g.extraDays;

    const t = totals.byType[g._id.type];
    t.days += g.days;
    t.extraDays += g.extraDays;
    t.count += g.count;
    totals.totalDays += g.days;
    totals.extraDays += g.extraDays;
  }

  const rows = Array.from(rowsById.values()).sort((a, b) => b.totalDays - a.totalDays);
  return { year, month: month ?? null, periodLabel, rows, totals };
};

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

const typeLabel = (t: string) => (LEAVE_TYPE_LABELS[t] ?? t).replace(/^./, (c) => c.toUpperCase());

const toExcel = (report: LeaveReport): Buffer => {
  const daysSheet = [
    ["Staff", "Department", ...TYPES.map(typeLabel), "Total days", "Extra days"],
    ...report.rows.map((r) => [
      r.name,
      r.department ?? "",
      ...TYPES.map((t) => r.byType[t].days),
      r.totalDays,
      r.extraDays,
    ]),
    ["Total", "", ...TYPES.map((t) => report.totals.byType[t].days), report.totals.totalDays, report.totals.extraDays],
  ];
  const extraSheet = [
    ["Staff", "Department", ...TYPES.map(typeLabel), "Total extra days"],
    ...report.rows.map((r) => [
      r.name,
      r.department ?? "",
      ...TYPES.map((t) => r.byType[t].extraDays),
      r.extraDays,
    ]),
    ["Total", "", ...TYPES.map((t) => report.totals.byType[t].extraDays), report.totals.extraDays],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daysSheet), "Leave days");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(extraSheet), "Extra leave");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const toPdf = (report: LeaveReport): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 36;
    const usable = doc.page.width - left * 2;
    const nameW = 130;
    const numCols = TYPES.length + 2; // types + total + extra
    const colW = (usable - nameW) / numCols;
    const headers = [...TYPES.map((t) => typeLabel(t).replace(" leave", "")), "Total", "Extra"];

    doc.fontSize(16).text("Leave report", left, 36);
    doc.fontSize(10).fillColor("#555").text(report.periodLabel).fillColor("#000");

    let y = 84;
    const drawRow = (cells: (string | number)[], bold = false) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 36;
      }
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      doc.text(String(cells[0]), left, y, { width: nameW - 6, ellipsis: true, lineBreak: false });
      cells.slice(1).forEach((c, i) => {
        doc.text(String(c), left + nameW + i * colW, y, { width: colW - 4, align: "right", lineBreak: false });
      });
      y += 16;
      doc.moveTo(left, y - 3).lineTo(left + usable, y - 3).strokeColor("#ddd").stroke();
    };

    drawRow(["Staff", ...headers], true);
    for (const r of report.rows) {
      drawRow([
        r.name,
        ...TYPES.map((t) => r.byType[t].days || "-"),
        r.totalDays,
        r.extraDays || "-",
      ]);
    }
    drawRow([
      "Total",
      ...TYPES.map((t) => report.totals.byType[t].days || "-"),
      report.totals.totalDays,
      report.totals.extraDays || "-",
    ], true);

    if (report.rows.length === 0) {
      doc.font("Helvetica").fontSize(10).text("No approved leave in this period.", left, y + 8);
    }
    doc.end();
  });

const exportReport = async (
  year: number,
  month: number | undefined,
  format: "xlsx" | "pdf",
  staff?: string,
) => {
  const report = await getReport(year, month, staff);
  const base = `leave-report-${month ? `${year}-${String(month).padStart(2, "0")}` : year}`;
  if (format === "xlsx") {
    return {
      buffer: toExcel(report),
      filename: `${base}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  return { buffer: await toPdf(report), filename: `${base}.pdf`, contentType: "application/pdf" };
};

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

const listAuditLogs = async (q: { page?: number; limit?: number; action?: string; staff?: string }) => {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const filter: QueryFilter<ILeaveAuditLog> = {};
  if (q.action) filter.action = q.action as ILeaveAuditLog["action"];
  if (q.staff) filter.targetStaff = q.staff;

  const [result, total] = await Promise.all([
    LeaveAuditLog.find(filter)
      .populate("performedBy", "firstName lastName role")
      .populate("targetStaff", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LeaveAuditLog.countDocuments(filter),
  ]);
  return { result, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

export const LeaveReportService = { getReport, exportReport, listAuditLogs };
