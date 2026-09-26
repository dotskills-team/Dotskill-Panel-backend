export const ACCOUNT_TYPE = {
  CASH: "CASH",
  BANK: "BANK",
  MOBILE_BANKING: "MOBILE_BANKING",
  OTHER: "OTHER",
} as const;

export const PROVIDER_NAME = {
  BKASH: "BKASH",
  NAGAD: "NAGAD",
  ROCKET: "ROCKET",
  OTHER: "OTHER",
} as const;

export const ACCOUNT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export const FINANCIAL_ACCOUNT_SEARCHABLE_FIELDS = [
  "accountName",
  "accountNumber",
  "accountHolderName",
  "bankName",
];