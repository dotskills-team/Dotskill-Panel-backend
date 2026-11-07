import { ClientSession } from "mongoose";
import { LeaveAuditAction, DEFAULT_POLICY } from "./leave.constant";
import { ILeavePolicy } from "./leave.interface";
import { LeaveAuditLog, LeavePolicy } from "./leave.model";

/** Returns the singleton policy, creating it with defaults on first use. */
const getPolicy = async (session?: ClientSession) => {
  const existing = await LeavePolicy.findOne({ key: "singleton" }).session(session ?? null);
  if (existing) return existing;

  try {
    const [created] = await LeavePolicy.create([{ key: "singleton", ...DEFAULT_POLICY }], {
      session,
    });
    return created;
  } catch (error) {
    // Two requests created it at the same time; the unique index rejected the second.
    const again = await LeavePolicy.findOne({ key: "singleton" }).session(session ?? null);
    if (again) return again;
    throw error;
  }
};

const updatePolicy = async (payload: Partial<ILeavePolicy>, userId: string) => {
  const policy = await getPolicy();
  const before = policy.toObject();

  // Over-balance requests are always allowed (business rule), whatever the client sends.
  const { allowOverBalanceRequest: _ignored, key: _key, ...safe } = payload;
  void _ignored;
  void _key;

  policy.set({ ...safe, allowOverBalanceRequest: true, updatedBy: userId });
  await policy.save();

  await LeaveAuditLog.create({
    action: LeaveAuditAction.POLICY_UPDATED,
    performedBy: userId,
    before,
    after: policy.toObject(),
  });

  return policy;
};

export const LeavePolicyService = { getPolicy, updatePolicy };
