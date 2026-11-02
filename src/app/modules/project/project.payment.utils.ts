import { IPayment, PaymentStatus, ProjectPaymentState } from "./project.interface";

/**
 * Single source of truth for project payment figures.
 *
 * - Received: every payment line with status COMPLETE or ADVANCED
 *   (advance payments and maintenance fees both count as received).
 * - Outstanding: max(0, budget - received), per project.
 * - Overpaid: max(0, received - budget), per project.
 * - Payment state: DUE / PARTIAL / PAID, or NO_BUDGET when the project has no budget.
 */

export const RECEIVED_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.COMPLETE,
  PaymentStatus.ADVANCED,
];

export interface PaymentSummary {
  paymentStatus: ProjectPaymentState;
  receivedAmount: number;
  outstandingAmount: number;
  overpaidAmount: number;
  hasAdvance: boolean;
}

export const isReceivedPayment = (payment: { status?: string }) =>
  RECEIVED_PAYMENT_STATUSES.includes(payment.status as PaymentStatus);

export const isAdvancePayment = (payment: { status?: string; isAdvance?: boolean }) =>
  payment.isAdvance === true || payment.status === PaymentStatus.ADVANCED;

export const computePaymentSummary = (
  payments: Partial<IPayment>[] = [],
  budget?: number | null,
): PaymentSummary => {
  let receivedAmount = 0;
  let hasAdvance = false;

  for (const payment of payments) {
    if (isReceivedPayment(payment)) {
      receivedAmount += Number(payment.amount) || 0;
    }
    if (isAdvancePayment(payment)) {
      hasAdvance = true;
    }
  }

  const hasBudget = Number(budget) > 0;
  const value = hasBudget ? Number(budget) : 0;

  const outstandingAmount = hasBudget ? Math.max(0, value - receivedAmount) : 0;
  const overpaidAmount = hasBudget ? Math.max(0, receivedAmount - value) : 0;

  let paymentStatus: ProjectPaymentState;
  if (!hasBudget) {
    paymentStatus = ProjectPaymentState.NO_BUDGET;
  } else if (receivedAmount <= 0) {
    paymentStatus = ProjectPaymentState.DUE;
  } else if (receivedAmount < value) {
    paymentStatus = ProjectPaymentState.PARTIAL;
  } else {
    paymentStatus = ProjectPaymentState.PAID;
  }

  return {
    paymentStatus,
    receivedAmount,
    outstandingAmount,
    overpaidAmount,
    hasAdvance,
  };
};
