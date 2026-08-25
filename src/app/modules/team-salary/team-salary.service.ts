import httpStatus from "http-status-codes";
import { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";

import { TeamSalary } from "./team-salary.model";
import {
  SalaryPaymentStatus,
  SALARY_PAYMENT_STATUSES,
} from "./team-salary.constant";
import {
  CreateSalaryPaymentInput,
  CreateTeamSalaryInput,
  GenerateMonthlySalaryInput,
} from "./team-salary.validation";

import { User } from "../user/user.model";
import { Role, PaymentMethod, UserStatus } from "../user/user.interface";

import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";

const assertValidObjectId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid object ID.");
  }
};

const toObjectId = (id: string) => new Types.ObjectId(id);

const getSalaryStatus = (
  salaryAmount: number,
  paidAmount: number,
): SalaryPaymentStatus => {
  if (paidAmount <= 0) {
    return SalaryPaymentStatus.PENDING;
  }

  if (paidAmount < salaryAmount) {
    return SalaryPaymentStatus.PARTIAL;
  }

  return SalaryPaymentStatus.PAID;
};

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

  const salary = await TeamSalary.create({
    user: user._id,

    month: payload.month,
    year: payload.year,

    salaryAmount,
    paidAmount: 0,
    dueAmount: salaryAmount,

    status: SalaryPaymentStatus.PENDING,

    note: payload.note,

    createdBy: decodedToken.userId
      ? toObjectId(decodedToken.userId)
      : undefined,
  });

  const populatedSalary = await TeamSalary.findById(salary._id)
    .populate(
      "user",
      "firstName lastName email phone role designation department salary paymentMethod avatar",
    )
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
    .populate(
      "user",
      "firstName lastName email phone role designation department salary paymentMethod avatar",
    )
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
    TeamSalary.find(baseFilter).populate(
      "user",
      "firstName lastName email phone role designation department salary paymentMethod avatar",
    ),
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
  }).populate(
    "user",
    "firstName lastName email phone role designation department salary paymentMethod avatar",
  );

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

  const salary = await TeamSalary.findById(salaryId);

  if (!salary) {
    throw new AppError(httpStatus.NOT_FOUND, "Salary record not found.");
  }

  if (salary.status === SalaryPaymentStatus.PAID) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This salary has already been fully paid.",
    );
  }

  if (salary.status === SalaryPaymentStatus.CANCELLED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cancelled salary cannot receive payments.",
    );
  }

  const amount = Number(payload.amount);

  if (amount <= 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Payment amount must be greater than zero.",
    );
  }

  const currentDue = Number(salary.dueAmount);

  /**
   * Never allow overpayment.
   */
  if (amount > currentDue) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Payment amount cannot exceed the outstanding amount of ${currentDue}.`,
    );
  }

  const newPaidAmount = Number(salary.paidAmount) + amount;

  const newDueAmount = Number(salary.salaryAmount) - newPaidAmount;

  const newStatus = getSalaryStatus(Number(salary.salaryAmount), newPaidAmount);

  salary.paidAmount = newPaidAmount;
  salary.dueAmount = Math.max(newDueAmount, 0);
  salary.status = newStatus;

  salary.payments.push({
    amount,

    paymentMethod: payload.paymentMethod as PaymentMethod,

    paymentDate: new Date(payload.paymentDate),

    paymentReference: payload.paymentReference,

    note: payload.note,

    recordedBy: decodedToken.userId
      ? toObjectId(decodedToken.userId)
      : undefined,
  });

  salary.updatedBy = toObjectId(decodedToken.userId);

  await salary.save();

  const populatedSalary = await TeamSalary.findById(salary._id)
    .populate(
      "user",
      "firstName lastName email phone role designation department salary paymentMethod avatar",
    )
    .populate("cancelledBy", "firstName lastName email designation");

  return {
    data: populatedSalary,
  };
};

const deleteTeamSalary = async (id: string) => {
  const salary = await TeamSalary.findById(id);

  if (!salary) {
    throw new AppError(httpStatus.NOT_FOUND, "Salary record not found");
  }

  // if (salary.payments && salary.payments.length > 0) {
  //   throw new AppError(
  //     httpStatus.BAD_REQUEST,
  //     "A salary record with recorded payments cannot be deleted. Cancel it instead.",
  //   );
  // }

  await TeamSalary.findByIdAndDelete(id);

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

  const [summary] = await TeamSalary.aggregate([
    {
      $match: match,
    },

    {
      $group: {
        _id: null,

        totalSalary: {
          $sum: "$salaryAmount",
        },

        totalPaid: {
          $sum: "$paidAmount",
        },

        totalDue: {
          $sum: "$dueAmount",
        },

        totalRecords: {
          $sum: 1,
        },

        pendingCount: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", SalaryPaymentStatus.PENDING],
              },
              1,
              0,
            ],
          },
        },

        partialCount: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", SalaryPaymentStatus.PARTIAL],
              },
              1,
              0,
            ],
          },
        },

        paidCount: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", SalaryPaymentStatus.PAID],
              },
              1,
              0,
            ],
          },
        },

        cancelledCount: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", SalaryPaymentStatus.CANCELLED],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    data: summary ?? {
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

export const TeamSalaryServices = {
  createTeamSalary,

  generateMonthlySalary,

  getTeamSalaries,
  getTeamSalaryById,
  getUserSalaryHistory,

  createSalaryPayment,
  deleteTeamSalary,
  cancelTeamSalary,

  getSalarySummary,
};
