import mongoose from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { FinancialAccount } from "../financial-account/financial-account.model";
import { FundTransfer } from "./fund-transfer.model";
import { IFundTransfer } from "./fund-transfer.interface";
import { FUND_TRANSFER_SEARCHABLE_FIELDS } from "./fund-transfer.constant";

const populateOptions = [
  { path: "fromAccountId", select: "accountName accountType currentBalance" },
  { path: "toAccountId", select: "accountName accountType currentBalance" },
  { path: "createdBy", select: "firstName lastName" },
];

const createFundTransfer = async (
  payload: Partial<IFundTransfer>,
  decodedToken: JwtPayload,
) => {
  const fromId = payload.fromAccountId?.toString();
  const toId = payload.toAccountId?.toString();
  const amount = Number(payload.amount);

  if (!fromId || !toId) {
    throw new AppError(400, "Both accounts are required");
  }
  if (fromId === toId) {
    throw new AppError(400, "From and To account cannot be the same");
  }
  if (!(amount > 0)) {
    throw new AppError(400, "Amount must be greater than zero");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const fromAccount = await FinancialAccount.findOne(
      { _id: fromId, isDeleted: false },
      null,
      { session },
    );
    const toAccount = await FinancialAccount.findOne(
      { _id: toId, isDeleted: false },
      null,
      { session },
    );

    if (!fromAccount) throw new AppError(404, "From account not found");
    if (!toAccount) throw new AppError(404, "To account not found");

    if (fromAccount.currentBalance < amount) {
      throw new AppError(
        400,
        `Insufficient balance in "${fromAccount.accountName}". Available: ${fromAccount.currentBalance}`,
      );
    }

    const [transfer] = await FundTransfer.create(
      [
        {
          ...payload,
          amount,
          createdBy: decodedToken.userId,
        },
      ],
      { session },
    );

    await FinancialAccount.findByIdAndUpdate(
      fromId,
      { $inc: { currentBalance: -amount } },
      { session },
    );
    await FinancialAccount.findByIdAndUpdate(
      toId,
      { $inc: { currentBalance: amount } },
      { session },
    );

    await session.commitTransaction();

    const populated = await FundTransfer.findById(transfer._id).populate(populateOptions);
    return { data: populated };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const getAllFundTransfers = async (query: Record<string, unknown>) => {
  const baseQuery = FundTransfer.find({ isDeleted: false }).populate(populateOptions);

  const queryBuilder = new QueryBuilder(baseQuery, query as Record<string, string>)
    .search(FUND_TRANSFER_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await queryBuilder.modelQuery;
  const meta = await queryBuilder.getMeta();

  return { result, meta };
};

const getSingleFundTransfer = async (id: string) => {
  const transfer = await FundTransfer.findOne({ _id: id, isDeleted: false }).populate(
    populateOptions,
  );
  if (!transfer) {
    throw new AppError(404, "Fund transfer not found");
  }
  return transfer;
};

// Delete = reverse the transfer (To থেকে কেটে From-এ ফেরত)
const deleteFundTransfer = async (id: string, decodedToken: JwtPayload) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const transfer = await FundTransfer.findOne(
      { _id: id, isDeleted: false },
      null,
      { session },
    );
    if (!transfer) {
      throw new AppError(404, "Fund transfer not found");
    }

    const toAccount = await FinancialAccount.findById(transfer.toAccountId, null, { session });
    if (toAccount && toAccount.currentBalance < transfer.amount) {
      throw new AppError(
        400,
        `Cannot reverse: "${toAccount.accountName}" does not have enough balance (${toAccount.currentBalance}).`,
      );
    }

    await FinancialAccount.findByIdAndUpdate(
      transfer.toAccountId,
      { $inc: { currentBalance: -transfer.amount } },
      { session },
    );
    await FinancialAccount.findByIdAndUpdate(
      transfer.fromAccountId,
      { $inc: { currentBalance: transfer.amount } },
      { session },
    );

    await FundTransfer.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedBy: decodedToken.userId, deletedAt: new Date() },
      { session },
    );

    await session.commitTransaction();
    return { data: null };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const FundTransferService = {
  createFundTransfer,
  getAllFundTransfers,
  getSingleFundTransfer,
  deleteFundTransfer,
};