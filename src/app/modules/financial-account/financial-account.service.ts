import { Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { FinancialAccount } from "./financial-account.model";
import { IFinancialAccount } from "./financial-account.interface";
import { FINANCIAL_ACCOUNT_SEARCHABLE_FIELDS } from "./financial-account.constant";
import { User } from "../user/user.model";
import { Project } from "../project/project.model";

// const createFinancialAccount = async (
//   payload: Partial<IFinancialAccount>,
//   userId: string,
// ) => {
//   const result = await FinancialAccount.create({
//     ...payload,
//     createdBy: userId,
//   });
//   return result;
// };
const ownerPopulate = { path: "ownerId", select: "firstName lastName email designation" };

const assertOwnerExists = async (ownerId?: string | null) => {
  if (!ownerId) return;
  const owner = await User.findOne({ _id: ownerId, isDeleted: false });
  if (!owner) {
    throw new AppError(404, "Owner (user) not found");
  }
};

const createFinancialAccount = async (
  payload: Partial<IFinancialAccount>,
  userId: string,
) => {
  await assertOwnerExists(payload.ownerId?.toString());

  const result = await FinancialAccount.create({
    ...payload,
    currentBalance: payload.openingBalance ?? 0, // ⬅️ যোগ করুন
    createdBy: userId,
  });
  return result;
};

const getAllFinancialAccounts = async (query: Record<string, unknown>) => {
  // const baseQuery = FinancialAccount.find({ isDeleted: false });
  const baseQuery = FinancialAccount.find({ isDeleted: false }).populate(ownerPopulate);


  const queryBuilder = new QueryBuilder(baseQuery, query as Record<string, string>)
    .search(FINANCIAL_ACCOUNT_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await queryBuilder.modelQuery;
  const meta = await queryBuilder.getMeta();

  return { result, meta };
};

const getSingleFinancialAccount = async (id: string) => {
  // const account = await FinancialAccount.findOne({ _id: id, isDeleted: false });
 const account = await FinancialAccount.findOne({ _id: id, isDeleted: false }).populate(ownerPopulate);
 
  
  if (!account) {
    throw new AppError(404, "Financial account not found");
  }
  return account;
};

const getFinancialAccountSummary = async () => {
  const accounts = await FinancialAccount.find({ isDeleted: false }).populate(ownerPopulate);

  const totalOpeningBalance = accounts.reduce((sum, acc) => sum + acc.openingBalance, 0);
  const totalCurrentBalance = accounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

const ownerMap = new Map<
  string,
  {
    ownerId: string | null;
    ownerName: string;
    accountCount: number;
    totalBalance: number;
  }
>();

  for (const acc of accounts) {
    const owner = acc.ownerId as unknown as
      | { _id: { toString(): string }; firstName?: string; lastName?: string }
      | null;

    const key = owner?._id.toString() ?? "unassigned";
    const existing = ownerMap.get(key) ?? {
      ownerId: owner ? owner._id.toString() : null,
      ownerName: owner ? `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() : "Unassigned",
      accountCount: 0,
      totalBalance: 0,
    };

    existing.accountCount += 1;
    existing.totalBalance += acc.currentBalance;
    ownerMap.set(key, existing);
  }

  return {
    totalAccounts: accounts.length,
    totalOpeningBalance,
    totalCurrentBalance,
    totalSpent: totalOpeningBalance - totalCurrentBalance,
    byOwner: Array.from(ownerMap.values()),
    accounts: accounts.map((acc) => ({
      _id: acc._id,
      accountName: acc.accountName,
      accountType: acc.accountType,
      openingBalance: acc.openingBalance,
      currentBalance: acc.currentBalance,
      ownerId: acc.ownerId,
    })),
  };
};

const getDayBoundariesUTC = (dateStr: string) => {
  const d = new Date(dateStr);
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );
  return { start, end };
};

const getAllPayments = async (query: Record<string, string>) => {
  const {
    financialAccountId,
    projectId,
    status = "COMPLETE",
    startDate,
    endDate,
    excludeDeletedProjects,
  } = query;

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 200);
  const skip = (page - 1) * limit;

  if (financialAccountId && !Types.ObjectId.isValid(financialAccountId)) {
    throw new AppError(400, "Invalid Financial Account ID");
  }
  if (projectId && !Types.ObjectId.isValid(projectId)) {
    throw new AppError(400, "Invalid Project ID");
  }

  // ---- project level match ----
  const projectMatch: Record<string, unknown> = {};
  if (projectId) projectMatch._id = new Types.ObjectId(projectId);
  if (excludeDeletedProjects === "true") projectMatch.isDeleted = false;

  // ---- payment level match ----
  const paymentMatch: Record<string, unknown> = {
    "payments.financialAccountId": financialAccountId
      ? new Types.ObjectId(financialAccountId)
      : { $ne: null },
  };

  if (status !== "ALL") {
    paymentMatch["payments.status"] = status;
  }

  if (startDate || endDate) {
    const range =
      startDate && endDate
        ? {
            $gte: getDayBoundariesUTC(startDate).start,
            $lte: getDayBoundariesUTC(endDate).end,
          }
        : (() => {
            const { start, end } = getDayBoundariesUTC((startDate || endDate)!);
            return { $gte: start, $lte: end };
          })();
    paymentMatch["payments.date"] = range;
  }

  const [agg] = await Project.aggregate([
    { $match: projectMatch },
    { $unwind: "$payments" },
    { $match: paymentMatch },

    // account info
    {
      $lookup: {
        from: "financialaccounts",
        localField: "payments.financialAccountId",
        foreignField: "_id",
        as: "account",
      },
    },
    { $unwind: { path: "$account", preserveNullAndEmptyArrays: true } },

    // client info
    {
      $lookup: {
        from: "clients",
        localField: "client",
        foreignField: "_id",
        as: "clientDoc",
      },
    },
    { $unwind: { path: "$clientDoc", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        _id: 0,
        paymentId: "$payments._id",
        amount: "$payments.amount",
        date: "$payments.date",
        status: "$payments.status",
        note: "$payments.note",
        project: {
          _id: "$_id",
          name: "$name",
          isDeleted: "$isDeleted",
        },
        client: {
          _id: "$clientDoc._id",
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$clientDoc.firstName", ""] },
                  " ",
                  { $ifNull: ["$clientDoc.lastName", ""] },
                ],
              },
            },
          },
        },
        account: {
          _id: "$account._id",
          accountName: "$account.accountName",
          accountType: "$account.accountType",
          currentBalance: "$account.currentBalance",
        },
      },
    },

    {
      $facet: {
        data: [
          { $sort: { date: -1, paymentId: -1 } },
          { $skip: skip },
          { $limit: limit },
        ],
        total: [{ $count: "count" }],
        summary: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
              totalPayments: { $sum: 1 },
            },
          },
        ],
        byAccount: [
          {
            $group: {
              _id: "$account._id",
              accountName: { $first: "$account.accountName" },
              accountType: { $first: "$account.accountType" },
              currentBalance: { $first: "$account.currentBalance" },
              totalReceived: { $sum: "$amount" },
              paymentCount: { $sum: 1 },
            },
          },
          { $sort: { totalReceived: -1 } },
        ],
      },
    },
  ]);

  const total = agg?.total?.[0]?.count ?? 0;

  return {
    result: agg?.data ?? [],
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    summary: {
      totalAmount: agg?.summary?.[0]?.totalAmount ?? 0,
      totalPayments: agg?.summary?.[0]?.totalPayments ?? 0,
    },
    byAccount: agg?.byAccount ?? [],
  };
};

const updateFinancialAccount = async (
  id: string,
  payload: Partial<IFinancialAccount>,
  userId: string,
) => {
  const account = await FinancialAccount.findOne({ _id: id, isDeleted: false });
  if (!account) {
    throw new AppError(404, "Financial account not found");
  }

  await assertOwnerExists(payload.ownerId?.toString());

  // balance এখানে সরাসরি বদলানো যাবে না, ওটা শুধু expense/payment/transfer দিয়ে বদলায়
  const { currentBalance, ...safePayload } = payload;

  const result = await FinancialAccount.findByIdAndUpdate(
    id,
    { ...safePayload, updatedBy: userId },
    { new: true, runValidators: true },
  ).populate(ownerPopulate);

  return result;
};

const deleteFinancialAccount = async (id: string, userId: string) => {
  const account = await FinancialAccount.findOne({ _id: id, isDeleted: false });
  if (!account) {
    throw new AppError(404, "Financial account not found");
  }

  const result = await FinancialAccount.findByIdAndUpdate(
    id,
    {
      isDeleted: true,
      deletedBy: userId,
      deletedAt: new Date(),
    },
    { new: true },
  );

  return result;
};


export const FinancialAccountService = {
  createFinancialAccount,
  getAllFinancialAccounts,
  getSingleFinancialAccount,
  getFinancialAccountSummary,
  updateFinancialAccount,
  deleteFinancialAccount,
  getAllPayments
};