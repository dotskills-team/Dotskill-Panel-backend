
import httpStatus from "http-status-codes";
import mongoose, { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";

import { TeamSalary } from "./team-salary.model";
import { SalaryPaymentStatus } from "./team-salary.constant";
import {
  CreateSalaryPaymentInput,
  CreateTeamSalaryInput,
  GenerateMonthlySalaryInput,
  UpdateTeamSalaryInput,
} from "./team-salary.validation";

import { User } from "../user/user.model";
import { Role, PaymentMethod, UserStatus } from "../user/user.interface";

import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";

import { FinancialAccount } from "../financial-account/financial-account.model";
import { applyAccountChange } from "../transaction/ledger.service";
import { TRANSACTION_TYPE } from "../transaction/transaction.constant";

const USER_POPULATE_FIELDS =
  "firstName lastName email phone role designation department salary paymentMethod avatar";

const assertValidObjectId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid object ID.");
  }
};

const toObjectId = (id: string) => new Types.ObjectId(id);

const getSalaryStatus = (
  totalAmount: number,
  paidAmount: number,
): SalaryPaymentStatus => {
  if (paidAmount <= 0) {
    return SalaryPaymentStatus.PENDING;
  }

  if (paidAmount < totalAmount) {
    return SalaryPaymentStatus.PARTIAL;
  }

  return SalaryPaymentStatus.PAID;
};

// Fallback for old records that don't have totalAmount yet
const getTotalAmount = (salary: {
  salaryAmount: number;
  extraAmount?: number;
  totalAmount?: number;
}) =>
  salary.totalAmount ??
  Number(salary.salaryAmount) + Number(salary.extraAmount ?? 0);

const assertValidMonthYear = (month: number, year: number) => {
  if (month < 1 || month > 12) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Month must be between 1 and 12.",
    );
  }

  if (year < 2000 || year > 3000) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid payroll year.");
  }
};

// Paid amount component-wise (payments array theke; old payment = SALARY)
const getPaidBreakdown = (salary: {
  payments?: { amount: number; paymentFor?: string }[];
}) => {
  let salaryPaid = 0;
  let extraPaid = 0;

  for (const payment of salary.payments ?? []) {
    if (payment.paymentFor === "EXTRA") {
      extraPaid += Number(payment.amount);
    } else {
      salaryPaid += Number(payment.amount);
    }
  }

  return { salaryPaid, extraPaid };
};

const getSalaryEligibleUsers = async () => {
  return User.find({
    isDeleted: false,
    status: UserStatus.ACTIVE,
    role: {
      $in: [
        Role.MANAGER,
        Role.DEVELOPER,
        Role.DESIGNER,
        Role.MARKETER,
        Role.STAFF,
      ],
    },
    salary: {
      $gt: 0,
    },
  });
};

const createTeamSalary = async (
  payload: CreateTeamSalaryInput,
  decodedToken: JwtPayload,
) => {
  assertValidObjectId(payload.user);

  assertValidMonthYear(payload.month, payload.year);

  const user = await User.findOne({
    _id: payload.user,
    isDeleted: false,
    status: UserStatus.ACTIVE,
  }).select("firstName lastName email role salary paymentMethod");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Active user not found.");
  }

  if (!user.salary || user.salary <= 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This user does not have a valid monthly salary.",
    );
  }

  const existingSalary = await TeamSalary.findOne({
    user: user._id,
    month: payload.month,
    year: payload.year,
  });

  if (existingSalary) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Salary record already exists for this user and month.",
    );
  }

  const salaryAmount = Number(user.salary);
  const extraAmount = Number(payload.extraAmount ?? 0);
  const totalAmount = salaryAmount + extraAmount;

  const salary = await TeamSalary.create({
    user: user._id,

    month: payload.month,
    year: payload.year,

    salaryAmount,

    extraName: extraAmount > 0 ? payload.extraName : undefined,
    extraAmount,

    totalAmount,
    paidAmount: 0,
    dueAmount: totalAmount,

    status: SalaryPaymentStatus.PENDING,

    note: payload.note,

    createdBy: decodedToken.userId
      ? toObjectId(decodedToken.userId)
      : undefined,
  });

  const populatedSalary = await TeamSalary.findById(salary._id)
    .populate("user", USER_POPULATE_FIELDS)
    .populate("cancelledBy", "firstName lastName email designation");

  return {
    data: populatedSalary,
  };
};

const updateTeamSalary = async (
  salaryId: string,
  payload: UpdateTeamSalaryInput,
  decodedToken: JwtPayload,
) => {
  assertValidObjectId(salaryId);

  const salary = await TeamSalary.findById(salaryId);

  if (!salary) {
    throw new AppError(httpStatus.NOT_FOUND, "Salary record not found.");
  }

  if (salary.status === SalaryPaymentStatus.CANCELLED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cancelled salary cannot be updated.",
    );
  }

  if (payload.note !== undefined) {
    salary.note = payload.note;
  }

  if (payload.extraAmount !== undefined || payload.extraName !== undefined) {
    const extraAmount = Number(payload.extraAmount ?? salary.extraAmount ?? 0);
    const totalAmount = Number(salary.salaryAmount) + extraAmount;

    const { extraPaid } = getPaidBreakdown(salary);

    if (extraAmount < extraPaid) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Extra amount (${extraAmount}) cannot be less than the already paid extra (${extraPaid}).`,
      );
    }

    salary.extraAmount = extraAmount;
    salary.extraName =
      extraAmount > 0 ? (payload.extraName ?? salary.extraName) : undefined;

    salary.totalAmount = totalAmount;
    salary.dueAmount = Math.max(totalAmount - Number(salary.paidAmount), 0);
    salary.status = getSalaryStatus(totalAmount, Number(salary.paidAmount));
  }

  salary.updatedBy = toObjectId(decodedToken.userId);

  await salary.save();

  const populatedSalary = await TeamSalary.findById(salary._id)
    .populate("user", USER_POPULATE_FIELDS)
    .populate("cancelledBy", "firstName lastName email designation");

  return {
    data: populatedSalary,
  };
};

const generateMonthlySalary = async (
  payload: GenerateMonthlySalaryInput,
  decodedToken: JwtPayload,
) => {
  assertValidMonthYear(payload.month, payload.year);

  const users = await getSalaryEligibleUsers();

  if (!users.length) {
    return {
      data: [],
      summary: {
        totalEmployees: 0,
        created: 0,
        skipped: 0,
      },
    };
  }

  const existingRecords = await TeamSalary.find({
    month: payload.month,
    year: payload.year,
  }).select("user");

  const existingUserIds = new Set(
    existingRecords.map((item) => item.user.toString()),
  );

  const newRecords = users
    .filter((user) => !existingUserIds.has(user._id.toString()))
    .map((user) => ({
      user: user._id,

      month: payload.month,
      year: payload.year,

      salaryAmount: Number(user.salary),

      extraAmount: 0,
      totalAmount: Number(user.salary),

      paidAmount: 0,
      dueAmount: Number(user.salary),

      status: SalaryPaymentStatus.PENDING,

      createdBy: decodedToken.userId
        ? toObjectId(decodedToken.userId)
        : undefined,
    }));

  if (newRecords.length) {
    await TeamSalary.insertMany(newRecords);
  }

  const data = await TeamSalary.find({
    month: payload.month,
    year: payload.year,
  })
    .populate("user", USER_POPULATE_FIELDS)
    .sort({
      createdAt: -1,
    });

  return {
    data,
    summary: {
      totalEmployees: users.length,
      created: newRecords.length,
      skipped: users.length - newRecords.length,
    },
  };
};

const getTeamSalaries = async (query: Record<string, string>) => {
  const baseFilter: Record<string, any> = {};

  if (query.month) {
    baseFilter.month = Number(query.month);
  }

  if (query.year) {
    baseFilter.year = Number(query.year);
  }

  if (query.status) {
    baseFilter.status = query.status;
  }

  if (query.user) {
    assertValidObjectId(query.user);
    baseFilter.user = toObjectId(query.user);
  }

  if (query.searchTerm) {
    const searchRegex = {
      $regex: query.searchTerm,
      $options: "i",
    };

    const users = await User.find({
      isDeleted: false,
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { designation: searchRegex },
        { department: searchRegex },
      ],
    }).select("_id");

    const matchingUserIds = users.map((user) => user._id);

    baseFilter.user = {
      ...(baseFilter.user ? { $eq: baseFilter.user } : {}),
      $in: matchingUserIds,
    };
  }

  if (query.paymentMethod) {
    const paymentMethodValue = query.paymentMethod as PaymentMethod;

    const users = await User.find({
      isDeleted: false,
      paymentMethod: paymentMethodValue,
    } as any).select("_id");

    const paymentMethodUserIds = users.map((user) => user._id);

    if (baseFilter.user?.$in) {
      baseFilter.user.$in = baseFilter.user.$in.filter((id: Types.ObjectId) =>
        paymentMethodUserIds.some(
          (paymentUserId) => paymentUserId.toString() === id.toString(),
        ),
      );
    } else {
      baseFilter.user = {
        $in: paymentMethodUserIds,
      };
    }
  }

  const queryForBuilder = {
    ...query,
  };

  delete queryForBuilder.searchTerm;
  delete queryForBuilder.paymentMethod;

  const queryBuilder = new QueryBuilder(
    TeamSalary.find(baseFilter).populate("user", USER_POPULATE_FIELDS),
    queryForBuilder,
  );

  const salariesQuery = queryBuilder.filter().sort().fields().paginate();

  const [data, meta] = await Promise.all([
    salariesQuery.build(),
    queryBuilder.getMeta(),
  ]);

  return {
    data,
    meta,
  };
};

const getTeamSalaryById = async (salaryId: string) => {
  assertValidObjectId(salaryId);

  const salary = await TeamSalary.findOne({
    _id: salaryId,
  }).populate("user", USER_POPULATE_FIELDS);

  if (!salary) {
    throw new AppError(httpStatus.NOT_FOUND, "Salary record not found.");
  }

  return {
    data: salary,
  };
};

const getUserSalaryHistory = async (
  userId: string,
  query: Record<string, string>,
) => {
  assertValidObjectId(userId);

  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  }).select("firstName lastName email salary paymentMethod");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  const baseFilter: Record<string, any> = {
    user: toObjectId(userId),
  };

  if (query.year) {
    baseFilter.year = Number(query.year);
  }

  if (query.status) {
    baseFilter.status = query.status;
  }

  const queryBuilder = new QueryBuilder(TeamSalary.find(baseFilter), query);

  const salariesQuery = queryBuilder.filter().sort().fields().paginate();

  const [data, meta] = await Promise.all([
    salariesQuery.build(),
    queryBuilder.getMeta(),
  ]);

  return {
    data,
    meta,
  };
};

const createSalaryPayment = async (
  salaryId: string,
  payload: CreateSalaryPaymentInput,
  decodedToken: JwtPayload,
) => {
  assertValidObjectId(salaryId);
  assertValidObjectId(payload.financialAccountId);

  const amount = Number(payload.amount);
  const paymentFor = payload.paymentFor ?? "SALARY";
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const salary = await TeamSalary.findById(salaryId).session(session);

      if (!salary) {
        throw new AppError(httpStatus.NOT_FOUND, "Salary record not found.");
      }
      if (salary.status === SalaryPaymentStatus.CANCELLED) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Cancelled salary cannot receive payments.",
        );
      }

      const totalAmount = getTotalAmount(salary);
      const extraAmount = Number(salary.extraAmount ?? 0);
      const { salaryPaid, extraPaid } = getPaidBreakdown(salary);

      if (paymentFor === "EXTRA" && extraAmount <= 0) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "This salary record has no extra amount.",
        );
      }

      const componentDue =
        paymentFor === "EXTRA"
          ? extraAmount - extraPaid
          : Number(salary.salaryAmount) - salaryPaid;

      if (componentDue <= 0) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          paymentFor === "EXTRA"
            ? "Extra amount has already been fully paid."
            : "Base salary has already been fully paid.",
        );
      }

      if (amount > componentDue) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Payment amount cannot exceed the outstanding ${
            paymentFor === "EXTRA" ? "extra" : "salary"
          } amount of ${componentDue}.`,
        );
      }

      const defaultNote =
        paymentFor === "EXTRA"
          ? `${salary.extraName || "Extra"} payment`
          : "Salary payment";

      const account = await applyAccountChange({
        accountId: payload.financialAccountId,
        amount: -amount,
        type: TRANSACTION_TYPE.SALARY,
        date: payload.paymentDate,
        note: payload.note || defaultNote,
        refModel: "TeamSalary",
        refId: salary._id,
        userId: decodedToken.userId,
        session,
        requireActive: true,
      });

      if (!account) {
        const exists = await FinancialAccount.findOne({
          _id: payload.financialAccountId,
          isDeleted: false,
        }).session(session);

        throw new AppError(
          exists ? httpStatus.BAD_REQUEST : httpStatus.NOT_FOUND,
          exists
            ? "Account-এ পর্যাপ্ত ব্যালেন্স নেই (অথবা account inactive)।"
            : "Financial account not found.",
        );
      }

      const newPaidAmount = Number(salary.paidAmount) + amount;

      salary.totalAmount = totalAmount;
      salary.paidAmount = newPaidAmount;
      salary.dueAmount = Math.max(totalAmount - newPaidAmount, 0);
      salary.status = getSalaryStatus(totalAmount, newPaidAmount);

      salary.payments.push({
        amount,
        paymentFor,
        financialAccountId: account._id,
        paymentMethod: payload.paymentMethod as PaymentMethod,
        paymentDate: new Date(payload.paymentDate),
        paymentReference: payload.paymentReference,
        note: payload.note,
        recordedBy: toObjectId(decodedToken.userId),
      });

      salary.updatedBy = toObjectId(decodedToken.userId);

      await salary.save({ session });
    });
  } finally {
    await session.endSession();
  }

  const populatedSalary = await TeamSalary.findById(salaryId)
    .populate("user", USER_POPULATE_FIELDS)
    .populate("cancelledBy", "firstName lastName email designation");

  return { data: populatedSalary };
};

const deleteTeamSalary = async (id: string) => {
  assertValidObjectId(id);

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const salary = await TeamSalary.findById(id).session(session);

      if (!salary) {
        throw new AppError(httpStatus.NOT_FOUND, "Salary record not found");
      }

      for (const payment of salary.payments) {
        if (payment.financialAccountId) {
          await applyAccountChange({
            accountId: payment.financialAccountId,
            amount: payment.amount,
            type: TRANSACTION_TYPE.SALARY,
            isReversal: true,
            note: "Salary record deleted",
            refModel: "TeamSalary",
            refId: salary._id,
            session,
          });
        }
      }

      await TeamSalary.findByIdAndDelete(id, { session });
    });
  } finally {
    await session.endSession();
  }

  return null;
};

const cancelTeamSalary = async (
  salaryId: string,
  reason: string,
  decodedToken: JwtPayload,
) => {
  assertValidObjectId(salaryId);

  const salary = await TeamSalary.findById(salaryId);

  if (!salary) {
    throw new AppError(httpStatus.NOT_FOUND, "Salary record not found.");
  }

  if (salary.status === SalaryPaymentStatus.CANCELLED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Salary record is already cancelled.",
    );
  }

  if (Number(salary.paidAmount) > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A salary with recorded payments cannot be cancelled.",
    );
  }

  salary.status = SalaryPaymentStatus.CANCELLED;
  salary.cancelledAt = new Date();
  salary.cancelledBy = toObjectId(decodedToken.userId);
  salary.cancellationReason = reason;
  salary.updatedBy = toObjectId(decodedToken.userId);

  await salary.save();

  return {
    data: salary,
  };
};

const getSalarySummary = async (query: Record<string, string>) => {
  const match: Record<string, any> = {};

  if (query.month) {
    match.month = Number(query.month);
  }

  if (query.year) {
    match.year = Number(query.year);
  }

  if (query.status) {
    match.status = query.status;
  }

  const countStatus = (status: SalaryPaymentStatus) => ({
    $sum: {
      $cond: [{ $eq: ["$status", status] }, 1, 0],
    },
  });

  const [summary] = await TeamSalary.aggregate([
    {
      $match: match,
    },

    {
      $addFields: {
        effectiveTotal: {
          $ifNull: [
            "$totalAmount",
            { $add: ["$salaryAmount", { $ifNull: ["$extraAmount", 0] }] },
          ],
        },
      },
    },

    {
      $group: {
        _id: null,

        totalBaseSalary: { $sum: "$salaryAmount" },
        totalExtra: { $sum: { $ifNull: ["$extraAmount", 0] } },

        // base salary + extra
        totalSalary: { $sum: "$effectiveTotal" },

        totalPaid: { $sum: "$paidAmount" },
        totalDue: { $sum: "$dueAmount" },

        totalRecords: { $sum: 1 },

        pendingCount: countStatus(SalaryPaymentStatus.PENDING),
        partialCount: countStatus(SalaryPaymentStatus.PARTIAL),
        paidCount: countStatus(SalaryPaymentStatus.PAID),
        cancelledCount: countStatus(SalaryPaymentStatus.CANCELLED),
      },
    },
  ]);

  return {
    data: summary ?? {
      totalBaseSalary: 0,
      totalExtra: 0,
      totalSalary: 0,
      totalPaid: 0,
      totalDue: 0,
      totalRecords: 0,
      pendingCount: 0,
      partialCount: 0,
      paidCount: 0,
      cancelledCount: 0,
    },
  };
};

// Hide internal/admin-only fields from the employee
const MY_SALARY_HIDDEN_FIELDS =
  "-createdBy -updatedBy -cancelledBy -payments.recordedBy -payments.financialAccountId";

// Query keys an employee must never inject through the URL
const MY_SALARY_BLOCKED_QUERY_KEYS = [
  "user",
  "createdBy",
  "updatedBy",
  "cancelledBy",
  "fields",
];

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Stats for the logged-in employee (respects the active filters)
const getMySalaryStats = async (filter: Record<string, any>) => {
  const [agg] = await TeamSalary.aggregate([
    { $match: filter },
    {
      $addFields: {
        effectiveTotal: {
          $ifNull: [
            "$totalAmount",
            { $add: ["$salaryAmount", { $ifNull: ["$extraAmount", 0] }] },
          ],
        },
        isActive: { $ne: ["$status", SalaryPaymentStatus.CANCELLED] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        // Cancelled records are excluded from money totals
        totalSalary: {
          $sum: { $cond: ["$isActive", "$effectiveTotal", 0] },
        },
        totalPaid: { $sum: { $cond: ["$isActive", "$paidAmount", 0] } },
        totalDue: { $sum: { $cond: ["$isActive", "$dueAmount", 0] } },
        Pending: {
          $sum: {
            $cond: [{ $eq: ["$status", SalaryPaymentStatus.PENDING] }, 1, 0],
          },
        },
        Partial: {
          $sum: {
            $cond: [{ $eq: ["$status", SalaryPaymentStatus.PARTIAL] }, 1, 0],
          },
        },
        Paid: {
          $sum: {
            $cond: [{ $eq: ["$status", SalaryPaymentStatus.PAID] }, 1, 0],
          },
        },
        Cancelled: {
          $sum: {
            $cond: [{ $eq: ["$status", SalaryPaymentStatus.CANCELLED] }, 1, 0],
          },
        },
      },
    },
  ]);

  return {
    total: agg?.total ?? 0,
    totalSalary: agg?.totalSalary ?? 0,
    totalPaid: agg?.totalPaid ?? 0,
    totalDue: agg?.totalDue ?? 0,
    Pending: agg?.Pending ?? 0,
    Partial: agg?.Partial ?? 0,
    Paid: agg?.Paid ?? 0,
    Cancelled: agg?.Cancelled ?? 0,
  };
};

/**
 * Salary records of the logged-in employee.
 * Supports month, year, status, paymentMethod, searchTerm, sort and pagination.
 * Default sort: newest month first.
 */
const getMySalaries = async (
  decodedToken: JwtPayload,
  query: Record<string, string>,
) => {
  assertValidObjectId(decodedToken.userId);
  const userId = toObjectId(decodedToken.userId);

  const cleanQuery: Record<string, string> = { ...query };

  Object.keys(cleanQuery).forEach((key) => {
    if (
      MY_SALARY_BLOCKED_QUERY_KEYS.includes(key) ||
      key.startsWith("payments")
    ) {
      delete cleanQuery[key];
    }
  });

  // The user is always the logged-in employee
  const baseFilter: Record<string, any> = { user: userId };

  if (cleanQuery.month) {
    const month = Number(cleanQuery.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Month must be between 1 and 12.",
      );
    }
    baseFilter.month = month;
  }

  if (cleanQuery.year) {
    const year = Number(cleanQuery.year);
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid payroll year.");
    }
    baseFilter.year = year;
  }

  if (cleanQuery.status) {
    baseFilter.status = cleanQuery.status;
  }

  if (cleanQuery.paymentMethod) {
    baseFilter["payments.paymentMethod"] = cleanQuery.paymentMethod;
  }

  if (cleanQuery.searchTerm?.trim()) {
    const regex = {
      $regex: escapeRegex(cleanQuery.searchTerm.trim()),
      $options: "i",
    };

    baseFilter.$or = [
      { extraName: regex },
      { note: regex },
      { "payments.paymentReference": regex },
      { "payments.note": regex },
    ];
  }

  // Already applied to baseFilter, so the builder must not see them again
  ["month", "year", "status", "paymentMethod", "searchTerm"].forEach(
    (key) => delete cleanQuery[key],
  );

  // NOTE: assumes QueryBuilder.sort() splits the sort string by comma
  if (!cleanQuery.sort) {
    cleanQuery.sort = "-year,-month";
  }

  const queryBuilder = new QueryBuilder(
    TeamSalary.find(baseFilter),
    cleanQuery,
  );

  const salariesQuery = queryBuilder.filter().sort().fields().paginate();

  // Dropdown options come from ALL of this employee's records (not filtered)
  const getFilterOptions = async () => {
    const [years, paymentMethods] = await Promise.all([
      TeamSalary.distinct("year", { user: userId }),
      TeamSalary.distinct("payments.paymentMethod", { user: userId }),
    ]);

    return {
      years: (years as number[]).sort((a, b) => b - a),
      paymentMethods: paymentMethods as string[],
    };
  };

  const [data, meta, stats, options] = await Promise.all([
    salariesQuery.build().select(MY_SALARY_HIDDEN_FIELDS),
    queryBuilder.getMeta(),
    getMySalaryStats(baseFilter),
    getFilterOptions(),
  ]);

  return {
    data,
    meta,
    stats: { ...stats, ...options },
  };
};


export const TeamSalaryServices = {
  createTeamSalary,
  updateTeamSalary,

  generateMonthlySalary,

  getTeamSalaries,
  getTeamSalaryById,
  getUserSalaryHistory,

  createSalaryPayment,
  deleteTeamSalary,
  cancelTeamSalary,

  getSalarySummary,
  getMySalaries,
};