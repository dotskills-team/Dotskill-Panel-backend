import mongoose from "mongoose";
import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { Loan } from "./loan.model";
import { applyAccountChange } from "../transaction/ledger.service";
import { TRANSACTION_TYPE } from "../transaction/transaction.constant";

const populateOptions = [
  { path: "receivedAccountId", select: "accountName accountType" },
];

const createLoan = async (
  payload: {
    lenderName: string;
    lenderPhone?: string;
    amount: number;
    accountId: string;
    receivedDate: string;
    dueDate?: string | null;
    note?: string;
  },
  userId: string,
) => {
  const session = await mongoose.startSession();
  try {
    let loanId;

    await session.withTransaction(async () => {
      const [loan] = await Loan.create(
        [
          {
            lenderName: payload.lenderName,
            lenderPhone: payload.lenderPhone,
            principalAmount: payload.amount,
            repaidAmount: 0,
            dueAmount: payload.amount,
            receivedAccountId: payload.accountId,
            receivedDate: new Date(payload.receivedDate),
            dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
            status: "ACTIVE",
            note: payload.note,
            createdBy: userId,
          },
        ],
        { session },
      );

      loanId = loan._id;

      await applyAccountChange({
        accountId: payload.accountId,
        amount: payload.amount,
        type: TRANSACTION_TYPE.LOAN_RECEIVED,
        date: payload.receivedDate,
        note: `Loan from ${payload.lenderName}`,
        refModel: "Loan",
        refId: loan._id,
        loanId: loan._id,
        userId,
        session,
        requireActive: true,
      });
    });

    return Loan.findById(loanId).populate(populateOptions);
  } finally {
    await session.endSession();
  }
};

const repayLoan = async (
  loanId: string,
  payload: { accountId: string; amount: number; date: string; note?: string },
  userId: string,
) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const loan = await Loan.findById(loanId).session(session);
      if (!loan) throw new AppError(404, "Loan not found");
      if (loan.status === "PAID") {
        throw new AppError(400, "This loan is already fully repaid.");
      }
      if (payload.amount > loan.dueAmount) {
        throw new AppError(
          400,
          `Repayment cannot exceed the outstanding amount of ${loan.dueAmount}.`,
        );
      }

      await applyAccountChange({
        accountId: payload.accountId,
        amount: -payload.amount,
        type: TRANSACTION_TYPE.LOAN_REPAYMENT,
        date: payload.date,
        note: payload.note || `Repayment to ${loan.lenderName}`,
        refModel: "Loan",
        refId: loan._id,
        loanId: loan._id,
        userId,
        session,
        requireActive: true,
      });

      loan.repaidAmount += payload.amount;
      loan.dueAmount = Math.max(loan.principalAmount - loan.repaidAmount, 0);
      loan.status = loan.dueAmount === 0 ? "PAID" : "ACTIVE";
      await loan.save({ session });
    });

    return Loan.findById(loanId).populate(populateOptions);
  } finally {
    await session.endSession();
  }
};

const getAllLoans = async (query: Record<string, unknown>) => {
  const baseQuery = Loan.find({}).populate(populateOptions);

  const queryBuilder = new QueryBuilder(
    baseQuery,
    query as Record<string, string>,
  )
    .search(["lenderName", "lenderPhone"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await queryBuilder.modelQuery;
  const meta = await queryBuilder.getMeta();
  return { result, meta };
};

const getLoanSummary = async () => {
  const [s] = await Loan.aggregate([
    {
      $group: {
        _id: null,
        totalBorrowed: { $sum: "$principalAmount" },
        totalRepaid: { $sum: "$repaidAmount" },
        totalDue: { $sum: "$dueAmount" },
        activeCount: {
          $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] },
        },
      },
    },
  ]);

  return (
    s ?? { totalBorrowed: 0, totalRepaid: 0, totalDue: 0, activeCount: 0 }
  );
};

export const LoanService = {
  createLoan,
  repayLoan,
  getAllLoans,
  getLoanSummary,
};